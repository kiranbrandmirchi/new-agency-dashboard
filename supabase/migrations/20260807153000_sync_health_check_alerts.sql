-- Zero-fetch sync alerts: log table + detection RPC + daily cron.

CREATE TABLE IF NOT EXISTS public.sync_alert_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checked_date date NOT NULL,
  agency_id uuid NOT NULL REFERENCES public.agencies(id),
  platform text NOT NULL,
  customer_id text NOT NULL,
  alerted_at timestamptz NOT NULL DEFAULT now(),
  detail jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS sync_alert_log_dedupe_idx
  ON public.sync_alert_log (
    checked_date,
    agency_id,
    platform,
    (replace(customer_id, '-', ''))
  );

CREATE INDEX IF NOT EXISTS sync_alert_log_checked_date_idx
  ON public.sync_alert_log (checked_date DESC);

ALTER TABLE public.sync_alert_log ENABLE ROW LEVEL SECURITY;

-- Service role / backend reads & writes; authenticated super admins may read.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sync_alert_log'
      AND policyname = 'Super admin reads sync_alert_log'
  ) THEN
    CREATE POLICY "Super admin reads sync_alert_log"
      ON public.sync_alert_log
      FOR SELECT
      TO authenticated
      USING (public.is_super_admin());
  END IF;
END
$$;

GRANT SELECT ON public.sync_alert_log TO authenticated;
GRANT ALL ON public.sync_alert_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.sync_alert_log_id_seq TO service_role;

COMMENT ON TABLE public.sync_alert_log IS
  'Deduped daily zero-fetch sync alerts (missing yesterday metrics for recently-active accounts).';

