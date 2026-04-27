-- TikTok daily metrics cron driver (mirrors public.fb_metrics_sync_all).
-- tiktok-full-sync only applies explicit date_from/date_to when mode = 'backfill'.

CREATE OR REPLACE FUNCTION public.tt_metrics_sync_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_url text;
  v_anon_key text;
  v_rec record;
  v_date date;
  v_body text;
  v_headers jsonb;
BEGIN
  SELECT decrypted_secret INTO v_project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;

  IF v_project_url IS NULL OR v_anon_key IS NULL THEN
    RAISE WARNING 'tt_metrics_sync_all: missing vault secrets project_url or anon_key';
    RETURN;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_anon_key
  );

  FOR v_rec IN
    SELECT cpa.platform_customer_id
    FROM client_platform_accounts cpa
    WHERE cpa.platform = 'tiktok'
      AND cpa.is_active = true
  LOOP
    FOR v_date IN
      SELECT generate_series(
        (current_date - interval '5 days')::date,
        (current_date - interval '1 day')::date,
        '1 day'::interval
      )::date
    LOOP
      v_body := jsonb_build_object(
        'customer_id', v_rec.platform_customer_id,
        'mode', 'backfill',
        'date_from', v_date::text,
        'date_to', v_date::text
      )::text;

      PERFORM net.http_post(
        url := v_project_url || '/functions/v1/tiktok-full-sync',
        headers := v_headers,
        body := v_body::jsonb
      );
    END LOOP;
  END LOOP;
END;
$$;

ALTER FUNCTION public.tt_metrics_sync_all() OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.tt_metrics_sync_all() TO anon;
GRANT EXECUTE ON FUNCTION public.tt_metrics_sync_all() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tt_metrics_sync_all() TO service_role;