-- ---------------------------------------------------------------------------
-- Detect active CPAs with no metric rows on p_check_date but activity in
-- the prior 14 days (p_check_date - 14 .. p_check_date - 1).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_sync_zero_fetch_accounts(
  p_check_date date DEFAULT ((CURRENT_DATE - 1))
)
RETURNS TABLE (
  agency_id uuid,
  agency_name text,
  platform text,
  customer_id text,
  account_name text,
  last_data_day date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT
      p_check_date AS check_date,
      (p_check_date - 14)::date AS lookback_from,
      (p_check_date - 1)::date AS lookback_to
  ),
  cpa AS (
    SELECT
      a.id AS agency_id,
      a.agency_name,
      c.platform,
      c.platform_customer_id AS customer_id,
      c.account_name,
      replace(c.platform_customer_id, '-', '') AS cid_norm
    FROM public.client_platform_accounts c
    JOIN public.agencies a ON a.id = c.agency_id
    WHERE c.is_active = true
      AND c.platform IN ('google_ads', 'facebook', 'bing', 'reddit', 'tiktok', 'ga4')
  ),
  -- Yesterday presence per platform (normalized customer id)
  y_gads AS (
    SELECT DISTINCT replace(customer_id, '-', '') AS cid_norm
    FROM public.gads_campaign_daily, bounds b
    WHERE date = b.check_date
  ),
  y_fb AS (
    SELECT DISTINCT replace(customer_id, '-', '') AS cid_norm
    FROM public.fb_campaign_daily, bounds b
    WHERE report_date = b.check_date
  ),
  y_bing AS (
    SELECT DISTINCT replace(customer_id, '-', '') AS cid_norm
    FROM public.bing_campaign_daily, bounds b
    WHERE report_date = b.check_date
  ),
  y_reddit AS (
    SELECT DISTINCT replace(customer_id, '-', '') AS cid_norm
    FROM public.reddit_campaign_daily, bounds b
    WHERE report_date = b.check_date
  ),
  y_tiktok AS (
    SELECT DISTINCT replace(customer_id, '-', '') AS cid_norm
    FROM public.tiktok_campaign_daily, bounds b
    WHERE report_date = b.check_date
  ),
  y_ga4 AS (
    SELECT DISTINCT replace(replace(customer_id, 'properties/', ''), '-', '') AS cid_norm
    FROM public.ga4_daily_summary, bounds b
    WHERE report_date = b.check_date
  ),
  -- Prior 14-day activity (before check_date)
  h_gads AS (
    SELECT replace(customer_id, '-', '') AS cid_norm, MAX(date) AS last_day
    FROM public.gads_campaign_daily, bounds b
    WHERE date BETWEEN b.lookback_from AND b.lookback_to
    GROUP BY 1
  ),
  h_fb AS (
    SELECT replace(customer_id, '-', '') AS cid_norm, MAX(report_date) AS last_day
    FROM public.fb_campaign_daily, bounds b
    WHERE report_date BETWEEN b.lookback_from AND b.lookback_to
    GROUP BY 1
  ),
  h_bing AS (
    SELECT replace(customer_id, '-', '') AS cid_norm, MAX(report_date) AS last_day
    FROM public.bing_campaign_daily, bounds b
    WHERE report_date BETWEEN b.lookback_from AND b.lookback_to
    GROUP BY 1
  ),
  h_reddit AS (
    SELECT replace(customer_id, '-', '') AS cid_norm, MAX(report_date) AS last_day
    FROM public.reddit_campaign_daily, bounds b
    WHERE report_date BETWEEN b.lookback_from AND b.lookback_to
    GROUP BY 1
  ),
  h_tiktok AS (
    SELECT replace(customer_id, '-', '') AS cid_norm, MAX(report_date) AS last_day
    FROM public.tiktok_campaign_daily, bounds b
    WHERE report_date BETWEEN b.lookback_from AND b.lookback_to
    GROUP BY 1
  ),
  h_ga4 AS (
    SELECT replace(replace(customer_id, 'properties/', ''), '-', '') AS cid_norm,
           MAX(report_date) AS last_day
    FROM public.ga4_daily_summary, bounds b
    WHERE report_date BETWEEN b.lookback_from AND b.lookback_to
    GROUP BY 1
  )
  SELECT
    c.agency_id,
    c.agency_name,
    c.platform,
    c.customer_id,
    c.account_name,
    CASE c.platform
      WHEN 'google_ads' THEN h_gads.last_day
      WHEN 'facebook' THEN h_fb.last_day
      WHEN 'bing' THEN h_bing.last_day
      WHEN 'reddit' THEN h_reddit.last_day
      WHEN 'tiktok' THEN h_tiktok.last_day
      WHEN 'ga4' THEN h_ga4.last_day
    END AS last_data_day
  FROM cpa c
  LEFT JOIN y_gads ON c.platform = 'google_ads' AND y_gads.cid_norm = c.cid_norm
  LEFT JOIN y_fb ON c.platform = 'facebook' AND y_fb.cid_norm = c.cid_norm
  LEFT JOIN y_bing ON c.platform = 'bing' AND y_bing.cid_norm = c.cid_norm
  LEFT JOIN y_reddit ON c.platform = 'reddit' AND y_reddit.cid_norm = c.cid_norm
  LEFT JOIN y_tiktok ON c.platform = 'tiktok' AND y_tiktok.cid_norm = c.cid_norm
  LEFT JOIN y_ga4 ON c.platform = 'ga4'
    AND y_ga4.cid_norm = replace(replace(c.customer_id, 'properties/', ''), '-', '')
  LEFT JOIN h_gads ON c.platform = 'google_ads' AND h_gads.cid_norm = c.cid_norm
  LEFT JOIN h_fb ON c.platform = 'facebook' AND h_fb.cid_norm = c.cid_norm
  LEFT JOIN h_bing ON c.platform = 'bing' AND h_bing.cid_norm = c.cid_norm
  LEFT JOIN h_reddit ON c.platform = 'reddit' AND h_reddit.cid_norm = c.cid_norm
  LEFT JOIN h_tiktok ON c.platform = 'tiktok' AND h_tiktok.cid_norm = c.cid_norm
  LEFT JOIN h_ga4 ON c.platform = 'ga4'
    AND h_ga4.cid_norm = replace(replace(c.customer_id, 'properties/', ''), '-', '')
  WHERE
    -- Missing yesterday
    CASE c.platform
      WHEN 'google_ads' THEN y_gads.cid_norm IS NULL
      WHEN 'facebook' THEN y_fb.cid_norm IS NULL
      WHEN 'bing' THEN y_bing.cid_norm IS NULL
      WHEN 'reddit' THEN y_reddit.cid_norm IS NULL
      WHEN 'tiktok' THEN y_tiktok.cid_norm IS NULL
      WHEN 'ga4' THEN y_ga4.cid_norm IS NULL
      ELSE false
    END
    -- And had activity in prior 14 days
    AND CASE c.platform
      WHEN 'google_ads' THEN h_gads.cid_norm IS NOT NULL
      WHEN 'facebook' THEN h_fb.cid_norm IS NOT NULL
      WHEN 'bing' THEN h_bing.cid_norm IS NOT NULL
      WHEN 'reddit' THEN h_reddit.cid_norm IS NOT NULL
      WHEN 'tiktok' THEN h_tiktok.cid_norm IS NOT NULL
      WHEN 'ga4' THEN h_ga4.cid_norm IS NOT NULL
      ELSE false
    END
  ORDER BY c.agency_name, c.platform, c.account_name;
$$;

ALTER FUNCTION public.find_sync_zero_fetch_accounts(date) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.find_sync_zero_fetch_accounts(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_sync_zero_fetch_accounts(date) TO authenticated;

COMMENT ON FUNCTION public.find_sync_zero_fetch_accounts(date) IS
  'Returns active platform accounts with no rows on check_date but activity in the prior 14 days.';

-- ---------------------------------------------------------------------------
-- Schedule health-check after nightly syncs (07:30 UTC).
-- Prefers vault service_role_key; falls back to anon_key (function still
-- requires Bearer = SUPABASE_SERVICE_ROLE_KEY or CRON_SECRET).
-- ---------------------------------------------------------------------------
DO $cron$
DECLARE
  v_cmd text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — schedule sync-health-check-daily manually';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-health-check-daily') THEN
    PERFORM cron.unschedule('sync-health-check-daily');
  END IF;

  v_cmd := $cmd$
SELECT net.http_post(
  url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url')
         || '/functions/v1/sync-health-check',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || COALESCE(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key')
    )
  ),
  body := '{}'::jsonb
);
$cmd$;

  PERFORM cron.schedule(
    'sync-health-check-daily',
    '30 7 * * *',
    v_cmd
  );
END
$cron$;
