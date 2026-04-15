


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."can_access_customer"("p_customer_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_super_admin = true
    )
    OR EXISTS (
      SELECT 1 FROM user_profiles up
      JOIN roles r ON r.id = up.role_id
      WHERE up.id = auth.uid()
        AND r.role_name IN ('admin', 'manager', 'super_admin')
        AND up.agency_id IN (
          SELECT cpa.agency_id
          FROM client_platform_accounts cpa
          WHERE cpa.platform_customer_id = p_customer_id
            AND cpa.is_active = true
        )
    )
    OR EXISTS (
      SELECT 1 FROM user_clients uc
      JOIN client_platform_accounts cpa ON cpa.id = uc.client_id
      WHERE uc.user_id = auth.uid()
        AND cpa.platform_customer_id = p_customer_id
        AND cpa.is_active = true
    );

$$;


ALTER FUNCTION "public"."can_access_customer"("p_customer_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."classify_ghl_lead_type"("p_source" "text", "p_medium" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF p_source ILIKE '%chat widget%' OR p_medium = 'chat_widget' THEN RETURN 'Chat'; END IF;
  IF p_source ~ '\(\d{3}\)\s?\d{3}-\d{4}' OR p_source ILIKE '%number pool%'
     OR p_source ILIKE '%missed call%' OR p_source ILIKE '%call%' THEN RETURN 'Call'; END IF;
  IF p_source ILIKE '%form%' OR p_medium ILIKE '%form%' OR p_source ILIKE '%survey%' THEN RETURN 'Form'; END IF;
  IF p_source ILIKE '%sms%' OR p_source ILIKE '%text%' OR p_medium = 'sms' THEN RETURN 'SMS'; END IF;
  IF p_source ILIKE '%facebook%' OR p_source ILIKE '%instagram%' THEN RETURN 'Social Message'; END IF;
  IF p_source IS NULL AND p_medium IS NULL THEN RETURN 'Unknown'; END IF;
  RETURN 'Other';
END; $$;


ALTER FUNCTION "public"."classify_ghl_lead_type"("p_source" "text", "p_medium" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_orphaned_fb_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fb_campaign_daily','fb_adset_daily','fb_ad_daily','fb_placement_daily','fb_customers']
  LOOP
    EXECUTE format(
      'DELETE FROM %I WHERE customer_id NOT IN (
        SELECT platform_customer_id FROM client_platform_accounts
        WHERE platform = ''facebook'' AND is_active = true
      )', t);
  END LOOP;
END;

$$;


ALTER FUNCTION "public"."cleanup_orphaned_fb_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_orphaned_gads_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM gads_campaign_daily WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM gads_campaign_status WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM gads_adgroup_daily WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM gads_adgroup_status WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM gads_keyword_daily WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM gads_keyword_status WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM gads_search_term_daily WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM gads_conversion_daily WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM gads_conversion_actions WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM gads_geo_location_daily WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM gads_customers WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
  DELETE FROM sync_log WHERE REPLACE(customer_id,'-','') NOT IN (SELECT REPLACE(platform_customer_id,'-','') FROM client_platform_accounts WHERE platform='google_ads' AND is_active=true);
END;

$$;


ALTER FUNCTION "public"."cleanup_orphaned_gads_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_orphaned_reddit_data"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  DELETE FROM reddit_campaign_daily WHERE customer_id NOT IN (
    SELECT platform_customer_id FROM client_platform_accounts
    WHERE platform='reddit' AND is_active=true);
  DELETE FROM reddit_placement_daily WHERE customer_id NOT IN (
    SELECT platform_customer_id FROM client_platform_accounts
    WHERE platform='reddit' AND is_active=true);
  DELETE FROM reddit_customers WHERE customer_id NOT IN (
    SELECT platform_customer_id FROM client_platform_accounts
    WHERE platform='reddit' AND is_active=true);
END;

$$;


ALTER FUNCTION "public"."cleanup_orphaned_reddit_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fb_metrics_sync_all"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_project_url text;
  v_anon_key text;
  v_rec record;
  v_date date;
  v_body text;
  v_headers jsonb;
BEGIN
  -- Get secrets from vault (same as gads/reddit pattern)
  SELECT decrypted_secret INTO v_project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;

  IF v_project_url IS NULL OR v_anon_key IS NULL THEN
    RAISE WARNING 'fb_metrics_sync_all: missing vault secrets project_url or anon_key';
    RETURN;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_anon_key
  );

  -- Loop active Facebook accounts
  FOR v_rec IN
    SELECT cpa.platform_customer_id
    FROM client_platform_accounts cpa
    WHERE cpa.platform = 'facebook'
      AND cpa.is_active = true
  LOOP
    -- Sync last 5 days
    FOR v_date IN
      SELECT generate_series(
        (current_date - interval '5 days')::date,
        (current_date - interval '1 day')::date,
        '1 day'::interval
      )::date
    LOOP
      v_body := jsonb_build_object(
        'customer_id', v_rec.platform_customer_id,
        'mode', 'daily',
        'date_from', v_date::text,
        'date_to', v_date::text
      )::text;

      PERFORM net.http_post(
        url := v_project_url || '/functions/v1/fb-full-sync',
        headers := v_headers,
        body := v_body::jsonb
      );
    END LOOP;
  END LOOP;
END;

$$;


ALTER FUNCTION "public"."fb_metrics_sync_all"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ga4_advanced_report"("p_customer_id" "text", "p_report_month" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_from DATE;
  v_to DATE;
  v_pagetypes JSONB;
  v_pagetypes_drilldown JSONB;
  v_vdp_channel JSONB;
  v_vdp_campaign_google JSONB;
  v_vdp_condition JSONB;
  v_vdp_make JSONB;
  v_vdp_model JSONB;
  v_vdp_rvtype JSONB;
BEGIN
  SET LOCAL statement_timeout = '15s';

  v_from := (p_report_month || '-01')::date;
  v_to := (v_from + interval '1 month' - interval '1 day')::date;
  IF v_to > CURRENT_DATE - 1 THEN
    v_to := CURRENT_DATE - 1;
  END IF;

  -- PAGETYPES
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'page_type', t.page_type, 'page_views', t.page_views,
    'total_users', t.total_users, 'sessions', t.sessions,
    'pct_views', ROUND(t.page_views::numeric / NULLIF(t.total_views, 0) * 100, 2)
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_pagetypes
  FROM (
    SELECT COALESCE(page_type, 'Unclassified') AS page_type,
           SUM(page_views) AS page_views, SUM(total_users) AS total_users,
           SUM(sessions) AS sessions, SUM(SUM(page_views)) OVER () AS total_views
    FROM ga4_raw
    WHERE customer_id = p_customer_id AND report_date BETWEEN v_from AND v_to
    GROUP BY COALESCE(page_type, 'Unclassified')
  ) t;

  -- PAGETYPES_DRILLDOWN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'page_type', t.page_type, 'total_views', t.total_views, 'pages', t.pages
  ) ORDER BY t.total_views DESC), '[]'::jsonb) INTO v_pagetypes_drilldown
  FROM (
    SELECT page_type, SUM(page_views) AS total_views,
           jsonb_agg(jsonb_build_object(
             'page_path', page_path, 'page_title', page_title,
             'page_views', page_views, 'total_users', total_users, 'sessions', sessions
           ) ORDER BY page_views DESC) AS pages
    FROM (
      SELECT COALESCE(page_type, 'Unclassified') AS page_type, page_path,
             MAX(page_title) AS page_title,
             SUM(page_views) AS page_views, SUM(total_users) AS total_users, SUM(sessions) AS sessions
      FROM ga4_raw
      WHERE customer_id = p_customer_id AND report_date BETWEEN v_from AND v_to
      GROUP BY COALESCE(page_type, 'Unclassified'), page_path
    ) sub
    GROUP BY page_type
  ) t;

  -- VDP_CHANNEL
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'channel_group', t.channel_group, 'page_views', t.page_views,
    'unique_vdps', t.unique_vdps,
    'avg_views', ROUND(t.page_views::numeric / NULLIF(t.unique_vdps, 0), 2)
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_channel
  FROM (
    SELECT COALESCE(channel_group, 'Unknown') AS channel_group,
           SUM(page_views) AS page_views, COUNT(DISTINCT page_path) AS unique_vdps
    FROM ga4_raw
    WHERE customer_id = p_customer_id AND report_date BETWEEN v_from AND v_to
      AND page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY COALESCE(channel_group, 'Unknown')
  ) t;

  -- VDP_CAMPAIGN_GOOGLE
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'campaign_name', t.campaign_name, 'channel_group', t.channel_group,
    'source_medium', t.source_medium, 'page_views', t.page_views,
    'unique_vdps', t.unique_vdps,
    'avg_views', ROUND(t.page_views::numeric / NULLIF(t.unique_vdps, 0), 2)
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_campaign_google
  FROM (
    SELECT COALESCE(campaign_name, '(not set)') AS campaign_name,
           COALESCE(channel_group, 'Unknown') AS channel_group,
           COALESCE(source_medium, '') AS source_medium,
           SUM(page_views) AS page_views, COUNT(DISTINCT page_path) AS unique_vdps
    FROM ga4_raw
    WHERE customer_id = p_customer_id AND report_date BETWEEN v_from AND v_to
      AND page_type IN ('VDP_New', 'VDP_Used')
      AND LOWER(channel_group) = 'paid search'
      AND LOWER(COALESCE(source, '')) NOT LIKE '%bing%'
      AND LOWER(COALESCE(source, '')) NOT LIKE '%microsoft%'
    GROUP BY campaign_name, channel_group, source_medium
  ) t;

  -- VDP_CONDITION
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_condition', t.item_condition, 'page_views', t.page_views,
    'total_users', t.total_users, 'sessions', t.sessions
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_condition
  FROM (
    SELECT COALESCE(page_type, 'Unknown') AS item_condition,
           SUM(page_views) AS page_views, SUM(total_users) AS total_users, SUM(sessions) AS sessions
    FROM ga4_raw
    WHERE customer_id = p_customer_id AND report_date BETWEEN v_from AND v_to
      AND page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY page_type
  ) t;

  -- VDP_MAKE
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_make', t.item_make, 'page_views', t.page_views,
    'unique_vdps', t.unique_vdps,
    'avg_views', ROUND(t.page_views::numeric / NULLIF(t.unique_vdps, 0), 2)
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_make
  FROM (
    SELECT COALESCE(cp.item_make, 'Unknown') AS item_make,
           SUM(r.page_views) AS page_views, COUNT(DISTINCT r.page_path) AS unique_vdps
    FROM ga4_raw r
    LEFT JOIN ga4_classified_pages cp ON cp.customer_id = r.customer_id AND cp.page_path = r.page_path
    WHERE r.customer_id = p_customer_id AND r.report_date BETWEEN v_from AND v_to
      AND r.page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY COALESCE(cp.item_make, 'Unknown')
  ) t;

  -- VDP_MODEL
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_make', t.item_make, 'item_model', t.item_model,
    'page_views', t.page_views, 'unique_vdps', t.unique_vdps
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_model
  FROM (
    SELECT COALESCE(cp.item_make, 'Unknown') AS item_make,
           COALESCE(cp.item_model, 'Unknown') AS item_model,
           SUM(r.page_views) AS page_views, COUNT(DISTINCT r.page_path) AS unique_vdps
    FROM ga4_raw r
    LEFT JOIN ga4_classified_pages cp ON cp.customer_id = r.customer_id AND cp.page_path = r.page_path
    WHERE r.customer_id = p_customer_id AND r.report_date BETWEEN v_from AND v_to
      AND r.page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY COALESCE(cp.item_make, 'Unknown'), COALESCE(cp.item_model, 'Unknown')
  ) t;

  -- VDP_RVTYPE
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rv_type', t.rv_type, 'page_views', t.page_views, 'unique_vdps', t.unique_vdps
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_rvtype
  FROM (
    SELECT COALESCE(cp.rv_type, 'Unknown') AS rv_type,
           SUM(r.page_views) AS page_views, COUNT(DISTINCT r.page_path) AS unique_vdps
    FROM ga4_raw r
    LEFT JOIN ga4_classified_pages cp ON cp.customer_id = r.customer_id AND cp.page_path = r.page_path
    WHERE r.customer_id = p_customer_id AND r.report_date BETWEEN v_from AND v_to
      AND r.page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY COALESCE(cp.rv_type, 'Unknown')
  ) t;

  RETURN jsonb_build_object(
    'pagetypes', v_pagetypes,
    'pagetypes_drilldown', v_pagetypes_drilldown,
    'vdp_channel', v_vdp_channel,
    'vdp_campaign_google', v_vdp_campaign_google,
    'vdp_condition', v_vdp_condition,
    'vdp_make', v_vdp_make,
    'vdp_model', v_vdp_model,
    'vdp_rvtype', v_vdp_rvtype
  );
END;

$$;


ALTER FUNCTION "public"."ga4_advanced_report"("p_customer_id" "text", "p_report_month" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ga4_advanced_report"("p_customer_id" "text", "p_date_from" "date", "p_date_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_pagetypes JSONB;
  v_pagetypes_drilldown JSONB;
  v_vdp_channel JSONB;
  v_vdp_campaign_google JSONB;
  v_vdp_condition JSONB;
  v_vdp_make JSONB;
  v_vdp_model JSONB;
  v_vdp_rvtype JSONB;
  v_vdp_daily JSONB;
BEGIN
  SET LOCAL statement_timeout = '15s';

  -- PAGETYPES
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'page_type', t.page_type, 'page_views', t.page_views,
    'total_users', t.total_users, 'sessions', t.sessions,
    'pct_views', ROUND(t.page_views::numeric / NULLIF(t.total_views, 0) * 100, 2)
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_pagetypes
  FROM (
    SELECT COALESCE(page_type, 'Unclassified') AS page_type,
           SUM(page_views) AS page_views, SUM(total_users) AS total_users,
           SUM(sessions) AS sessions, SUM(SUM(page_views)) OVER () AS total_views
    FROM ga4_raw
    WHERE customer_id = p_customer_id AND report_date BETWEEN p_date_from AND p_date_to
    GROUP BY COALESCE(page_type, 'Unclassified')
  ) t;

  -- PAGETYPES_DRILLDOWN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'page_type', t.page_type, 'total_views', t.total_views, 'pages', t.pages
  ) ORDER BY t.total_views DESC), '[]'::jsonb) INTO v_pagetypes_drilldown
  FROM (
    SELECT page_type, SUM(page_views) AS total_views,
           jsonb_agg(jsonb_build_object(
             'page_path', page_path, 'page_title', page_title,
             'page_views', page_views, 'total_users', total_users, 'sessions', sessions
           ) ORDER BY page_views DESC) AS pages
    FROM (
      SELECT COALESCE(page_type, 'Unclassified') AS page_type, page_path,
             MAX(page_title) AS page_title,
             SUM(page_views) AS page_views, SUM(total_users) AS total_users, SUM(sessions) AS sessions
      FROM ga4_raw
      WHERE customer_id = p_customer_id AND report_date BETWEEN p_date_from AND p_date_to
      GROUP BY COALESCE(page_type, 'Unclassified'), page_path
    ) sub
    GROUP BY page_type
  ) t;

  -- VDP_CHANNEL
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'channel_group', t.channel_group, 'page_views', t.page_views,
    'unique_vdps', t.unique_vdps,
    'avg_views', ROUND(t.page_views::numeric / NULLIF(t.unique_vdps, 0), 2)
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_channel
  FROM (
    SELECT COALESCE(channel_group, 'Unknown') AS channel_group,
           SUM(page_views) AS page_views, COUNT(DISTINCT page_path) AS unique_vdps
    FROM ga4_raw
    WHERE customer_id = p_customer_id AND report_date BETWEEN p_date_from AND p_date_to
      AND page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY COALESCE(channel_group, 'Unknown')
  ) t;

  -- VDP_CAMPAIGN_GOOGLE
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'campaign_name', t.campaign_name, 'channel_group', t.channel_group,
    'source_medium', t.source_medium, 'page_views', t.page_views,
    'unique_vdps', t.unique_vdps,
    'avg_views', ROUND(t.page_views::numeric / NULLIF(t.unique_vdps, 0), 2)
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_campaign_google
  FROM (
    SELECT COALESCE(campaign_name, '(not set)') AS campaign_name,
           COALESCE(channel_group, 'Unknown') AS channel_group,
           COALESCE(source_medium, '') AS source_medium,
           SUM(page_views) AS page_views, COUNT(DISTINCT page_path) AS unique_vdps
    FROM ga4_raw
    WHERE customer_id = p_customer_id AND report_date BETWEEN p_date_from AND p_date_to
      AND page_type IN ('VDP_New', 'VDP_Used')
      AND LOWER(channel_group) = 'paid search'
      AND LOWER(COALESCE(source, '')) NOT LIKE '%bing%'
      AND LOWER(COALESCE(source, '')) NOT LIKE '%microsoft%'
    GROUP BY campaign_name, channel_group, source_medium
  ) t;

  -- VDP_CONDITION
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_condition', t.item_condition, 'page_views', t.page_views,
    'total_users', t.total_users, 'sessions', t.sessions
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_condition
  FROM (
    SELECT COALESCE(page_type, 'Unknown') AS item_condition,
           SUM(page_views) AS page_views, SUM(total_users) AS total_users, SUM(sessions) AS sessions
    FROM ga4_raw
    WHERE customer_id = p_customer_id AND report_date BETWEEN p_date_from AND p_date_to
      AND page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY page_type
  ) t;

  -- VDP_MAKE
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_make', t.item_make, 'page_views', t.page_views,
    'unique_vdps', t.unique_vdps,
    'avg_views', ROUND(t.page_views::numeric / NULLIF(t.unique_vdps, 0), 2)
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_make
  FROM (
    SELECT COALESCE(cp.item_make, 'Unknown') AS item_make,
           SUM(r.page_views) AS page_views, COUNT(DISTINCT r.page_path) AS unique_vdps
    FROM ga4_raw r
    LEFT JOIN ga4_classified_pages cp ON cp.customer_id = r.customer_id AND cp.page_path = r.page_path
    WHERE r.customer_id = p_customer_id AND r.report_date BETWEEN p_date_from AND p_date_to
      AND r.page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY COALESCE(cp.item_make, 'Unknown')
  ) t;

  -- VDP_MODEL
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'item_make', t.item_make, 'item_model', t.item_model,
    'page_views', t.page_views, 'unique_vdps', t.unique_vdps
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_model
  FROM (
    SELECT COALESCE(cp.item_make, 'Unknown') AS item_make,
           COALESCE(cp.item_model, 'Unknown') AS item_model,
           SUM(r.page_views) AS page_views, COUNT(DISTINCT r.page_path) AS unique_vdps
    FROM ga4_raw r
    LEFT JOIN ga4_classified_pages cp ON cp.customer_id = r.customer_id AND cp.page_path = r.page_path
    WHERE r.customer_id = p_customer_id AND r.report_date BETWEEN p_date_from AND p_date_to
      AND r.page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY COALESCE(cp.item_make, 'Unknown'), COALESCE(cp.item_model, 'Unknown')
  ) t;

  -- VDP_RVTYPE
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rv_type', t.rv_type, 'page_views', t.page_views, 'unique_vdps', t.unique_vdps
  ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_vdp_rvtype
  FROM (
    SELECT COALESCE(cp.rv_type, 'Unknown') AS rv_type,
           SUM(r.page_views) AS page_views, COUNT(DISTINCT r.page_path) AS unique_vdps
    FROM ga4_raw r
    LEFT JOIN ga4_classified_pages cp ON cp.customer_id = r.customer_id AND cp.page_path = r.page_path
    WHERE r.customer_id = p_customer_id AND r.report_date BETWEEN p_date_from AND p_date_to
      AND r.page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY COALESCE(cp.rv_type, 'Unknown')
  ) t;

  -- VDP_DAILY
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'report_date', t.report_date, 'page_views', t.page_views,
    'unique_vdps', t.unique_vdps,
    'avg_views', ROUND(t.page_views::numeric / NULLIF(t.unique_vdps, 0), 2),
    'total_users', t.total_users, 'sessions', t.sessions,
    'new_vdps', t.new_vdps, 'used_vdps', t.used_vdps
  ) ORDER BY t.report_date), '[]'::jsonb) INTO v_vdp_daily
  FROM (
    SELECT report_date,
           SUM(page_views) AS page_views,
           COUNT(DISTINCT page_path) AS unique_vdps,
           SUM(total_users) AS total_users,
           SUM(sessions) AS sessions,
           SUM(CASE WHEN page_type = 'VDP_New' THEN page_views ELSE 0 END) AS new_vdps,
           SUM(CASE WHEN page_type = 'VDP_Used' THEN page_views ELSE 0 END) AS used_vdps
    FROM ga4_raw
    WHERE customer_id = p_customer_id AND report_date BETWEEN p_date_from AND p_date_to
      AND page_type IN ('VDP_New', 'VDP_Used')
    GROUP BY report_date
  ) t;

  RETURN jsonb_build_object(
    'pagetypes', v_pagetypes,
    'pagetypes_drilldown', v_pagetypes_drilldown,
    'vdp_channel', v_vdp_channel,
    'vdp_campaign_google', v_vdp_campaign_google,
    'vdp_condition', v_vdp_condition,
    'vdp_make', v_vdp_make,
    'vdp_model', v_vdp_model,
    'vdp_rvtype', v_vdp_rvtype,
    'vdp_daily', v_vdp_daily
  );
END;

$$;


ALTER FUNCTION "public"."ga4_advanced_report"("p_customer_id" "text", "p_date_from" "date", "p_date_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ga4_backfill_page_types"("p_agency_id" "uuid" DEFAULT NULL::"uuid", "p_customer_id" "text" DEFAULT NULL::"text") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE v_updated INT;
BEGIN
  UPDATE ga4_raw r
  SET page_type = cp.page_type
  FROM ga4_classified_pages cp
  WHERE cp.customer_id = r.customer_id
    AND cp.page_path = r.page_path
    AND (r.page_type IS NULL OR r.page_type != cp.page_type)
    AND (p_agency_id IS NULL OR r.agency_id = p_agency_id)
    AND (p_customer_id IS NULL OR r.customer_id = p_customer_id);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;

$$;


ALTER FUNCTION "public"."ga4_backfill_page_types"("p_agency_id" "uuid", "p_customer_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ga4_build_monthly_reports"("p_month" "text" DEFAULT "to_char"((CURRENT_DATE - '1 day'::interval), 'YYYY-MM'::"text")) RETURNS integer
    LANGUAGE "plpgsql"
    SET "statement_timeout" TO '600s'
    AS $$
DECLARE
  v_from date;
  v_to date;
  v_cust RECORD;
  v_data jsonb;
  v_count integer := 0;
BEGIN
  v_from := (p_month || '-01')::date;
  v_to := (v_from + interval '1 month' - interval '1 day')::date;
  -- Cap at yesterday if current month
  IF v_to > CURRENT_DATE - 1 THEN
    v_to := CURRENT_DATE - 1;
  END IF;

  FOR v_cust IN
    SELECT DISTINCT r.customer_id
    FROM ga4_raw r
    JOIN client_platform_accounts cpa 
      ON cpa.platform_customer_id = r.customer_id AND cpa.platform = 'ga4'
    WHERE r.report_date BETWEEN v_from AND v_to
      AND cpa.agency_id = '791536a9-5c5e-439d-93c9-6be6808012ec'
  LOOP

    -- PAGETYPES
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'page_type', t.page_type,
      'page_views', t.page_views,
      'total_users', t.total_users,
      'sessions', t.sessions,
      'pct_views', ROUND(t.page_views::numeric / NULLIF(t.total_views, 0) * 100, 2)
    ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_data
    FROM (
      SELECT COALESCE(page_type, 'Unclassified') AS page_type,
             SUM(page_views) AS page_views,
             SUM(total_users) AS total_users,
             SUM(sessions) AS sessions,
             SUM(SUM(page_views)) OVER () AS total_views
      FROM ga4_raw
      WHERE customer_id = v_cust.customer_id AND report_date BETWEEN v_from AND v_to
      GROUP BY COALESCE(page_type, 'Unclassified')
    ) t;
    INSERT INTO ga4_monthly_reports (customer_id, report_month, report_type, data)
    VALUES (v_cust.customer_id, p_month, 'pagetypes', v_data)
    ON CONFLICT (customer_id, report_month, report_type)
    DO UPDATE SET data = EXCLUDED.data, generated_at = now();

    -- PAGETYPES_DRILLDOWN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'page_type', t.page_type,
      'total_views', t.total_views,
      'pages', t.pages
    ) ORDER BY t.total_views DESC), '[]'::jsonb) INTO v_data
    FROM (
      SELECT page_type, SUM(page_views) AS total_views,
             jsonb_agg(jsonb_build_object(
               'page_path', page_path, 'page_title', page_title,
               'page_views', page_views, 'total_users', total_users, 'sessions', sessions
             ) ORDER BY page_views DESC) AS pages
      FROM (
        SELECT COALESCE(page_type, 'Unclassified') AS page_type, page_path,
               MAX(page_title) AS page_title,
               SUM(page_views) AS page_views, SUM(total_users) AS total_users, SUM(sessions) AS sessions
        FROM ga4_raw
        WHERE customer_id = v_cust.customer_id AND report_date BETWEEN v_from AND v_to
        GROUP BY COALESCE(page_type, 'Unclassified'), page_path
      ) sub
      GROUP BY page_type
    ) t;
    INSERT INTO ga4_monthly_reports (customer_id, report_month, report_type, data)
    VALUES (v_cust.customer_id, p_month, 'pagetypes_drilldown', v_data)
    ON CONFLICT (customer_id, report_month, report_type)
    DO UPDATE SET data = EXCLUDED.data, generated_at = now();

    -- VDP_CHANNEL
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'channel_group', t.channel_group, 'page_views', t.page_views,
      'unique_vdps', t.unique_vdps,
      'avg_views', ROUND(t.page_views::numeric / NULLIF(t.unique_vdps, 0), 2)
    ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_data
    FROM (
      SELECT COALESCE(channel_group, 'Unknown') AS channel_group,
             SUM(page_views) AS page_views, COUNT(DISTINCT page_path) AS unique_vdps
      FROM ga4_raw
      WHERE customer_id = v_cust.customer_id AND report_date BETWEEN v_from AND v_to
        AND page_type IN ('VDP_New', 'VDP_Used')
      GROUP BY COALESCE(channel_group, 'Unknown')
    ) t;
    INSERT INTO ga4_monthly_reports (customer_id, report_month, report_type, data)
    VALUES (v_cust.customer_id, p_month, 'vdp_channel', v_data)
    ON CONFLICT (customer_id, report_month, report_type)
    DO UPDATE SET data = EXCLUDED.data, generated_at = now();

    -- VDP_CAMPAIGN_GOOGLE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'campaign_name', t.campaign_name, 'channel_group', t.channel_group,
      'source_medium', t.source_medium, 'page_views', t.page_views,
      'unique_vdps', t.unique_vdps,
      'avg_views', ROUND(t.page_views::numeric / NULLIF(t.unique_vdps, 0), 2)
    ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_data
    FROM (
      SELECT COALESCE(campaign_name, '(not set)') AS campaign_name,
             COALESCE(channel_group, 'Unknown') AS channel_group,
             COALESCE(source_medium, '') AS source_medium,
             SUM(page_views) AS page_views, COUNT(DISTINCT page_path) AS unique_vdps
      FROM ga4_raw
      WHERE customer_id = v_cust.customer_id AND report_date BETWEEN v_from AND v_to
        AND page_type IN ('VDP_New', 'VDP_Used')
        AND LOWER(channel_group) = 'paid search'
        AND LOWER(COALESCE(source, '')) NOT LIKE '%bing%'
        AND LOWER(COALESCE(source, '')) NOT LIKE '%microsoft%'
      GROUP BY campaign_name, channel_group, source_medium
    ) t;
    INSERT INTO ga4_monthly_reports (customer_id, report_month, report_type, data)
    VALUES (v_cust.customer_id, p_month, 'vdp_campaign_google', v_data)
    ON CONFLICT (customer_id, report_month, report_type)
    DO UPDATE SET data = EXCLUDED.data, generated_at = now();

    -- VDP_CONDITION
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'item_condition', t.item_condition, 'page_views', t.page_views,
      'total_users', t.total_users, 'sessions', t.sessions
    ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_data
    FROM (
      SELECT COALESCE(page_type, 'Unknown') AS item_condition,
             SUM(page_views) AS page_views, SUM(total_users) AS total_users, SUM(sessions) AS sessions
      FROM ga4_raw
      WHERE customer_id = v_cust.customer_id AND report_date BETWEEN v_from AND v_to
        AND page_type IN ('VDP_New', 'VDP_Used')
      GROUP BY page_type
    ) t;
    INSERT INTO ga4_monthly_reports (customer_id, report_month, report_type, data)
    VALUES (v_cust.customer_id, p_month, 'vdp_condition', v_data)
    ON CONFLICT (customer_id, report_month, report_type)
    DO UPDATE SET data = EXCLUDED.data, generated_at = now();

    -- SRP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'page_path', t.page_path, 'page_title', t.page_title,
      'page_views', t.page_views, 'total_users', t.total_users, 'sessions', t.sessions
    ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_data
    FROM (
      SELECT page_path, MAX(page_title) AS page_title,
             SUM(page_views) AS page_views, SUM(total_users) AS total_users, SUM(sessions) AS sessions
      FROM ga4_raw
      WHERE customer_id = v_cust.customer_id AND report_date BETWEEN v_from AND v_to
        AND page_type = 'SRP'
      GROUP BY page_path
    ) t;
    INSERT INTO ga4_monthly_reports (customer_id, report_month, report_type, data)
    VALUES (v_cust.customer_id, p_month, 'srp', v_data)
    ON CONFLICT (customer_id, report_month, report_type)
    DO UPDATE SET data = EXCLUDED.data, generated_at = now();

    -- VDP_MAKE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'item_make', t.item_make, 'page_views', t.page_views,
      'unique_vdps', t.unique_vdps,
      'avg_views', ROUND(t.page_views::numeric / NULLIF(t.unique_vdps, 0), 2)
    ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_data
    FROM (
      SELECT COALESCE(cp.item_make, 'Unknown') AS item_make,
             SUM(r.page_views) AS page_views, COUNT(DISTINCT r.page_path) AS unique_vdps
      FROM ga4_raw r
      LEFT JOIN ga4_classified_pages cp ON cp.customer_id = r.customer_id AND cp.page_path = r.page_path
      WHERE r.customer_id = v_cust.customer_id AND r.report_date BETWEEN v_from AND v_to
        AND r.page_type IN ('VDP_New', 'VDP_Used')
      GROUP BY COALESCE(cp.item_make, 'Unknown')
    ) t;
    INSERT INTO ga4_monthly_reports (customer_id, report_month, report_type, data)
    VALUES (v_cust.customer_id, p_month, 'vdp_make', v_data)
    ON CONFLICT (customer_id, report_month, report_type)
    DO UPDATE SET data = EXCLUDED.data, generated_at = now();

    -- VDP_MODEL
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'item_make', t.item_make, 'item_model', t.item_model,
      'page_views', t.page_views, 'unique_vdps', t.unique_vdps
    ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_data
    FROM (
      SELECT COALESCE(cp.item_make, 'Unknown') AS item_make,
             COALESCE(cp.item_model, 'Unknown') AS item_model,
             SUM(r.page_views) AS page_views, COUNT(DISTINCT r.page_path) AS unique_vdps
      FROM ga4_raw r
      LEFT JOIN ga4_classified_pages cp ON cp.customer_id = r.customer_id AND cp.page_path = r.page_path
      WHERE r.customer_id = v_cust.customer_id AND r.report_date BETWEEN v_from AND v_to
        AND r.page_type IN ('VDP_New', 'VDP_Used')
      GROUP BY COALESCE(cp.item_make, 'Unknown'), COALESCE(cp.item_model, 'Unknown')
    ) t;
    INSERT INTO ga4_monthly_reports (customer_id, report_month, report_type, data)
    VALUES (v_cust.customer_id, p_month, 'vdp_model', v_data)
    ON CONFLICT (customer_id, report_month, report_type)
    DO UPDATE SET data = EXCLUDED.data, generated_at = now();

    -- VDP_RVTYPE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'rv_type', t.rv_type, 'page_views', t.page_views, 'unique_vdps', t.unique_vdps
    ) ORDER BY t.page_views DESC), '[]'::jsonb) INTO v_data
    FROM (
      SELECT COALESCE(cp.rv_type, 'Unknown') AS rv_type,
             SUM(r.page_views) AS page_views, COUNT(DISTINCT r.page_path) AS unique_vdps
      FROM ga4_raw r
      LEFT JOIN ga4_classified_pages cp ON cp.customer_id = r.customer_id AND cp.page_path = r.page_path
      WHERE r.customer_id = v_cust.customer_id AND r.report_date BETWEEN v_from AND v_to
        AND r.page_type IN ('VDP_New', 'VDP_Used')
      GROUP BY COALESCE(cp.rv_type, 'Unknown')
    ) t;
    INSERT INTO ga4_monthly_reports (customer_id, report_month, report_type, data)
    VALUES (v_cust.customer_id, p_month, 'vdp_rvtype', v_data)
    ON CONFLICT (customer_id, report_month, report_type)
    DO UPDATE SET data = EXCLUDED.data, generated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;

$$;


ALTER FUNCTION "public"."ga4_build_monthly_reports"("p_month" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ga4_classify_and_enrich"("p_agency_id" "uuid" DEFAULT NULL::"uuid", "p_customer_id" "text" DEFAULT NULL::"text") RETURNS TABLE("total_pages" integer, "classified" integer, "enriched" integer, "skipped" integer)
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
  v_rec RECORD;
  v_rule RECORD;
  v_platform TEXT;
  v_page_type TEXT;
  v_matched TEXT;
  v_total INT := 0;
  v_classified INT := 0;
  v_enriched INT := 0;
  v_skipped INT := 0;
  v_title TEXT;
  v_path TEXT;
  v_year INT;
  v_condition TEXT;
  v_make TEXT;
  v_model TEXT;
  v_floorplan TEXT;
  v_rv_type TEXT;
  v_slug TEXT;
  -- Three-word makes FIRST (order matters — longest match first)
  v_three_word_makes TEXT[] := ARRAY[
    'forest river rv','thor motor coach','highland ridge rv',
    'open range rv','modern buggy rv','prime time rv'
  ];
  v_two_word_makes TEXT[] := ARRAY[
    'grand design','forest river','keystone rv','coachmen rv',
    'alliance rv','brinkley rv','east to west','prime time',
    'cruiser rv','vanleigh rv','palomino rv','gulf stream',
    'holiday rambler','newmar corp','tiffin motorhomes',
    'pleasure way','leisure travel','roadtrek rv','north trail',
    'cross roads','heartland rv','dutchmen rv','starcraft rv',
    'shasta rvs','highland ridge','open range','modern buggy',
    'thor motor','american coach','crossroads rv'
  ];
  v_parts TEXT[];
  v_last TEXT;
BEGIN
  FOR v_rec IN
    SELECT DISTINCT ON (r.customer_id, r.page_path)
      r.customer_id, r.agency_id, r.page_path, r.page_title, r.page_location,
      COALESCE(c.website_platform, 'custom') AS website_platform
    FROM ga4_raw r
    LEFT JOIN client_platform_accounts cpa
      ON cpa.platform_customer_id = r.customer_id AND cpa.platform = 'ga4'
    LEFT JOIN clients c ON c.id = cpa.client_id
    WHERE NOT EXISTS (
      SELECT 1 FROM ga4_classified_pages cp
      WHERE cp.customer_id = r.customer_id AND cp.page_path = r.page_path
    )
    AND (p_agency_id IS NULL OR r.agency_id = p_agency_id)
    AND (p_customer_id IS NULL OR r.customer_id = p_customer_id)
    ORDER BY r.customer_id, r.page_path, r.synced_at DESC
    LIMIT 10000
  LOOP
    v_total := v_total + 1;
    v_platform := v_rec.website_platform;
    v_page_type := 'Other';
    v_matched := NULL;

    -- CLASSIFY
    FOR v_rule IN
      SELECT pr.page_type, pr.url_pattern
      FROM ga4_page_rules pr
      WHERE pr.is_active = true
        AND (
          pr.customer_id = v_rec.customer_id
          OR (pr.customer_id IS NULL AND pr.platform = v_platform)
          OR (pr.customer_id IS NULL AND pr.platform = 'custom')
        )
      ORDER BY
        CASE WHEN pr.customer_id IS NOT NULL THEN 0
             WHEN pr.platform = v_platform THEN 1
             ELSE 2
        END,
        pr.priority ASC
    LOOP
      BEGIN
        IF v_rec.page_path ~* v_rule.url_pattern THEN
          v_page_type := v_rule.page_type;
          v_matched := v_rule.url_pattern;
          EXIT;
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END LOOP;

    v_classified := v_classified + 1;

    -- ENRICH VDP pages only
    v_year := NULL; v_condition := NULL; v_make := NULL;
    v_model := NULL; v_floorplan := NULL; v_rv_type := NULL;

    IF v_page_type IN ('VDP_New','VDP_Used') THEN
      v_condition := CASE WHEN v_page_type = 'VDP_New' THEN 'New' ELSE 'Used' END;

      v_title := COALESCE(v_rec.page_title, '');
      IF v_title <> '' AND v_title <> '(not set)' THEN
        -- Strip " at DealerName..." and everything after
        v_title := regexp_replace(v_title, '\s+at\s+[A-Z].*$', '', 'i');
        -- Strip | suffix
        v_title := regexp_replace(v_title, '\s*\|.*$', '', 'i');
        v_title := trim(v_title);

        -- Remove leading condition
        v_title := regexp_replace(v_title, '^\s*(new|used|pre-owned|certified)\s+', '', 'i');
        v_title := trim(v_title);

        -- Extract year
        IF v_title ~ '^\d{4}\s' THEN
          v_year := substring(v_title from '^\d{4}')::INT;
          v_title := trim(regexp_replace(v_title, '^\d{4}\s*', ''));
        END IF;

        -- Extract RV type from end
        v_rv_type := substring(v_title from '\s+((?:Toy Hauler )?(?:Travel Trailer|Fifth Wheel|Motorhome|Motor Home Class [ABC][^$]*|Class [ABC][^$]*|Truck Camper|Pop-Up|Expandable|Destination Trailer|Park Model))\s*$');
        IF v_rv_type IS NOT NULL THEN
          v_rv_type := trim(v_rv_type);
          v_title := trim(substring(v_title from 1 for length(v_title) - length(v_rv_type)));
          v_title := trim(v_title);
        END IF;

        -- Three-word make (longest match first)
        v_make := NULL;
        FOR i IN 1..array_length(v_three_word_makes, 1) LOOP
          IF lower(v_title) LIKE v_three_word_makes[i] || '%' THEN
            v_make := initcap(v_three_word_makes[i]);
            v_title := trim(substring(v_title from length(v_three_word_makes[i]) + 1));
            EXIT;
          END IF;
        END LOOP;

        -- Two-word make
        IF v_make IS NULL THEN
          FOR i IN 1..array_length(v_two_word_makes, 1) LOOP
            IF lower(v_title) LIKE v_two_word_makes[i] || '%' THEN
              v_make := initcap(v_two_word_makes[i]);
              v_title := trim(substring(v_title from length(v_two_word_makes[i]) + 1));
              EXIT;
            END IF;
          END LOOP;
        END IF;

        -- Single-word make
        IF v_make IS NULL AND v_title ~ '^\S+\s' THEN
          v_make := initcap(split_part(v_title, ' ', 1));
          v_title := trim(regexp_replace(v_title, '^\S+\s*', ''));
        ELSIF v_make IS NULL AND v_title <> '' THEN
          v_make := initcap(v_title);
          v_title := '';
        END IF;

        -- Normalize make names
        v_make := CASE v_make
          WHEN 'Forest River Rv' THEN 'Forest River'
          WHEN 'Keystone Rv' THEN 'Keystone'
          WHEN 'Coachmen Rv' THEN 'Coachmen'
          WHEN 'Alliance Rv' THEN 'Alliance'
          WHEN 'Brinkley Rv' THEN 'Brinkley'
          WHEN 'Highland Ridge Rv' THEN 'Highland Ridge'
          WHEN 'Cruiser Rv' THEN 'Cruiser'
          WHEN 'Vanleigh Rv' THEN 'Vanleigh'
          WHEN 'Palomino Rv' THEN 'Palomino'
          WHEN 'Dutchmen Rv' THEN 'Dutchmen'
          WHEN 'Starcraft Rv' THEN 'Starcraft'
          WHEN 'Crossroads Rv' THEN 'CrossRoads'
          WHEN 'Open Range Rv' THEN 'Open Range'
          WHEN 'Modern Buggy Rv' THEN 'Modern Buggy'
          WHEN 'Prime Time Rv' THEN 'Prime Time'
          WHEN 'Shasta Rvs' THEN 'Shasta'
          WHEN 'Thor Motor Coach' THEN 'Thor Motor Coach'
          WHEN 'Thor Motor' THEN 'Thor Motor Coach'
          WHEN 'Newmar Corp' THEN 'Newmar'
          WHEN 'Tiffin Motorhomes' THEN 'Tiffin'
          ELSE v_make
        END;

        -- Fix: if Thor Motor Coach, the model starts after "Coach" which was already stripped
        -- Fix: if make was "Thor Motor" (2-word), "Coach" is first word of remaining
        IF v_make = 'Thor Motor Coach' AND lower(v_title) LIKE 'coach %' THEN
          -- "Coach" already part of make, skip it
          NULL;
        END IF;

        -- Model + floorplan
        IF v_title <> '' THEN
          v_parts := string_to_array(v_title, ' ');
          v_last := v_parts[array_length(v_parts,1)];
          -- Floorplan: has both digits and letters, or is pure 3-4 digit number
          IF array_length(v_parts, 1) >= 2
             AND (
               (v_last ~ '[0-9]' AND v_last ~ '[A-Za-z]')
               OR v_last ~ '^\d{2,5}$'
             ) THEN
            v_floorplan := upper(v_last);
            v_model := array_to_string(v_parts[1:array_length(v_parts,1)-1], ' ');
          ELSE
            v_model := v_title;
          END IF;
        END IF;
      END IF;

      -- URL fallback for year
      v_path := lower(COALESCE(v_rec.page_path, ''));
      IF v_year IS NULL THEN
        v_year := substring(v_path from '/(?:new|used|pre-owned)-(\d{4})-')::INT;
        IF v_year IS NOT NULL AND (v_year < 2010 OR v_year > 2029) THEN v_year := NULL; END IF;
      END IF;

      -- URL fallback for make/model (when title is "(not set)")
      IF v_make IS NULL AND v_path <> '' THEN
        CASE v_platform
          WHEN 'interactrv' THEN
            v_slug := substring(v_path from '/product/(?:new|used|pre-owned)-\d{4}-(.+)-\d+-\d+$');
          WHEN 'scoutrv' THEN
            v_slug := substring(v_path from '/inventory/(?:new|used)/\d{4}-(.+)$');
          WHEN 'dealerspike' THEN
            v_slug := substring(v_path from '/(?:new|pre-owned|used)-inventory-\d{4}-(.+)-\d{6,}$');
          ELSE
            v_slug := substring(v_path from '\d{4}[/-](.+)$');
        END CASE;
        IF v_slug IS NOT NULL THEN
          v_slug := replace(lower(v_slug), '-', ' ');
          -- Three-word make from URL
          FOR i IN 1..array_length(v_three_word_makes, 1) LOOP
            IF v_slug LIKE v_three_word_makes[i] || '%' THEN
              v_make := initcap(v_three_word_makes[i]);
              v_slug := trim(substring(v_slug from length(v_three_word_makes[i]) + 1));
              EXIT;
            END IF;
          END LOOP;
          -- Two-word make from URL
          IF v_make IS NULL THEN
            FOR i IN 1..array_length(v_two_word_makes, 1) LOOP
              IF v_slug LIKE v_two_word_makes[i] || '%' THEN
                v_make := initcap(v_two_word_makes[i]);
                v_slug := trim(substring(v_slug from length(v_two_word_makes[i]) + 1));
                EXIT;
              END IF;
            END LOOP;
          END IF;
          -- Single-word make from URL
          IF v_make IS NULL AND v_slug ~ '^\S+\s' THEN
            v_make := initcap(split_part(v_slug, ' ', 1));
            v_slug := trim(regexp_replace(v_slug, '^\S+\s*', ''));
          END IF;
          -- Normalize URL-derived make
          v_make := CASE v_make
            WHEN 'Forest River Rv' THEN 'Forest River'
            WHEN 'Keystone Rv' THEN 'Keystone'
            WHEN 'Coachmen Rv' THEN 'Coachmen'
            WHEN 'Alliance Rv' THEN 'Alliance'
            WHEN 'Highland Ridge Rv' THEN 'Highland Ridge'
            WHEN 'Thor Motor Coach' THEN 'Thor Motor Coach'
            WHEN 'Thor Motor' THEN 'Thor Motor Coach'
            WHEN 'Shasta Rvs' THEN 'Shasta'
            WHEN 'Open Range Rv' THEN 'Open Range'
            WHEN 'Dutchmen Rv' THEN 'Dutchmen'
            WHEN 'Crossroads Rv' THEN 'CrossRoads'
            WHEN 'Prime Time Rv' THEN 'Prime Time'
            ELSE v_make
          END;
          IF v_model IS NULL AND v_slug <> '' THEN
            v_model := initcap(v_slug);
          END IF;
        END IF;
      END IF;

      -- ScoutRV rv_type from URL
      IF v_platform = 'scoutrv' AND v_rv_type IS NULL THEN
        v_rv_type := substring(v_path from '/type/([^/]+)');
        IF v_rv_type IS NOT NULL THEN v_rv_type := initcap(replace(v_rv_type, '-', ' ')); END IF;
      END IF;

      -- Validate year
      IF v_year IS NOT NULL AND (v_year < 2010 OR v_year > 2029) THEN v_year := NULL; END IF;
      IF v_year IS NOT NULL OR v_make IS NOT NULL THEN v_enriched := v_enriched + 1; END IF;
    END IF;

    -- INSERT
    INSERT INTO ga4_classified_pages (
      customer_id, agency_id, page_path, page_title, page_type,
      item_condition, item_year, item_make, item_model, item_floorplan, rv_type,
      platform_used, rule_matched, classified_at, enriched_at
    ) VALUES (
      v_rec.customer_id, v_rec.agency_id, v_rec.page_path, v_rec.page_title, v_page_type,
      v_condition, v_year, v_make, v_model, v_floorplan, v_rv_type,
      v_platform, v_matched, NOW(),
      CASE WHEN v_year IS NOT NULL OR v_make IS NOT NULL THEN NOW() ELSE NULL END
    )
    ON CONFLICT (customer_id, page_path) DO UPDATE SET
      page_title    = EXCLUDED.page_title,
      page_type     = EXCLUDED.page_type,
      item_condition = COALESCE(EXCLUDED.item_condition, ga4_classified_pages.item_condition),
      item_year      = COALESCE(EXCLUDED.item_year, ga4_classified_pages.item_year),
      item_make      = COALESCE(EXCLUDED.item_make, ga4_classified_pages.item_make),
      item_model     = COALESCE(EXCLUDED.item_model, ga4_classified_pages.item_model),
      item_floorplan = COALESCE(EXCLUDED.item_floorplan, ga4_classified_pages.item_floorplan),
      rv_type        = COALESCE(EXCLUDED.rv_type, ga4_classified_pages.rv_type),
      platform_used  = EXCLUDED.platform_used,
      rule_matched   = EXCLUDED.rule_matched,
      classified_at  = NOW(),
      enriched_at    = CASE WHEN EXCLUDED.item_year IS NOT NULL OR EXCLUDED.item_make IS NOT NULL
                       THEN NOW() ELSE ga4_classified_pages.enriched_at END;
  END LOOP;

  RETURN QUERY SELECT v_total, v_classified, v_enriched, v_total - v_classified;
END;

$_$;


ALTER FUNCTION "public"."ga4_classify_and_enrich"("p_agency_id" "uuid", "p_customer_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ga4_events_report"("p_customer_ids" "text"[], "p_date_from" "date", "p_date_to" "date", "p_reporting_only" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN jsonb_build_object(
    'events_by_channel', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT e.event_name, e.channel_group, e.source, e.medium, e.source_medium,
               SUM(e.event_count)::int AS event_count,
               SUM(e.total_users)::int AS total_users,
               SUM(e.sessions)::int AS sessions
        FROM ga4_events e
        WHERE e.customer_id = ANY(p_customer_ids)
          AND e.report_date BETWEEN p_date_from AND p_date_to
          AND (
            NOT p_reporting_only
            OR EXISTS (
              SELECT 1 FROM ga4_reporting_events re
              WHERE re.customer_id = e.customer_id
                AND re.event_name = e.event_name
                AND re.is_active = true
            )
          )
        GROUP BY e.event_name, e.channel_group, e.source, e.medium, e.source_medium
        ORDER BY e.event_name, SUM(e.event_count) DESC
      ) t
    ),
    'events_summary', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT e.event_name,
               SUM(e.event_count)::int AS event_count,
               SUM(e.total_users)::int AS total_users,
               SUM(e.sessions)::int AS sessions,
               COALESCE(bool_or(re.is_active), false) AS is_reporting
        FROM ga4_events e
        LEFT JOIN ga4_reporting_events re
          ON re.customer_id = e.customer_id
          AND re.event_name = e.event_name
          AND re.is_active = true
        WHERE e.customer_id = ANY(p_customer_ids)
          AND e.report_date BETWEEN p_date_from AND p_date_to
        GROUP BY e.event_name
        ORDER BY SUM(e.event_count) DESC
      ) t
    )
  );
END;

$$;


ALTER FUNCTION "public"."ga4_events_report"("p_customer_ids" "text"[], "p_date_from" "date", "p_date_to" "date", "p_reporting_only" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ga4_metrics_sync_all"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  proj_url text;
  anon_key text;
  acct RECORD;
  v_date_from text;
  v_date_to text;
BEGIN
  SELECT decrypted_secret INTO proj_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key';

  v_date_from := (CURRENT_DATE - INTERVAL '5 days')::date::text;
  v_date_to   := (CURRENT_DATE - INTERVAL '1 day')::date::text;

  FOR acct IN
    SELECT cpa.platform_customer_id AS customer_id
    FROM public.client_platform_accounts cpa
    JOIN public.agency_platform_credentials apc ON cpa.credential_id = apc.id
    WHERE cpa.platform = 'ga4'
      AND cpa.is_active = true
      AND apc.is_active = true
  LOOP
    PERFORM net.http_post(
      url := proj_url || '/functions/v1/ga4-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'customer_id', acct.customer_id,
        'mode', 'backfill',
        'date_from', v_date_from,
        'date_to', v_date_to
      )
    );
  END LOOP;
END;

$$;


ALTER FUNCTION "public"."ga4_metrics_sync_all"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ga4_summary_report"("p_customer_ids" "text"[], "p_date_from" "date", "p_date_to" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_kpis JSONB;
  v_daily JSONB;
  v_channels JSONB;
  v_source_medium JSONB;
  v_campaigns JSONB;
  v_devices JSONB;
  v_geo JSONB;
  v_daily_by_channel JSONB;
  v_channel_by_day JSONB;
  v_campaign_by_channel JSONB;
BEGIN
  SET LOCAL statement_timeout = '30s';

  -- 1. KPIs
  SELECT jsonb_build_object(
    'sessions', COALESCE(SUM(sessions), 0),
    'screen_page_views', COALESCE(SUM(screen_page_views), 0),
    'total_users', COALESCE(SUM(total_users), 0),
    'new_users', COALESCE(SUM(new_users), 0),
    'active_users', COALESCE(SUM(active_users), 0),
    'engaged_sessions', COALESCE(SUM(engaged_sessions), 0),
    'event_count', COALESCE(SUM(event_count), 0),
    'key_events', COALESCE(SUM(key_events), 0),
    'bounce_rate', CASE WHEN SUM(sessions) > 0
      THEN ROUND((SUM(bounce_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
    'avg_session_duration', CASE WHEN SUM(sessions) > 0
      THEN ROUND((SUM(avg_session_duration * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
    'engagement_rate', CASE WHEN SUM(sessions) > 0
      THEN ROUND((SUM(engagement_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END
  ) INTO v_kpis
  FROM ga4_daily_summary
  WHERE customer_id = ANY(p_customer_ids)
    AND report_date BETWEEN p_date_from AND p_date_to;

  -- 2. Daily trend
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_daily
  FROM (
    SELECT jsonb_build_object(
      'report_date', report_date,
      'sessions', SUM(sessions),
      'screen_page_views', SUM(screen_page_views),
      'total_users', SUM(total_users),
      'new_users', SUM(new_users),
      'active_users', SUM(active_users),
      'engaged_sessions', SUM(engaged_sessions),
      'event_count', SUM(event_count),
      'key_events', SUM(key_events),
      'bounce_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(bounce_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'avg_session_duration', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(avg_session_duration * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'engagement_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(engagement_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END
    ) AS r
    FROM ga4_daily_summary
    WHERE customer_id = ANY(p_customer_ids)
      AND report_date BETWEEN p_date_from AND p_date_to
    GROUP BY report_date
    ORDER BY report_date
  ) sub;

  -- 3. Channels
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_channels
  FROM (
    SELECT jsonb_build_object(
      'channel_group', channel_group,
      'sessions', SUM(sessions),
      'screen_page_views', SUM(screen_page_views),
      'total_users', SUM(total_users),
      'new_users', SUM(new_users),
      'engaged_sessions', SUM(engaged_sessions),
      'event_count', SUM(event_count),
      'key_events', SUM(key_events),
      'bounce_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(bounce_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'avg_session_duration', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(avg_session_duration * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'engagement_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(engagement_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END
    ) AS r
    FROM ga4_daily_summary
    WHERE customer_id = ANY(p_customer_ids)
      AND report_date BETWEEN p_date_from AND p_date_to
      AND channel_group IS NOT NULL AND channel_group != ''
    GROUP BY channel_group
    ORDER BY SUM(sessions) DESC
  ) sub;

  -- 4. Source / Medium
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_source_medium
  FROM (
    SELECT jsonb_build_object(
      'source_medium', source_medium,
      'source', source,
      'medium', medium,
      'sessions', SUM(sessions),
      'screen_page_views', SUM(screen_page_views),
      'total_users', SUM(total_users),
      'new_users', SUM(new_users),
      'engaged_sessions', SUM(engaged_sessions),
      'event_count', SUM(event_count),
      'key_events', SUM(key_events),
      'bounce_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(bounce_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'avg_session_duration', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(avg_session_duration * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'engagement_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(engagement_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END
    ) AS r
    FROM ga4_daily_summary
    WHERE customer_id = ANY(p_customer_ids)
      AND report_date BETWEEN p_date_from AND p_date_to
      AND source_medium IS NOT NULL AND source_medium != ''
    GROUP BY source_medium, source, medium
    ORDER BY SUM(sessions) DESC
  ) sub;

  -- 5. Campaigns (grouped by channel)
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_campaigns
  FROM (
    SELECT jsonb_build_object(
      'campaign_name', campaign_name,
      'sessions', SUM(sessions),
      'screen_page_views', SUM(screen_page_views),
      'total_users', SUM(total_users),
      'new_users', SUM(new_users),
      'engaged_sessions', SUM(engaged_sessions),
      'event_count', SUM(event_count),
      'key_events', SUM(key_events),
      'bounce_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(bounce_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'avg_session_duration', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(avg_session_duration * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'engagement_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(engagement_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END
    ) AS r
    FROM ga4_daily_summary
    WHERE customer_id = ANY(p_customer_ids)
      AND report_date BETWEEN p_date_from AND p_date_to
      AND campaign_name IS NOT NULL AND campaign_name != '' AND campaign_name != '(not set)'
    GROUP BY campaign_name
    ORDER BY SUM(sessions) DESC
  ) sub;

  -- 6. Devices
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_devices
  FROM (
    SELECT jsonb_build_object(
      'device_category', device_category,
      'sessions', SUM(sessions),
      'screen_page_views', SUM(screen_page_views),
      'total_users', SUM(total_users),
      'new_users', SUM(new_users),
      'engaged_sessions', SUM(engaged_sessions),
      'event_count', SUM(event_count),
      'key_events', SUM(key_events),
      'bounce_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(bounce_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'avg_session_duration', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(avg_session_duration * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'engagement_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(engagement_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END
    ) AS r
    FROM ga4_daily_summary
    WHERE customer_id = ANY(p_customer_ids)
      AND report_date BETWEEN p_date_from AND p_date_to
      AND device_category IS NOT NULL AND device_category != ''
    GROUP BY device_category
    ORDER BY SUM(sessions) DESC
  ) sub;

  -- 7. Geography (top 50)
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_geo
  FROM (
    SELECT jsonb_build_object(
      'country', country,
      'region', region,
      'city', city,
      'sessions', SUM(sessions),
      'screen_page_views', SUM(screen_page_views),
      'total_users', SUM(total_users),
      'new_users', SUM(new_users),
      'engaged_sessions', SUM(engaged_sessions),
      'bounce_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(bounce_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'avg_session_duration', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(avg_session_duration * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'engagement_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(engagement_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END
    ) AS r
    FROM ga4_daily_summary
    WHERE customer_id = ANY(p_customer_ids)
      AND report_date BETWEEN p_date_from AND p_date_to
      AND region IS NOT NULL AND region != '' AND region != '(not set)'
    GROUP BY country, region, city
    ORDER BY SUM(sessions) DESC
    LIMIT 50
  ) sub;

  -- 8. Daily by Channel (date → channels under it)
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_daily_by_channel
  FROM (
    SELECT jsonb_build_object(
      'report_date', report_date,
      'channel_group', channel_group,
      'sessions', SUM(sessions),
      'screen_page_views', SUM(screen_page_views),
      'total_users', SUM(total_users),
      'new_users', SUM(new_users),
      'engaged_sessions', SUM(engaged_sessions),
      'event_count', SUM(event_count),
      'key_events', SUM(key_events),
      'bounce_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(bounce_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'avg_session_duration', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(avg_session_duration * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'engagement_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(engagement_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END
    ) AS r
    FROM ga4_daily_summary
    WHERE customer_id = ANY(p_customer_ids)
      AND report_date BETWEEN p_date_from AND p_date_to
      AND channel_group IS NOT NULL AND channel_group != ''
    GROUP BY report_date, channel_group
    ORDER BY report_date, SUM(sessions) DESC
  ) sub;

  -- 9. Channel by Day (channel → daily breakdown under it)
  -- Same data as #8, just consumed differently by frontend. Included for clarity.

  -- 10. Campaign by Channel (channel_group + campaign_name)
  SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) INTO v_campaign_by_channel
  FROM (
    SELECT jsonb_build_object(
      'channel_group', channel_group,
      'campaign_name', campaign_name,
      'sessions', SUM(sessions),
      'screen_page_views', SUM(screen_page_views),
      'total_users', SUM(total_users),
      'new_users', SUM(new_users),
      'engaged_sessions', SUM(engaged_sessions),
      'event_count', SUM(event_count),
      'key_events', SUM(key_events),
      'bounce_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(bounce_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'avg_session_duration', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(avg_session_duration * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END,
      'engagement_rate', CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(engagement_rate * sessions) / SUM(sessions))::numeric, 2) ELSE 0 END
    ) AS r
    FROM ga4_daily_summary
    WHERE customer_id = ANY(p_customer_ids)
      AND report_date BETWEEN p_date_from AND p_date_to
      AND channel_group IS NOT NULL AND channel_group != ''
      AND campaign_name IS NOT NULL AND campaign_name != '' AND campaign_name != '(not set)'
    GROUP BY channel_group, campaign_name
    ORDER BY channel_group, SUM(sessions) DESC
  ) sub;

  RETURN jsonb_build_object(
    'kpis', v_kpis,
    'daily_trend', v_daily,
    'channels', v_channels,
    'source_medium', v_source_medium,
    'campaigns', v_campaigns,
    'devices', v_devices,
    'geo', v_geo,
    'daily_by_channel', v_daily_by_channel,
    'campaign_by_channel', v_campaign_by_channel
  );
END;

$$;


ALTER FUNCTION "public"."ga4_summary_report"("p_customer_ids" "text"[], "p_date_from" "date", "p_date_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gads_geo_sync_all"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  proj_url text;
  anon_key text;
  acct RECORD;
  d date;
BEGIN
  SELECT decrypted_secret INTO proj_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key';

  FOR acct IN
    SELECT cpa.platform_customer_id AS customer_id
    FROM public.client_platform_accounts cpa
    JOIN public.agency_platform_credentials apc ON cpa.credential_id = apc.id
    WHERE cpa.platform = 'google_ads'
      AND cpa.is_active = true
      AND apc.is_active = true
  LOOP
    FOR d IN
      SELECT generate_series(
        (CURRENT_DATE - INTERVAL '5 days')::date,
        (CURRENT_DATE - INTERVAL '1 day')::date,
        '1 day'::interval
      )::date
    LOOP
      PERFORM net.http_post(
        url := proj_url || '/functions/v1/gads-status-geo',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key
        ),
        body := jsonb_build_object(
          'customer_id', acct.customer_id,
          'date_from', d::text,
          'date_to', d::text,
          'sync_type', 'geo'
        )
      );
    END LOOP;
  END LOOP;
END;

$$;


ALTER FUNCTION "public"."gads_geo_sync_all"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gads_metrics_sync_all"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  proj_url text;
  anon_key text;
  acct RECORD;
  d date;
BEGIN
  SELECT decrypted_secret INTO proj_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key';

  FOR acct IN
    SELECT cpa.platform_customer_id AS customer_id
    FROM public.client_platform_accounts cpa
    JOIN public.agency_platform_credentials apc ON cpa.credential_id = apc.id
    WHERE cpa.platform = 'google_ads'
      AND cpa.is_active = true
      AND apc.is_active = true
  LOOP
    FOR d IN
      SELECT generate_series(
        (CURRENT_DATE - INTERVAL '5 days')::date,
        (CURRENT_DATE - INTERVAL '1 day')::date,
        '1 day'::interval
      )::date
    LOOP
      PERFORM net.http_post(
        url := proj_url || '/functions/v1/gads-full-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key
        ),
        body := jsonb_build_object(
          'customer_id', acct.customer_id,
          'mode', 'backfill',
          'date_from', d::text,
          'date_to', d::text
        )
      );
    END LOOP;
  END LOOP;
END;

$$;


ALTER FUNCTION "public"."gads_metrics_sync_all"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gads_status_sync_all"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  proj_url text;
  anon_key text;
  acct RECORD;
BEGIN
  SELECT decrypted_secret INTO proj_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key';

  FOR acct IN
    SELECT cpa.platform_customer_id AS customer_id
    FROM public.client_platform_accounts cpa
    JOIN public.agency_platform_credentials apc ON cpa.credential_id = apc.id
    WHERE cpa.platform = 'google_ads'
      AND cpa.is_active = true
      AND apc.is_active = true
  LOOP
    PERFORM net.http_post(
      url := proj_url || '/functions/v1/gads-status-geo',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'customer_id', acct.customer_id,
        'sync_type', 'campaigns'
      )
    );
    PERFORM net.http_post(
      url := proj_url || '/functions/v1/gads-status-geo',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'customer_id', acct.customer_id,
        'sync_type', 'adgroups'
      )
    );
    PERFORM net.http_post(
      url := proj_url || '/functions/v1/gads-status-geo',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'customer_id', acct.customer_id,
        'sync_type', 'keywords'
      )
    );
  END LOOP;
END;

$$;


ALTER FUNCTION "public"."gads_status_sync_all"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_missing_geo_ids"() RETURNS SETOF "text"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT DISTINCT unnested AS geo_id
  FROM (
    SELECT country AS unnested FROM gads_geo_location_daily WHERE country != ''
    UNION
    SELECT region FROM gads_geo_location_daily WHERE region != ''
    UNION
    SELECT city FROM gads_geo_location_daily WHERE city != ''
    UNION
    SELECT metro FROM gads_geo_location_daily WHERE metro != ''
    UNION
    SELECT most_specific FROM gads_geo_location_daily WHERE most_specific != ''
  ) all_ids
  WHERE unnested IS NOT NULL
    AND unnested != ''
    AND unnested NOT IN (SELECT g.geo_id FROM gads_geo_constants g);

$$;


ALTER FUNCTION "public"."get_missing_geo_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_platform_credential"("p_customer_id" "text", "p_platform" "text") RETURNS TABLE("refresh_token" "text", "mcc_id" "text", "credential_id" "uuid")
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  SELECT
    apc.oauth_refresh_token,
    apc.platform_mcc_id,
    apc.id
  FROM agency_platform_credentials apc
  JOIN client_platform_accounts cpa ON cpa.credential_id = apc.id
  WHERE cpa.platform_customer_id = p_customer_id
    AND cpa.platform = p_platform
    AND apc.is_active = true
  LIMIT 1;

$$;


ALTER FUNCTION "public"."get_platform_credential"("p_customer_id" "text", "p_platform" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_agency_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT agency_id FROM user_profiles WHERE id = auth.uid();

$$;


ALTER FUNCTION "public"."get_user_agency_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ghl_sync_all"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  proj_url text;
  anon_key text;
  acct RECORD;
BEGIN
  SELECT decrypted_secret INTO proj_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key';

  FOR acct IN
    SELECT platform_customer_id AS customer_id
    FROM client_platform_accounts
    WHERE platform = 'ghl' AND is_active = true
  LOOP
    PERFORM net.http_post(
      url := proj_url || '/functions/v1/ghl-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object(
        'customer_id', acct.customer_id,
        'mode', 'full'
      )
    );
  END LOOP;
END;

$$;


ALTER FUNCTION "public"."ghl_sync_all"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    (SELECT id FROM public.roles WHERE role_name = 'viewer' LIMIT 1)
  );
  RETURN NEW;
END;

$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.id = auth.uid()
    AND (r.role_name IN ('admin', 'super_admin') OR up.is_super_admin = true)
  );

$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_agency_admin"("p_agency_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.id = auth.uid()
    AND up.agency_id = p_agency_id
    AND r.role_name = 'admin'
  ) OR is_super_admin();

$$;


ALTER FUNCTION "public"."is_agency_admin"("p_agency_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_super_admin = true
  );

$$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reclassify_ga4_pages"("p_platform" "text", "p_date_from" "date", "p_date_to" "date") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE 
  v_affected int := 0;
  v_batch int;
  v_cust record;
BEGIN
  FOR v_cust IN
    SELECT cpa.platform_customer_id AS cid
    FROM client_platform_accounts cpa
    JOIN clients c ON c.id = cpa.client_id
    WHERE c.website_platform = p_platform
      AND cpa.platform = 'ga4'
  LOOP
    UPDATE ga4_raw g
    SET page_type = r.page_type
    FROM (
      SELECT g2.id, pr.page_type,
             ROW_NUMBER() OVER (
               PARTITION BY g2.id 
               ORDER BY 
                 CASE WHEN pr.customer_id IS NOT NULL THEN 0
                      WHEN pr.platform = p_platform THEN 1
                      ELSE 2
                 END,
                 pr.priority ASC
             ) AS rn
      FROM ga4_raw g2
      JOIN ga4_page_rules pr 
        ON pr.is_active 
        AND (
          pr.customer_id = v_cust.cid
          OR (pr.customer_id IS NULL AND pr.platform = p_platform)
          OR (pr.customer_id IS NULL AND pr.platform = 'custom')
        )
        AND g2.page_path ~* pr.url_pattern
      WHERE g2.customer_id = v_cust.cid
        AND g2.report_date BETWEEN p_date_from AND p_date_to
    ) r
    WHERE g.id = r.id AND r.rn = 1
      AND (g.page_type IS DISTINCT FROM r.page_type);
    
    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_affected := v_affected + v_batch;
  END LOOP;
  
  RETURN v_affected;
END;

$$;


ALTER FUNCTION "public"."reclassify_ga4_pages"("p_platform" "text", "p_date_from" "date", "p_date_to" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reddit_metrics_sync_all"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  proj_url text;
  anon_key text;
  acct     RECORD;
  d        date;
BEGIN
  SELECT decrypted_secret INTO proj_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key';

  FOR acct IN
    SELECT cpa.platform_customer_id AS customer_id
    FROM public.client_platform_accounts cpa
    WHERE cpa.platform = 'reddit'
      AND cpa.is_active = true
  LOOP
    FOR d IN
      SELECT generate_series(
        (CURRENT_DATE - INTERVAL '5 days')::date,
        (CURRENT_DATE - INTERVAL '1 day')::date,
        '1 day'::interval
      )::date
    LOOP
      PERFORM net.http_post(
        url     := proj_url || '/functions/v1/reddit-full-sync',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || anon_key
        ),
        body    := jsonb_build_object(
          'customer_id', acct.customer_id,
          'mode',        'backfill',
          'date_from',   d::text,
          'date_to',     d::text
        )
      );
    END LOOP;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."reddit_metrics_sync_all"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."agencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_name" "text" NOT NULL,
    "agency_slug" "text" NOT NULL,
    "client_code" "text",
    "logo_url" "text",
    "favicon_url" "text",
    "primary_color" "text" DEFAULT '#3B82F6'::"text",
    "secondary_color" "text" DEFAULT '#1E40AF'::"text",
    "accent_color" "text" DEFAULT '#F59E0B'::"text",
    "sidebar_bg" "text" DEFAULT '#1F2937'::"text",
    "sidebar_text" "text" DEFAULT '#FFFFFF'::"text",
    "font_family" "text" DEFAULT 'Inter, sans-serif'::"text",
    "custom_css" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agency_platform_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "oauth_refresh_token" "text",
    "platform_mcc_id" "text",
    "platform_account_id" "text",
    "token_scopes" "text",
    "is_active" boolean DEFAULT true,
    "connected_by" "uuid",
    "connected_at" timestamp with time zone DEFAULT "now"(),
    "last_sync_at" timestamp with time zone,
    "last_sync_status" "text",
    "last_error" "text",
    "credential_label" "text" DEFAULT 'default'::"text",
    "google_email" "text"
);


ALTER TABLE "public"."agency_platform_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agency_report_tabs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "tab_key" "text" NOT NULL,
    "tab_label" "text" NOT NULL,
    "tab_order" integer DEFAULT 0 NOT NULL,
    "is_visible" boolean DEFAULT true,
    "platform" "text",
    "required_permission" "text",
    "config_json" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agency_report_tabs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_platform_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "credential_id" "uuid",
    "platform" "text" NOT NULL,
    "platform_customer_id" "text" NOT NULL,
    "account_name" "text",
    "is_active" boolean DEFAULT true,
    "last_sync_at" timestamp with time zone,
    "sync_status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "auto_sync_enabled" boolean DEFAULT false,
    "last_synced_at" timestamp with time zone,
    "last_sync_status" "text",
    "client_id" "uuid",
    "use_mcc" boolean DEFAULT true,
    "platform_api_key" "text",
    "hipaa_compliant" boolean DEFAULT false
);


ALTER TABLE "public"."client_platform_accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."client_platform_accounts"."auto_sync_enabled" IS 'When true, this account is included in daily auto-sync. Use pg_cron or external scheduler to call gads-full-sync edge function for accounts where auto_sync_enabled = true.';



CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "website_platform" "text",
    "vdp_url_pattern" "text",
    "logo_url" "text"
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON TABLE "public"."clients" IS 'Groups multiple platform accounts (e.g. Wow Presents Plus) for unified access assignment';



CREATE TABLE IF NOT EXISTS "public"."fb_ad_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "adset_id" "text" NOT NULL,
    "adset_name" "text",
    "ad_id" "text" NOT NULL,
    "ad_name" "text",
    "report_date" "date" NOT NULL,
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "spend" numeric(15,6) DEFAULT 0,
    "cpc" numeric(15,6) DEFAULT 0,
    "cpm" numeric(15,6) DEFAULT 0,
    "ctr" numeric(10,4) DEFAULT 0,
    "reach" bigint DEFAULT 0,
    "frequency" numeric(10,4) DEFAULT 0,
    "link_clicks" bigint DEFAULT 0,
    "purchase_count" bigint DEFAULT 0,
    "purchase_value" numeric(15,6) DEFAULT 0,
    "purchase_cost" numeric(15,6) DEFAULT 0,
    "lead_count" bigint DEFAULT 0,
    "lead_cost" numeric(15,6) DEFAULT 0,
    "add_to_cart_count" bigint DEFAULT 0,
    "add_to_cart_value" numeric(15,6) DEFAULT 0,
    "view_content_count" bigint DEFAULT 0,
    "complete_registration_count" bigint DEFAULT 0,
    "initiate_checkout_count" bigint DEFAULT 0,
    "initiate_checkout_value" numeric(15,6) DEFAULT 0,
    "purchase_roas" numeric(10,4) DEFAULT 0,
    "video_views" bigint DEFAULT 0,
    "video_p25_watched" bigint DEFAULT 0,
    "video_p50_watched" bigint DEFAULT 0,
    "video_p75_watched" bigint DEFAULT 0,
    "video_p100_watched" bigint DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fb_ad_daily" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fb_ad_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fb_ad_daily_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fb_ad_daily_id_seq" OWNED BY "public"."fb_ad_daily"."id";



CREATE TABLE IF NOT EXISTS "public"."fb_adset_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "adset_id" "text" NOT NULL,
    "adset_name" "text",
    "report_date" "date" NOT NULL,
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "spend" numeric(15,6) DEFAULT 0,
    "cpc" numeric(15,6) DEFAULT 0,
    "cpm" numeric(15,6) DEFAULT 0,
    "ctr" numeric(10,4) DEFAULT 0,
    "reach" bigint DEFAULT 0,
    "frequency" numeric(10,4) DEFAULT 0,
    "link_clicks" bigint DEFAULT 0,
    "purchase_count" bigint DEFAULT 0,
    "purchase_value" numeric(15,6) DEFAULT 0,
    "purchase_cost" numeric(15,6) DEFAULT 0,
    "lead_count" bigint DEFAULT 0,
    "lead_cost" numeric(15,6) DEFAULT 0,
    "add_to_cart_count" bigint DEFAULT 0,
    "add_to_cart_value" numeric(15,6) DEFAULT 0,
    "view_content_count" bigint DEFAULT 0,
    "complete_registration_count" bigint DEFAULT 0,
    "initiate_checkout_count" bigint DEFAULT 0,
    "initiate_checkout_value" numeric(15,6) DEFAULT 0,
    "purchase_roas" numeric(10,4) DEFAULT 0,
    "video_views" bigint DEFAULT 0,
    "video_p25_watched" bigint DEFAULT 0,
    "video_p50_watched" bigint DEFAULT 0,
    "video_p75_watched" bigint DEFAULT 0,
    "video_p100_watched" bigint DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fb_adset_daily" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fb_adset_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fb_adset_daily_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fb_adset_daily_id_seq" OWNED BY "public"."fb_adset_daily"."id";



CREATE TABLE IF NOT EXISTS "public"."fb_campaign_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "report_date" "date" NOT NULL,
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "spend" numeric(15,6) DEFAULT 0,
    "cpc" numeric(15,6) DEFAULT 0,
    "cpm" numeric(15,6) DEFAULT 0,
    "ctr" numeric(10,4) DEFAULT 0,
    "reach" bigint DEFAULT 0,
    "frequency" numeric(10,4) DEFAULT 0,
    "link_clicks" bigint DEFAULT 0,
    "purchase_count" bigint DEFAULT 0,
    "purchase_value" numeric(15,6) DEFAULT 0,
    "purchase_cost" numeric(15,6) DEFAULT 0,
    "lead_count" bigint DEFAULT 0,
    "lead_cost" numeric(15,6) DEFAULT 0,
    "add_to_cart_count" bigint DEFAULT 0,
    "add_to_cart_value" numeric(15,6) DEFAULT 0,
    "view_content_count" bigint DEFAULT 0,
    "complete_registration_count" bigint DEFAULT 0,
    "initiate_checkout_count" bigint DEFAULT 0,
    "initiate_checkout_value" numeric(15,6) DEFAULT 0,
    "purchase_roas" numeric(10,4) DEFAULT 0,
    "video_views" bigint DEFAULT 0,
    "video_p25_watched" bigint DEFAULT 0,
    "video_p50_watched" bigint DEFAULT 0,
    "video_p75_watched" bigint DEFAULT 0,
    "video_p100_watched" bigint DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fb_campaign_daily" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fb_campaign_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fb_campaign_daily_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fb_campaign_daily_id_seq" OWNED BY "public"."fb_campaign_daily"."id";



CREATE TABLE IF NOT EXISTS "public"."fb_customers" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "account_name" "text",
    "agency_id" "uuid",
    "currency" "text" DEFAULT 'USD'::"text",
    "timezone" "text" DEFAULT 'UTC'::"text",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fb_customers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fb_customers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fb_customers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fb_customers_id_seq" OWNED BY "public"."fb_customers"."id";



CREATE TABLE IF NOT EXISTS "public"."fb_placement_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "publisher_platform" "text",
    "platform_position" "text",
    "report_date" "date" NOT NULL,
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "spend" numeric(15,6) DEFAULT 0,
    "cpc" numeric(15,6) DEFAULT 0,
    "cpm" numeric(15,6) DEFAULT 0,
    "ctr" numeric(10,4) DEFAULT 0,
    "reach" bigint DEFAULT 0,
    "frequency" numeric(10,4) DEFAULT 0,
    "link_clicks" bigint DEFAULT 0,
    "purchase_count" bigint DEFAULT 0,
    "purchase_value" numeric(15,6) DEFAULT 0,
    "purchase_cost" numeric(15,6) DEFAULT 0,
    "lead_count" bigint DEFAULT 0,
    "lead_cost" numeric(15,6) DEFAULT 0,
    "add_to_cart_count" bigint DEFAULT 0,
    "add_to_cart_value" numeric(15,6) DEFAULT 0,
    "view_content_count" bigint DEFAULT 0,
    "complete_registration_count" bigint DEFAULT 0,
    "initiate_checkout_count" bigint DEFAULT 0,
    "initiate_checkout_value" numeric(15,6) DEFAULT 0,
    "purchase_roas" numeric(10,4) DEFAULT 0,
    "video_views" bigint DEFAULT 0,
    "video_p25_watched" bigint DEFAULT 0,
    "video_p50_watched" bigint DEFAULT 0,
    "video_p75_watched" bigint DEFAULT 0,
    "video_p100_watched" bigint DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."fb_placement_daily" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."fb_placement_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."fb_placement_daily_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."fb_placement_daily_id_seq" OWNED BY "public"."fb_placement_daily"."id";



CREATE TABLE IF NOT EXISTS "public"."ga4_classified_pages" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "agency_id" "uuid",
    "page_path" "text" NOT NULL,
    "page_title" "text",
    "page_type" "text" DEFAULT 'Other'::"text",
    "item_condition" "text",
    "item_year" integer,
    "item_make" "text",
    "item_model" "text",
    "item_floorplan" "text",
    "rv_type" "text",
    "platform_used" "text",
    "rule_matched" "text",
    "classified_at" timestamp with time zone DEFAULT "now"(),
    "enriched_at" timestamp with time zone
);


ALTER TABLE "public"."ga4_classified_pages" OWNER TO "postgres";


ALTER TABLE "public"."ga4_classified_pages" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ga4_classified_pages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ga4_daily_summary" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "agency_id" "uuid",
    "report_date" "date" NOT NULL,
    "channel_group" "text",
    "source" "text",
    "medium" "text",
    "source_medium" "text",
    "campaign_name" "text",
    "device_category" "text",
    "country" "text",
    "region" "text",
    "city" "text",
    "sessions" integer DEFAULT 0,
    "total_users" integer DEFAULT 0,
    "new_users" integer DEFAULT 0,
    "active_users" integer DEFAULT 0,
    "engaged_sessions" integer DEFAULT 0,
    "bounce_rate" numeric(7,4) DEFAULT 0,
    "engagement_rate" numeric(7,4) DEFAULT 0,
    "avg_session_duration" numeric(10,2) DEFAULT 0,
    "event_count" integer DEFAULT 0,
    "key_events" integer DEFAULT 0,
    "user_engagement_duration" numeric(10,2) DEFAULT 0,
    "screen_page_views" integer DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ga4_daily_summary" OWNER TO "postgres";


ALTER TABLE "public"."ga4_daily_summary" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ga4_daily_summary_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ga4_events" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "agency_id" "text",
    "report_date" "date" NOT NULL,
    "event_name" "text" NOT NULL,
    "channel_group" "text",
    "source" "text",
    "medium" "text",
    "source_medium" "text",
    "event_count" integer DEFAULT 0,
    "total_users" integer DEFAULT 0,
    "sessions" integer DEFAULT 0,
    "is_reporting_event" boolean DEFAULT false,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ga4_events" OWNER TO "postgres";


ALTER TABLE "public"."ga4_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ga4_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ga4_monthly_reports" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "report_month" "text" NOT NULL,
    "report_type" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ga4_monthly_reports" OWNER TO "postgres";


ALTER TABLE "public"."ga4_monthly_reports" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ga4_monthly_reports_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ga4_page_rules" (
    "id" bigint NOT NULL,
    "platform" "text",
    "customer_id" "text",
    "page_type" "text" NOT NULL,
    "url_pattern" "text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ga4_page_rules" OWNER TO "postgres";


ALTER TABLE "public"."ga4_page_rules" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ga4_page_rules_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ga4_raw" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "report_date" "date" NOT NULL,
    "page_location" "text",
    "page_path" "text",
    "page_title" "text",
    "channel_group" "text",
    "source" "text",
    "medium" "text",
    "source_medium" "text",
    "campaign_name" "text",
    "device_category" "text",
    "country" "text",
    "region" "text",
    "city" "text",
    "page_views" integer DEFAULT 0,
    "total_users" integer DEFAULT 0,
    "new_users" integer DEFAULT 0,
    "sessions" integer DEFAULT 0,
    "page_type" "text",
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "bounce_rate" numeric(7,4) DEFAULT 0,
    "avg_session_duration" numeric(10,2) DEFAULT 0,
    "engaged_sessions" integer DEFAULT 0,
    "engagement_rate" numeric(7,4) DEFAULT 0,
    "event_count" integer DEFAULT 0,
    "key_events" integer DEFAULT 0,
    "user_engagement_duration" numeric(10,2) DEFAULT 0,
    "active_users" integer DEFAULT 0,
    "sessions_per_user" numeric(7,4) DEFAULT 0,
    "views_per_session" numeric(7,4) DEFAULT 0
);


ALTER TABLE "public"."ga4_raw" OWNER TO "postgres";


ALTER TABLE "public"."ga4_raw" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ga4_raw_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ga4_reporting_events" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "agency_id" "text",
    "event_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ga4_reporting_events" OWNER TO "postgres";


ALTER TABLE "public"."ga4_reporting_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ga4_reporting_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gads_adgroup_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "ad_group_id" "text" NOT NULL,
    "ad_group_name" "text",
    "date" "date" NOT NULL,
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "cost" numeric DEFAULT 0,
    "conversions" numeric DEFAULT 0,
    "conversions_value" numeric DEFAULT 0,
    "all_conversions" numeric DEFAULT 0,
    "all_conversions_value" numeric DEFAULT 0,
    "interactions" bigint DEFAULT 0,
    "ctr" numeric DEFAULT 0,
    "avg_cpc" numeric DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_adgroup_daily" OWNER TO "postgres";


ALTER TABLE "public"."gads_adgroup_daily" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gads_adgroup_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gads_adgroup_status" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "ad_group_id" "text" NOT NULL,
    "ad_group_name" "text",
    "ad_group_status" "text",
    "ad_group_type" "text",
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_adgroup_status" OWNER TO "postgres";


ALTER TABLE "public"."gads_adgroup_status" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gads_adgroup_status_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gads_campaign_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "campaign_type" "text",
    "date" "date" NOT NULL,
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "cost" numeric DEFAULT 0,
    "conversions" numeric DEFAULT 0,
    "conversions_value" numeric DEFAULT 0,
    "all_conversions" numeric DEFAULT 0,
    "all_conversions_value" numeric DEFAULT 0,
    "view_through_conversions" bigint DEFAULT 0,
    "interactions" bigint DEFAULT 0,
    "ctr" numeric DEFAULT 0,
    "avg_cpc" numeric DEFAULT 0,
    "avg_cpm" numeric DEFAULT 0,
    "cost_per_conversion" numeric DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_campaign_daily" OWNER TO "postgres";


ALTER TABLE "public"."gads_campaign_daily" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gads_campaign_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gads_campaign_status" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "campaign_type" "text",
    "campaign_status" "text",
    "serving_status" "text",
    "budget_amount" numeric DEFAULT 0,
    "bidding_strategy_type" "text",
    "start_date" "text",
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_campaign_status" OWNER TO "postgres";


ALTER TABLE "public"."gads_campaign_status" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gads_campaign_status_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gads_conversion_actions" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "conversion_action_id" "text" NOT NULL,
    "conversion_action_name" "text",
    "conversion_action_category" "text",
    "conversion_action_type" "text",
    "status" "text",
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_conversion_actions" OWNER TO "postgres";


ALTER TABLE "public"."gads_conversion_actions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gads_conversion_actions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gads_conversion_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "conversion_action_id" "text" NOT NULL,
    "conversion_action_name" "text",
    "conversion_action_category" "text",
    "date" "date" NOT NULL,
    "conversions" numeric DEFAULT 0,
    "conversions_value" numeric DEFAULT 0,
    "all_conversions" numeric DEFAULT 0,
    "all_conversions_value" numeric DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_conversion_daily" OWNER TO "postgres";


ALTER TABLE "public"."gads_conversion_daily" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gads_conversion_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gads_customers" (
    "customer_id" "text" NOT NULL,
    "descriptive_name" "text",
    "currency_code" "text" DEFAULT 'USD'::"text",
    "time_zone" "text",
    "is_manager" boolean DEFAULT false,
    "status" "text",
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gads_geo_constants" (
    "geo_id" "text" NOT NULL,
    "geo_name" "text",
    "canonical_name" "text",
    "country_code" "text",
    "target_type" "text",
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_geo_constants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gads_geo_location_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "date" "date" NOT NULL,
    "country" "text" DEFAULT ''::"text",
    "region" "text" DEFAULT ''::"text",
    "city" "text" DEFAULT ''::"text",
    "metro" "text" DEFAULT ''::"text",
    "most_specific" "text" DEFAULT ''::"text",
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "cost" numeric DEFAULT 0,
    "conversions" numeric DEFAULT 0,
    "conversions_value" numeric DEFAULT 0,
    "all_conversions" numeric DEFAULT 0,
    "ctr" numeric DEFAULT 0,
    "avg_cpc" numeric DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_geo_location_daily" OWNER TO "postgres";


ALTER TABLE "public"."gads_geo_location_daily" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gads_geo_location_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gads_keyword_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "ad_group_id" "text" NOT NULL,
    "ad_group_name" "text",
    "keyword_id" "text" NOT NULL,
    "keyword_text" "text",
    "keyword_match_type" "text",
    "date" "date" NOT NULL,
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "cost" numeric DEFAULT 0,
    "conversions" numeric DEFAULT 0,
    "conversions_value" numeric DEFAULT 0,
    "all_conversions" numeric DEFAULT 0,
    "ctr" numeric DEFAULT 0,
    "avg_cpc" numeric DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_keyword_daily" OWNER TO "postgres";


ALTER TABLE "public"."gads_keyword_daily" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gads_keyword_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gads_keyword_status" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "ad_group_id" "text" NOT NULL,
    "ad_group_name" "text",
    "keyword_id" "text" NOT NULL,
    "keyword_text" "text",
    "keyword_match_type" "text",
    "keyword_status" "text",
    "approval_status" "text",
    "quality_score" integer,
    "expected_ctr" "text",
    "landing_page_experience" "text",
    "ad_relevance" "text",
    "bid_amount" numeric DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_keyword_status" OWNER TO "postgres";


ALTER TABLE "public"."gads_keyword_status" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gads_keyword_status_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."gads_search_term_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "ad_group_id" "text" NOT NULL,
    "search_term" "text" NOT NULL,
    "date" "date" NOT NULL,
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "cost" numeric DEFAULT 0,
    "conversions" numeric DEFAULT 0,
    "conversions_value" numeric DEFAULT 0,
    "all_conversions" numeric DEFAULT 0,
    "ctr" numeric DEFAULT 0,
    "avg_cpc" numeric DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gads_search_term_daily" OWNER TO "postgres";


ALTER TABLE "public"."gads_search_term_daily" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."gads_search_term_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ghl_activity_daily" (
    "location_id" "text" NOT NULL,
    "report_date" "date" NOT NULL,
    "activity_type" "text" NOT NULL,
    "subtype" "text" NOT NULL,
    "total_count" integer DEFAULT 0,
    "first_time_count" integer DEFAULT 0,
    "total_duration" integer DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "chat_messages" integer DEFAULT 0
);


ALTER TABLE "public"."ghl_activity_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ghl_calls" (
    "id" "text" NOT NULL,
    "location_id" "text" NOT NULL,
    "contact_id" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "contact_email" "text",
    "direction" "text",
    "status" "text",
    "duration" integer DEFAULT 0,
    "first_time" boolean DEFAULT false,
    "date_added" timestamp with time zone,
    "conversation_id" "text",
    "message_type" "text",
    "source" "text",
    "medium" "text",
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "from_number" "text",
    "to_number" "text",
    "first_time_caller" boolean DEFAULT false
);


ALTER TABLE "public"."ghl_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ghl_contacts" (
    "id" "text" NOT NULL,
    "location_id" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "name" "text",
    "email" "text",
    "phone" "text",
    "tags" "jsonb" DEFAULT '[]'::"jsonb",
    "source" "text",
    "medium" "text",
    "campaign" "text",
    "lead_type" "text",
    "date_added" timestamp with time zone,
    "date_updated" timestamp with time zone,
    "last_activity" timestamp with time zone,
    "opp_status" "text",
    "opp_value" numeric DEFAULT 0,
    "raw_data" "jsonb",
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ghl_contacts" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."ghl_calls_view" AS
 SELECT "c"."id",
    "c"."location_id",
    "c"."contact_id",
    "c"."contact_name",
    "c"."contact_phone",
    "c"."contact_email",
    "c"."conversation_id",
    "c"."direction",
    "c"."status",
    "c"."duration",
    "c"."first_time",
    "c"."date_added",
    "c"."message_type",
    "c"."synced_at",
    "c"."source" AS "raw_source",
    "c"."medium" AS "raw_medium",
        CASE
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") <> ''::"text")) THEN COALESCE((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'utmSource'::"text"), 'google'::"text")
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") <> ''::"text")) THEN COALESCE((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'utmSource'::"text"), 'facebook'::"text")
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Organic Search'::"text") THEN COALESCE((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'utmSource'::"text"), 'google'::"text")
            WHEN ("lower"((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text")) = ANY (ARRAY['direct'::"text", 'direct traffic'::"text"])) THEN 'direct'::"text"
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") IS NOT NULL) THEN "lower"((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text"))
            WHEN ("c"."source" IS NOT NULL) THEN "c"."source"
            ELSE 'direct'::"text"
        END AS "clean_source",
        CASE
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") <> ''::"text")) THEN 'cpc'::"text"
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") <> ''::"text")) THEN 'paid_social'::"text"
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Organic Search'::"text") THEN 'organic'::"text"
            WHEN ("lower"((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text")) = ANY (ARRAY['direct'::"text", 'direct traffic'::"text"])) THEN 'direct'::"text"
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Referral'::"text") THEN 'referral'::"text"
            WHEN ("c"."medium" = ANY (ARRAY['m'::"text", 'c'::"text"])) THEN 'cpc'::"text"
            WHEN ("c"."medium" IS NOT NULL) THEN "c"."medium"
            ELSE 'direct'::"text"
        END AS "clean_medium",
        CASE
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") <> ''::"text")) THEN 'google_ads'::"text"
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") <> ''::"text")) THEN 'facebook_ads'::"text"
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Organic Search'::"text") THEN 'organic'::"text"
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Referral'::"text") THEN 'referral'::"text"
            ELSE 'direct'::"text"
        END AS "clean_lead_type"
   FROM ("public"."ghl_calls" "c"
     LEFT JOIN "public"."ghl_contacts" "ct" ON ((("ct"."id" = "c"."contact_id") AND ("ct"."location_id" = "c"."location_id"))));


ALTER VIEW "public"."ghl_calls_view" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."ghl_contacts_view" AS
 SELECT "id",
    "location_id",
    "first_name",
    "last_name",
    "email",
    "phone",
    "tags",
    "date_added",
    "date_updated",
    "opp_status",
    "opp_value",
    "synced_at",
    "source" AS "raw_source",
    "medium" AS "raw_medium",
    "lead_type" AS "raw_lead_type",
        CASE
            WHEN (((("raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") IS NOT NULL) AND ((("raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") <> ''::"text")) THEN COALESCE((("raw_data" -> 'attributionSource'::"text") ->> 'utmSource'::"text"), 'google'::"text")
            WHEN (((("raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") IS NOT NULL) AND ((("raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") <> ''::"text")) THEN COALESCE((("raw_data" -> 'attributionSource'::"text") ->> 'utmSource'::"text"), 'facebook'::"text")
            WHEN ((("raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Organic Search'::"text") THEN COALESCE((("raw_data" -> 'attributionSource'::"text") ->> 'utmSource'::"text"), 'google'::"text")
            WHEN ("lower"((("raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text")) = ANY (ARRAY['direct'::"text", 'direct traffic'::"text"])) THEN 'direct'::"text"
            WHEN ((("raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") IS NOT NULL) THEN "lower"((("raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text"))
            WHEN ("source" IS NOT NULL) THEN "source"
            ELSE 'direct'::"text"
        END AS "clean_source",
        CASE
            WHEN (((("raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") IS NOT NULL) AND ((("raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") <> ''::"text")) THEN 'cpc'::"text"
            WHEN (((("raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") IS NOT NULL) AND ((("raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") <> ''::"text")) THEN 'paid_social'::"text"
            WHEN ((("raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Organic Search'::"text") THEN 'organic'::"text"
            WHEN ("lower"((("raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text")) = ANY (ARRAY['direct'::"text", 'direct traffic'::"text"])) THEN 'direct'::"text"
            WHEN ((("raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Referral'::"text") THEN 'referral'::"text"
            WHEN ("medium" = ANY (ARRAY['m'::"text", 'c'::"text"])) THEN 'cpc'::"text"
            WHEN ("medium" IS NOT NULL) THEN "medium"
            ELSE 'direct'::"text"
        END AS "clean_medium",
        CASE
            WHEN (((("raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") IS NOT NULL) AND ((("raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") <> ''::"text")) THEN 'google_ads'::"text"
            WHEN (((("raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") IS NOT NULL) AND ((("raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") <> ''::"text")) THEN 'facebook_ads'::"text"
            WHEN ((("raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Organic Search'::"text") THEN 'organic'::"text"
            WHEN ((("raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Referral'::"text") THEN 'referral'::"text"
            ELSE 'direct'::"text"
        END AS "clean_lead_type"
   FROM "public"."ghl_contacts";


ALTER VIEW "public"."ghl_contacts_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ghl_form_submissions" (
    "id" "text" NOT NULL,
    "location_id" "text" NOT NULL,
    "contact_id" "text",
    "contact_name" "text",
    "contact_email" "text",
    "contact_phone" "text",
    "form_type" "text",
    "form_name" "text",
    "form_id" "text",
    "message_body" "text",
    "page_url" "text",
    "first_time" boolean DEFAULT false,
    "date_added" timestamp with time zone,
    "source" "text",
    "medium" "text",
    "direction" "text",
    "conversation_id" "text",
    "message_type" "text",
    "synced_at" timestamp with time zone DEFAULT "now"(),
    "channel" "text"
);


ALTER TABLE "public"."ghl_form_submissions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."ghl_form_submissions_view" AS
 SELECT "f"."id",
    "f"."location_id",
    "f"."contact_id",
    "f"."contact_name",
    "f"."contact_email",
    "f"."contact_phone",
    "f"."form_type",
    "f"."form_name",
    "f"."form_id",
    "f"."direction",
    "f"."date_added",
    "f"."page_url",
    "f"."message_body",
    "f"."message_type",
    "f"."conversation_id",
    "f"."first_time",
    "f"."synced_at",
    "f"."source" AS "raw_source",
    "f"."medium" AS "raw_medium",
        CASE
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") <> ''::"text")) THEN COALESCE((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'utmSource'::"text"), 'google'::"text")
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") <> ''::"text")) THEN COALESCE((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'utmSource'::"text"), 'facebook'::"text")
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Organic Search'::"text") THEN COALESCE((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'utmSource'::"text"), 'google'::"text")
            WHEN ("lower"((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text")) = ANY (ARRAY['direct'::"text", 'direct traffic'::"text"])) THEN 'direct'::"text"
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") IS NOT NULL) THEN "lower"((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text"))
            WHEN ("f"."source" IS NOT NULL) THEN "f"."source"
            ELSE 'direct'::"text"
        END AS "clean_source",
        CASE
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") <> ''::"text")) THEN 'cpc'::"text"
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") <> ''::"text")) THEN 'paid_social'::"text"
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Organic Search'::"text") THEN 'organic'::"text"
            WHEN ("lower"((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text")) = ANY (ARRAY['direct'::"text", 'direct traffic'::"text"])) THEN 'direct'::"text"
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Referral'::"text") THEN 'referral'::"text"
            WHEN ("f"."medium" = ANY (ARRAY['m'::"text", 'c'::"text"])) THEN 'cpc'::"text"
            WHEN ("f"."medium" IS NOT NULL) THEN "f"."medium"
            ELSE 'direct'::"text"
        END AS "clean_medium",
        CASE
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'gclid'::"text") <> ''::"text")) THEN 'google_ads'::"text"
            WHEN (((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") IS NOT NULL) AND ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'fbclid'::"text") <> ''::"text")) THEN 'facebook_ads'::"text"
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Organic Search'::"text") THEN 'organic'::"text"
            WHEN ((("ct"."raw_data" -> 'attributionSource'::"text") ->> 'sessionSource'::"text") = 'Referral'::"text") THEN 'referral'::"text"
            ELSE 'direct'::"text"
        END AS "clean_lead_type"
   FROM ("public"."ghl_form_submissions" "f"
     LEFT JOIN "public"."ghl_contacts" "ct" ON ((("ct"."id" = "f"."contact_id") AND ("ct"."location_id" = "f"."location_id"))));


ALTER VIEW "public"."ghl_form_submissions_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ghl_hipaa_calls" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "location_id" "text" NOT NULL,
    "date_time" timestamp with time zone,
    "contact_name" "text",
    "contact_phone" "text",
    "marketing_campaign" "text",
    "number_name" "text",
    "number_phone" "text",
    "source_type" "text",
    "direction" "text",
    "call_status" "text",
    "disposition" "text",
    "first_time" boolean DEFAULT false,
    "keyword" "text",
    "referrer" "text",
    "campaign" "text",
    "duration_seconds" integer DEFAULT 0,
    "device_type" "text",
    "qualified_lead" boolean DEFAULT false,
    "landing_page" "text",
    "from_number" "text",
    "to_number" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ghl_hipaa_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ghl_hipaa_forms" (
    "id" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "location_id" "text" NOT NULL,
    "name" "text",
    "phone" "text",
    "email" "text",
    "message" "text",
    "terms_and_conditions" "text",
    "ip" "text",
    "timezone" "text",
    "submission_date" timestamp with time zone,
    "url" "text",
    "uploaded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ghl_hipaa_forms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ghl_leads_daily" (
    "location_id" "text" NOT NULL,
    "report_date" "date" NOT NULL,
    "lead_type" "text" NOT NULL,
    "total_leads" integer DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ghl_leads_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gmb_insights_daily" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "text" NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "report_date" "date" NOT NULL,
    "metric_type" "text" NOT NULL,
    "value" bigint DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gmb_insights_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gmb_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "account_id" "text" NOT NULL,
    "location_id" "text" NOT NULL,
    "location_name" "text",
    "address" "text",
    "phone" "text",
    "website" "text",
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gmb_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gsc_daily_summary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "text" NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "report_date" "date" NOT NULL,
    "query" "text",
    "page" "text",
    "country" "text",
    "device" "text",
    "clicks" integer DEFAULT 0,
    "impressions" integer DEFAULT 0,
    "ctr" numeric DEFAULT 0,
    "position" numeric DEFAULT 0,
    "synced_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."gsc_daily_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_report_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "platform_account_id" "uuid" NOT NULL,
    "label" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."monthly_report_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_report_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "section_key" "text" NOT NULL,
    "title" "text",
    "content" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."monthly_report_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_report_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "upload_type" "text" NOT NULL,
    "platform_account_id" "uuid",
    "label" "text",
    "data" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."monthly_report_uploads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."monthly_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "agency_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "report_month" "date" NOT NULL,
    "title" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "included_platforms" "jsonb" DEFAULT '[]'::"jsonb",
    "published_data" "jsonb",
    "published_at" timestamp with time zone,
    CONSTRAINT "monthly_reports_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."monthly_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "permission_key" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "permission_label" "text",
    "category" "text" DEFAULT 'sidebar'::"text"
);


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reddit_campaign_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "report_date" "date" NOT NULL,
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "spend" numeric(15,6) DEFAULT 0,
    "purchase_views" integer DEFAULT 0,
    "purchase_clicks" integer DEFAULT 0,
    "purchase_total_value" numeric(15,6) DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "country" "text" DEFAULT 'ALL'::"text" NOT NULL,
    "cpc" numeric(15,6) DEFAULT 0,
    "ctr" numeric(15,6) DEFAULT 0,
    "ecpm" numeric(15,6) DEFAULT 0,
    "reach" bigint DEFAULT 0,
    "frequency" numeric(15,6) DEFAULT 0,
    "purchase_ecpa" numeric(15,6) DEFAULT 0,
    "lead_clicks" integer DEFAULT 0,
    "lead_views" integer DEFAULT 0,
    "sign_up_clicks" integer DEFAULT 0,
    "sign_up_views" integer DEFAULT 0,
    "page_visit_clicks" integer DEFAULT 0,
    "page_visit_views" integer DEFAULT 0,
    "add_to_cart_clicks" integer DEFAULT 0,
    "add_to_cart_views" integer DEFAULT 0,
    "add_to_cart_total_value" numeric(15,6) DEFAULT 0,
    "conversion_roas" numeric(15,6) DEFAULT 0,
    "video_started" bigint DEFAULT 0,
    "video_watched_25_pct" bigint DEFAULT 0,
    "video_watched_50_pct" bigint DEFAULT 0,
    "video_watched_75_pct" bigint DEFAULT 0,
    "video_watched_100_pct" bigint DEFAULT 0,
    "video_viewable_impressions" bigint DEFAULT 0,
    "ad_group_id" "text" DEFAULT ''::"text" NOT NULL,
    "ad_group_name" "text"
);


ALTER TABLE "public"."reddit_campaign_daily" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."reddit_campaign_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."reddit_campaign_daily_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."reddit_campaign_daily_id_seq" OWNED BY "public"."reddit_campaign_daily"."id";



CREATE TABLE IF NOT EXISTS "public"."reddit_customers" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "account_name" "text",
    "agency_id" "uuid",
    "currency" "text" DEFAULT 'USD'::"text",
    "timezone" "text" DEFAULT 'UTC'::"text",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reddit_customers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."reddit_customers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."reddit_customers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."reddit_customers_id_seq" OWNED BY "public"."reddit_customers"."id";



CREATE TABLE IF NOT EXISTS "public"."reddit_placement_daily" (
    "id" bigint NOT NULL,
    "customer_id" "text" NOT NULL,
    "campaign_id" "text" NOT NULL,
    "campaign_name" "text",
    "placement" "text" NOT NULL,
    "report_date" "date" NOT NULL,
    "impressions" bigint DEFAULT 0,
    "clicks" bigint DEFAULT 0,
    "spend" numeric(15,6) DEFAULT 0,
    "purchase_views" integer DEFAULT 0,
    "purchase_clicks" integer DEFAULT 0,
    "purchase_total_value" numeric(15,6) DEFAULT 0,
    "currency" "text" DEFAULT 'USD'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "country" "text" DEFAULT 'ALL'::"text",
    "cpc" numeric(15,6) DEFAULT 0,
    "ctr" numeric(15,6) DEFAULT 0,
    "ecpm" numeric(15,6) DEFAULT 0,
    "reach" bigint DEFAULT 0,
    "frequency" numeric(15,6) DEFAULT 0,
    "purchase_ecpa" numeric(15,6) DEFAULT 0,
    "lead_clicks" integer DEFAULT 0,
    "lead_views" integer DEFAULT 0,
    "sign_up_clicks" integer DEFAULT 0,
    "sign_up_views" integer DEFAULT 0,
    "page_visit_clicks" integer DEFAULT 0,
    "page_visit_views" integer DEFAULT 0,
    "add_to_cart_clicks" integer DEFAULT 0,
    "add_to_cart_views" integer DEFAULT 0,
    "add_to_cart_total_value" numeric(15,6) DEFAULT 0,
    "conversion_roas" numeric(15,6) DEFAULT 0,
    "video_started" bigint DEFAULT 0,
    "video_watched_25_pct" bigint DEFAULT 0,
    "video_watched_50_pct" bigint DEFAULT 0,
    "video_watched_75_pct" bigint DEFAULT 0,
    "video_watched_100_pct" bigint DEFAULT 0,
    "video_viewable_impressions" bigint DEFAULT 0
);


ALTER TABLE "public"."reddit_placement_daily" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."reddit_placement_daily_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."reddit_placement_daily_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."reddit_placement_daily_id_seq" OWNED BY "public"."reddit_placement_daily"."id";



CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role_name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sync_log" (
    "id" bigint NOT NULL,
    "agency_id" "uuid",
    "platform" "text" NOT NULL,
    "customer_id" "text" NOT NULL,
    "sync_type" "text" NOT NULL,
    "date_from" "date",
    "date_to" "date",
    "status" "text" DEFAULT 'pending'::"text",
    "rows_synced" integer DEFAULT 0,
    "error_message" "text",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "duration_ms" integer
);


ALTER TABLE "public"."sync_log" OWNER TO "postgres";


ALTER TABLE "public"."sync_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."sync_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "avatar_url" "text",
    "role_id" "uuid" NOT NULL,
    "agency_id" "uuid",
    "is_super_admin" boolean DEFAULT false,
    "last_login" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."fb_ad_daily" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fb_ad_daily_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fb_adset_daily" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fb_adset_daily_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fb_campaign_daily" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fb_campaign_daily_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fb_customers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fb_customers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."fb_placement_daily" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."fb_placement_daily_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."reddit_campaign_daily" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."reddit_campaign_daily_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."reddit_customers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."reddit_customers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."reddit_placement_daily" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."reddit_placement_daily_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_agency_slug_key" UNIQUE ("agency_slug");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_client_code_key" UNIQUE ("client_code");



ALTER TABLE ONLY "public"."agencies"
    ADD CONSTRAINT "agencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agency_platform_credentials"
    ADD CONSTRAINT "agency_platform_credentials_agency_platform_email_key" UNIQUE ("agency_id", "platform", "google_email");



ALTER TABLE ONLY "public"."agency_platform_credentials"
    ADD CONSTRAINT "agency_platform_credentials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agency_report_tabs"
    ADD CONSTRAINT "agency_report_tabs_agency_platform_tab_key_key" UNIQUE ("agency_id", "platform", "tab_key");



ALTER TABLE ONLY "public"."agency_report_tabs"
    ADD CONSTRAINT "agency_report_tabs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_platform_accounts"
    ADD CONSTRAINT "client_platform_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_platform_accounts"
    ADD CONSTRAINT "client_platform_accounts_platform_platform_customer_id_key" UNIQUE ("platform", "platform_customer_id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fb_ad_daily"
    ADD CONSTRAINT "fb_ad_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fb_adset_daily"
    ADD CONSTRAINT "fb_adset_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fb_campaign_daily"
    ADD CONSTRAINT "fb_campaign_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fb_customers"
    ADD CONSTRAINT "fb_customers_customer_id_key" UNIQUE ("customer_id");



ALTER TABLE ONLY "public"."fb_customers"
    ADD CONSTRAINT "fb_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fb_placement_daily"
    ADD CONSTRAINT "fb_placement_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ga4_classified_pages"
    ADD CONSTRAINT "ga4_classified_pages_customer_id_page_path_key" UNIQUE ("customer_id", "page_path");



ALTER TABLE ONLY "public"."ga4_classified_pages"
    ADD CONSTRAINT "ga4_classified_pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ga4_daily_summary"
    ADD CONSTRAINT "ga4_daily_summary_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ga4_events"
    ADD CONSTRAINT "ga4_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ga4_monthly_reports"
    ADD CONSTRAINT "ga4_monthly_reports_customer_id_report_month_report_type_key" UNIQUE ("customer_id", "report_month", "report_type");



ALTER TABLE ONLY "public"."ga4_monthly_reports"
    ADD CONSTRAINT "ga4_monthly_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ga4_page_rules"
    ADD CONSTRAINT "ga4_page_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ga4_raw"
    ADD CONSTRAINT "ga4_raw_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ga4_reporting_events"
    ADD CONSTRAINT "ga4_reporting_events_customer_id_event_name_key" UNIQUE ("customer_id", "event_name");



ALTER TABLE ONLY "public"."ga4_reporting_events"
    ADD CONSTRAINT "ga4_reporting_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gads_adgroup_daily"
    ADD CONSTRAINT "gads_adgroup_daily_customer_id_ad_group_id_date_key" UNIQUE ("customer_id", "ad_group_id", "date");



ALTER TABLE ONLY "public"."gads_adgroup_daily"
    ADD CONSTRAINT "gads_adgroup_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gads_adgroup_status"
    ADD CONSTRAINT "gads_adgroup_status_customer_id_ad_group_id_key" UNIQUE ("customer_id", "ad_group_id");



ALTER TABLE ONLY "public"."gads_adgroup_status"
    ADD CONSTRAINT "gads_adgroup_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gads_campaign_daily"
    ADD CONSTRAINT "gads_campaign_daily_customer_id_campaign_id_date_key" UNIQUE ("customer_id", "campaign_id", "date");



ALTER TABLE ONLY "public"."gads_campaign_daily"
    ADD CONSTRAINT "gads_campaign_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gads_campaign_status"
    ADD CONSTRAINT "gads_campaign_status_customer_id_campaign_id_key" UNIQUE ("customer_id", "campaign_id");



ALTER TABLE ONLY "public"."gads_campaign_status"
    ADD CONSTRAINT "gads_campaign_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gads_conversion_actions"
    ADD CONSTRAINT "gads_conversion_actions_customer_id_conversion_action_id_key" UNIQUE ("customer_id", "conversion_action_id");



ALTER TABLE ONLY "public"."gads_conversion_actions"
    ADD CONSTRAINT "gads_conversion_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gads_conversion_daily"
    ADD CONSTRAINT "gads_conversion_daily_customer_id_campaign_id_conversion_ac_key" UNIQUE ("customer_id", "campaign_id", "conversion_action_id", "date");



ALTER TABLE ONLY "public"."gads_conversion_daily"
    ADD CONSTRAINT "gads_conversion_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gads_customers"
    ADD CONSTRAINT "gads_customers_pkey" PRIMARY KEY ("customer_id");



ALTER TABLE ONLY "public"."gads_geo_constants"
    ADD CONSTRAINT "gads_geo_constants_pkey" PRIMARY KEY ("geo_id");



ALTER TABLE ONLY "public"."gads_geo_location_daily"
    ADD CONSTRAINT "gads_geo_location_daily_customer_id_campaign_id_country_reg_key" UNIQUE ("customer_id", "campaign_id", "country", "region", "city", "most_specific", "date");



ALTER TABLE ONLY "public"."gads_geo_location_daily"
    ADD CONSTRAINT "gads_geo_location_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gads_keyword_daily"
    ADD CONSTRAINT "gads_keyword_daily_customer_id_ad_group_id_keyword_id_date_key" UNIQUE ("customer_id", "ad_group_id", "keyword_id", "date");



ALTER TABLE ONLY "public"."gads_keyword_daily"
    ADD CONSTRAINT "gads_keyword_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gads_keyword_status"
    ADD CONSTRAINT "gads_keyword_status_customer_id_ad_group_id_keyword_id_key" UNIQUE ("customer_id", "ad_group_id", "keyword_id");



ALTER TABLE ONLY "public"."gads_keyword_status"
    ADD CONSTRAINT "gads_keyword_status_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gads_search_term_daily"
    ADD CONSTRAINT "gads_search_term_daily_customer_id_campaign_id_ad_group_id__key" UNIQUE ("customer_id", "campaign_id", "ad_group_id", "search_term", "date");



ALTER TABLE ONLY "public"."gads_search_term_daily"
    ADD CONSTRAINT "gads_search_term_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ghl_activity_daily"
    ADD CONSTRAINT "ghl_activity_daily_pkey" PRIMARY KEY ("location_id", "report_date", "activity_type", "subtype");



ALTER TABLE ONLY "public"."ghl_calls"
    ADD CONSTRAINT "ghl_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ghl_contacts"
    ADD CONSTRAINT "ghl_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ghl_form_submissions"
    ADD CONSTRAINT "ghl_form_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ghl_hipaa_calls"
    ADD CONSTRAINT "ghl_hipaa_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ghl_hipaa_forms"
    ADD CONSTRAINT "ghl_hipaa_forms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ghl_leads_daily"
    ADD CONSTRAINT "ghl_leads_daily_pkey" PRIMARY KEY ("location_id", "report_date", "lead_type");



ALTER TABLE ONLY "public"."gmb_insights_daily"
    ADD CONSTRAINT "gmb_insights_daily_customer_id_agency_id_report_date_metric_key" UNIQUE ("customer_id", "agency_id", "report_date", "metric_type");



ALTER TABLE ONLY "public"."gmb_insights_daily"
    ADD CONSTRAINT "gmb_insights_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gmb_locations"
    ADD CONSTRAINT "gmb_locations_agency_id_account_id_location_id_key" UNIQUE ("agency_id", "account_id", "location_id");



ALTER TABLE ONLY "public"."gmb_locations"
    ADD CONSTRAINT "gmb_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gsc_daily_summary"
    ADD CONSTRAINT "gsc_daily_summary_customer_id_agency_id_report_date_query_p_key" UNIQUE ("customer_id", "agency_id", "report_date", "query", "page", "country", "device");



ALTER TABLE ONLY "public"."gsc_daily_summary"
    ADD CONSTRAINT "gsc_daily_summary_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_report_accounts"
    ADD CONSTRAINT "monthly_report_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_report_accounts"
    ADD CONSTRAINT "monthly_report_accounts_report_id_platform_account_id_key" UNIQUE ("report_id", "platform_account_id");



ALTER TABLE ONLY "public"."monthly_report_sections"
    ADD CONSTRAINT "monthly_report_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_report_uploads"
    ADD CONSTRAINT "monthly_report_uploads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."monthly_reports"
    ADD CONSTRAINT "monthly_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_permission_key_key" UNIQUE ("permission_key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reddit_campaign_daily"
    ADD CONSTRAINT "reddit_campaign_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reddit_customers"
    ADD CONSTRAINT "reddit_customers_customer_id_key" UNIQUE ("customer_id");



ALTER TABLE ONLY "public"."reddit_customers"
    ADD CONSTRAINT "reddit_customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reddit_placement_daily"
    ADD CONSTRAINT "reddit_placement_daily_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_permission_id_key" UNIQUE ("role_id", "permission_id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_role_name_key" UNIQUE ("role_name");



ALTER TABLE ONLY "public"."sync_log"
    ADD CONSTRAINT "sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_clients"
    ADD CONSTRAINT "user_clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_clients"
    ADD CONSTRAINT "user_clients_user_id_client_id_key" UNIQUE ("user_id", "client_id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "fb_ad_daily_cust_date" ON "public"."fb_ad_daily" USING "btree" ("customer_id", "report_date");



CREATE UNIQUE INDEX "fb_ad_daily_uq" ON "public"."fb_ad_daily" USING "btree" ("customer_id", "campaign_id", "adset_id", "ad_id", "report_date");



CREATE INDEX "fb_adset_daily_cust_date" ON "public"."fb_adset_daily" USING "btree" ("customer_id", "report_date");



CREATE UNIQUE INDEX "fb_adset_daily_uq" ON "public"."fb_adset_daily" USING "btree" ("customer_id", "campaign_id", "adset_id", "report_date");



CREATE INDEX "fb_campaign_daily_cust_date" ON "public"."fb_campaign_daily" USING "btree" ("customer_id", "report_date");



CREATE UNIQUE INDEX "fb_campaign_daily_uq" ON "public"."fb_campaign_daily" USING "btree" ("customer_id", "campaign_id", "report_date");



CREATE INDEX "fb_placement_daily_cust_date" ON "public"."fb_placement_daily" USING "btree" ("customer_id", "report_date");



CREATE UNIQUE INDEX "fb_placement_daily_uq" ON "public"."fb_placement_daily" USING "btree" ("customer_id", "campaign_id", "publisher_platform", "platform_position", "report_date");



CREATE INDEX "idx_ag_daily_cust" ON "public"."gads_adgroup_daily" USING "btree" ("customer_id");



CREATE INDEX "idx_ag_daily_cust_date" ON "public"."gads_adgroup_daily" USING "btree" ("customer_id", "date");



CREATE INDEX "idx_ag_status_cust" ON "public"."gads_adgroup_status" USING "btree" ("customer_id");



CREATE INDEX "idx_camp_daily_cust" ON "public"."gads_campaign_daily" USING "btree" ("customer_id");



CREATE INDEX "idx_camp_daily_cust_date" ON "public"."gads_campaign_daily" USING "btree" ("customer_id", "date");



CREATE INDEX "idx_camp_daily_date" ON "public"."gads_campaign_daily" USING "btree" ("date");



CREATE INDEX "idx_camp_status_cust" ON "public"."gads_campaign_status" USING "btree" ("customer_id");



CREATE INDEX "idx_camp_status_cust_id" ON "public"."gads_campaign_status" USING "btree" ("customer_id", "campaign_id");



CREATE INDEX "idx_client_platform_accounts_client_id" ON "public"."client_platform_accounts" USING "btree" ("client_id");



CREATE INDEX "idx_conv_daily_cust" ON "public"."gads_conversion_daily" USING "btree" ("customer_id");



CREATE INDEX "idx_conv_daily_cust_date" ON "public"."gads_conversion_daily" USING "btree" ("customer_id", "date");



CREATE INDEX "idx_cpa_agency_active_custid" ON "public"."client_platform_accounts" USING "btree" ("agency_id", "is_active", "platform_customer_id");



CREATE INDEX "idx_cpa_platform_custid_active" ON "public"."client_platform_accounts" USING "btree" ("platform_customer_id", "is_active", "agency_id");



CREATE INDEX "idx_ga4_events_cust_date" ON "public"."ga4_events" USING "btree" ("customer_id", "report_date");



CREATE INDEX "idx_ga4_events_reporting" ON "public"."ga4_events" USING "btree" ("customer_id", "report_date", "is_reporting_event") WHERE ("is_reporting_event" = true);



CREATE INDEX "idx_ga4_monthly_reports_lookup" ON "public"."ga4_monthly_reports" USING "btree" ("customer_id", "report_month", "report_type");



CREATE INDEX "idx_ga4_raw_customer_date" ON "public"."ga4_raw" USING "btree" ("customer_id", "report_date");



CREATE INDEX "idx_ga4_raw_customer_date_path" ON "public"."ga4_raw" USING "btree" ("customer_id", "report_date", "page_path");



CREATE INDEX "idx_ga4_raw_page_type" ON "public"."ga4_raw" USING "btree" ("customer_id", "report_date", "page_type");



CREATE INDEX "idx_ga4_summary_cid_date" ON "public"."ga4_daily_summary" USING "btree" ("customer_id", "report_date");



CREATE INDEX "idx_ga4_summary_customer_date" ON "public"."ga4_daily_summary" USING "btree" ("customer_id", "report_date");



CREATE INDEX "idx_ga4ds_agency" ON "public"."ga4_daily_summary" USING "btree" ("agency_id");



CREATE INDEX "idx_ga4ds_customer_date" ON "public"."ga4_daily_summary" USING "btree" ("customer_id", "report_date");



CREATE INDEX "idx_ga4r_agency" ON "public"."ga4_raw" USING "btree" ("agency_id");



CREATE INDEX "idx_ga4r_channel" ON "public"."ga4_raw" USING "btree" ("channel_group");



CREATE INDEX "idx_ga4r_composite" ON "public"."ga4_raw" USING "btree" ("customer_id", "report_date", "channel_group", "page_type");



CREATE INDEX "idx_ga4r_customer_date" ON "public"."ga4_raw" USING "btree" ("customer_id", "report_date");



CREATE INDEX "idx_ga4r_date" ON "public"."ga4_raw" USING "btree" ("report_date");



CREATE INDEX "idx_ga4r_page_location" ON "public"."ga4_raw" USING "btree" ("page_location");



CREATE INDEX "idx_ga4r_page_type" ON "public"."ga4_raw" USING "btree" ("page_type") WHERE ("page_type" IS NOT NULL);



CREATE INDEX "idx_gcp_customer_type" ON "public"."ga4_classified_pages" USING "btree" ("customer_id", "page_type");



CREATE INDEX "idx_geo_daily_cust" ON "public"."gads_geo_location_daily" USING "btree" ("customer_id");



CREATE INDEX "idx_geo_daily_date" ON "public"."gads_geo_location_daily" USING "btree" ("date");



CREATE INDEX "idx_ghl_activity_date" ON "public"."ghl_activity_daily" USING "btree" ("location_id", "report_date");



CREATE INDEX "idx_ghl_calls_date" ON "public"."ghl_calls" USING "btree" ("location_id", "date_added");



CREATE INDEX "idx_ghl_calls_dir" ON "public"."ghl_calls" USING "btree" ("location_id", "direction", "status");



CREATE INDEX "idx_ghl_calls_loc" ON "public"."ghl_calls" USING "btree" ("location_id");



CREATE INDEX "idx_ghl_contacts_date" ON "public"."ghl_contacts" USING "btree" ("location_id", "date_added");



CREATE INDEX "idx_ghl_contacts_lead" ON "public"."ghl_contacts" USING "btree" ("location_id", "lead_type");



CREATE INDEX "idx_ghl_contacts_loc" ON "public"."ghl_contacts" USING "btree" ("location_id");



CREATE INDEX "idx_ghl_forms_date" ON "public"."ghl_form_submissions" USING "btree" ("location_id", "date_added");



CREATE INDEX "idx_ghl_forms_loc" ON "public"."ghl_form_submissions" USING "btree" ("location_id");



CREATE INDEX "idx_ghl_forms_type" ON "public"."ghl_form_submissions" USING "btree" ("location_id", "form_type");



CREATE INDEX "idx_ghl_leads_date" ON "public"."ghl_leads_daily" USING "btree" ("location_id", "report_date");



CREATE INDEX "idx_gmb_insights_agency" ON "public"."gmb_insights_daily" USING "btree" ("agency_id");



CREATE INDEX "idx_gmb_insights_customer" ON "public"."gmb_insights_daily" USING "btree" ("customer_id");



CREATE INDEX "idx_gmb_insights_date" ON "public"."gmb_insights_daily" USING "btree" ("report_date");



CREATE INDEX "idx_gmb_locations_agency" ON "public"."gmb_locations" USING "btree" ("agency_id");



CREATE INDEX "idx_gsc_daily_agency" ON "public"."gsc_daily_summary" USING "btree" ("agency_id");



CREATE INDEX "idx_gsc_daily_customer" ON "public"."gsc_daily_summary" USING "btree" ("customer_id");



CREATE INDEX "idx_gsc_daily_date" ON "public"."gsc_daily_summary" USING "btree" ("report_date");



CREATE INDEX "idx_hipaa_calls_loc_date" ON "public"."ghl_hipaa_calls" USING "btree" ("location_id", "date_time");



CREATE INDEX "idx_hipaa_forms_loc_date" ON "public"."ghl_hipaa_forms" USING "btree" ("location_id", "submission_date");



CREATE INDEX "idx_kw_daily_cust" ON "public"."gads_keyword_daily" USING "btree" ("customer_id");



CREATE INDEX "idx_kw_daily_cust_date" ON "public"."gads_keyword_daily" USING "btree" ("customer_id", "date");



CREATE INDEX "idx_kw_status_cust" ON "public"."gads_keyword_status" USING "btree" ("customer_id");



CREATE INDEX "idx_monthly_report_sections_report" ON "public"."monthly_report_sections" USING "btree" ("report_id");



CREATE INDEX "idx_monthly_report_uploads_report" ON "public"."monthly_report_uploads" USING "btree" ("report_id");



CREATE INDEX "idx_monthly_reports_agency_client" ON "public"."monthly_reports" USING "btree" ("agency_id", "client_id");



CREATE INDEX "idx_monthly_reports_report_month" ON "public"."monthly_reports" USING "btree" ("report_month");



CREATE INDEX "idx_pagerules_lookup" ON "public"."ga4_page_rules" USING "btree" ("platform", "customer_id", "is_active", "priority");



CREATE INDEX "idx_reddit_campaign_daily_cid" ON "public"."reddit_campaign_daily" USING "btree" ("customer_id");



CREATE INDEX "idx_reddit_campaign_daily_cid_date" ON "public"."reddit_campaign_daily" USING "btree" ("customer_id", "report_date");



CREATE INDEX "idx_reddit_campaign_daily_country" ON "public"."reddit_campaign_daily" USING "btree" ("country");



CREATE INDEX "idx_reddit_campaign_daily_date" ON "public"."reddit_campaign_daily" USING "btree" ("report_date");



CREATE INDEX "idx_reddit_placement_daily_cid_date" ON "public"."reddit_placement_daily" USING "btree" ("customer_id", "report_date");



CREATE INDEX "idx_reddit_placement_daily_country" ON "public"."reddit_placement_daily" USING "btree" ("country");



CREATE INDEX "idx_reddit_placement_daily_date" ON "public"."reddit_placement_daily" USING "btree" ("report_date");



CREATE INDEX "idx_st_daily_cust" ON "public"."gads_search_term_daily" USING "btree" ("customer_id");



CREATE INDEX "idx_sync_log_agency" ON "public"."sync_log" USING "btree" ("agency_id");



CREATE INDEX "idx_sync_log_agency_id" ON "public"."sync_log" USING "btree" ("agency_id");



CREATE INDEX "idx_sync_log_customer_id" ON "public"."sync_log" USING "btree" ("customer_id");



CREATE INDEX "idx_sync_log_started_at" ON "public"."sync_log" USING "btree" ("started_at" DESC);



CREATE INDEX "idx_sync_log_status" ON "public"."sync_log" USING "btree" ("status");



CREATE UNIQUE INDEX "reddit_campaign_daily_uq" ON "public"."reddit_campaign_daily" USING "btree" ("customer_id", "campaign_id", "ad_group_id", "report_date");



CREATE UNIQUE INDEX "reddit_placement_daily_uq" ON "public"."reddit_placement_daily" USING "btree" ("customer_id", "campaign_id", "placement", "report_date");



CREATE UNIQUE INDEX "uq_agency_platform_ga4_email" ON "public"."agency_platform_credentials" USING "btree" ("agency_id", "platform", "google_email") WHERE ("platform" = 'ga4'::"text");



CREATE UNIQUE INDEX "uq_agency_platform_non_ga4" ON "public"."agency_platform_credentials" USING "btree" ("agency_id", "platform") WHERE ("platform" <> 'ga4'::"text");



ALTER TABLE ONLY "public"."agency_platform_credentials"
    ADD CONSTRAINT "agency_platform_credentials_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agency_platform_credentials"
    ADD CONSTRAINT "agency_platform_credentials_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "public"."user_profiles"("id");



ALTER TABLE ONLY "public"."agency_report_tabs"
    ADD CONSTRAINT "agency_report_tabs_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_platform_accounts"
    ADD CONSTRAINT "client_platform_accounts_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_platform_accounts"
    ADD CONSTRAINT "client_platform_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_platform_accounts"
    ADD CONSTRAINT "client_platform_accounts_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "public"."agency_platform_credentials"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."fb_customers"
    ADD CONSTRAINT "fb_customers_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id");



ALTER TABLE ONLY "public"."ga4_raw"
    ADD CONSTRAINT "ga4_raw_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id");



ALTER TABLE ONLY "public"."monthly_report_accounts"
    ADD CONSTRAINT "monthly_report_accounts_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "public"."client_platform_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_report_accounts"
    ADD CONSTRAINT "monthly_report_accounts_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."monthly_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_report_sections"
    ADD CONSTRAINT "monthly_report_sections_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."monthly_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_report_uploads"
    ADD CONSTRAINT "monthly_report_uploads_platform_account_id_fkey" FOREIGN KEY ("platform_account_id") REFERENCES "public"."client_platform_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."monthly_report_uploads"
    ADD CONSTRAINT "monthly_report_uploads_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."monthly_reports"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_reports"
    ADD CONSTRAINT "monthly_reports_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."monthly_reports"
    ADD CONSTRAINT "monthly_reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reddit_customers"
    ADD CONSTRAINT "reddit_customers_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sync_log"
    ADD CONSTRAINT "sync_log_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id");



ALTER TABLE ONLY "public"."user_clients"
    ADD CONSTRAINT "user_clients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."client_platform_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_clients"
    ADD CONSTRAINT "user_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



CREATE POLICY "Admin manages profiles" ON "public"."user_profiles" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admin manages user_clients" ON "public"."user_clients" TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Agency admin manages accounts" ON "public"."client_platform_accounts" TO "authenticated" USING ("public"."is_agency_admin"("agency_id"));



CREATE POLICY "Agency admin manages credentials" ON "public"."agency_platform_credentials" TO "authenticated" USING ("public"."is_agency_admin"("agency_id"));



CREATE POLICY "Agency admin manages tabs" ON "public"."agency_report_tabs" TO "authenticated" USING ("public"."is_agency_admin"("agency_id"));



CREATE POLICY "Agency admin reads agency profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ((("agency_id" = "public"."get_user_agency_id"()) AND "public"."is_admin"()));



CREATE POLICY "Agency admin updates own agency" ON "public"."agencies" FOR UPDATE TO "authenticated" USING ("public"."is_agency_admin"("id"));



CREATE POLICY "Agency manages clients" ON "public"."clients" TO "authenticated" USING ((("agency_id" IN ( SELECT "user_profiles"."agency_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true)))))) WITH CHECK ((("agency_id" IN ( SELECT "user_profiles"."agency_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "Agency manages monthly_report_accounts" ON "public"."monthly_report_accounts" TO "authenticated" USING (("report_id" IN ( SELECT "mr"."id"
   FROM "public"."monthly_reports" "mr"
  WHERE (("mr"."agency_id" IN ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."user_profiles"
          WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))))));



CREATE POLICY "Agency manages monthly_report_sections" ON "public"."monthly_report_sections" TO "authenticated" USING (("report_id" IN ( SELECT "mr"."id"
   FROM "public"."monthly_reports" "mr"
  WHERE (("mr"."agency_id" IN ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."user_profiles"
          WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))))));



CREATE POLICY "Agency manages monthly_report_uploads" ON "public"."monthly_report_uploads" TO "authenticated" USING (("report_id" IN ( SELECT "mr"."id"
   FROM "public"."monthly_reports" "mr"
  WHERE (("mr"."agency_id" IN ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."user_profiles"
          WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))))));



CREATE POLICY "Agency manages monthly_reports" ON "public"."monthly_reports" TO "authenticated" USING ((("agency_id" IN ( SELECT "user_profiles"."agency_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true)))))) WITH CHECK ((("agency_id" IN ( SELECT "user_profiles"."agency_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "Agency members read accounts" ON "public"."client_platform_accounts" FOR SELECT TO "authenticated" USING ((("agency_id" IN ( SELECT "user_profiles"."agency_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))) OR "public"."is_super_admin"()));



CREATE POLICY "Agency members read sync log" ON "public"."sync_log" FOR SELECT TO "authenticated" USING ((("agency_id" IN ( SELECT "user_profiles"."agency_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))) OR "public"."is_super_admin"()));



CREATE POLICY "Agency members read tabs" ON "public"."agency_report_tabs" FOR SELECT TO "authenticated" USING ((("agency_id" IN ( SELECT "user_profiles"."agency_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))) OR "public"."is_super_admin"()));



CREATE POLICY "Allow authenticated read ga4_daily_summary" ON "public"."ga4_daily_summary" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated read ga4_raw" ON "public"."ga4_raw" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone reads geo_constants" ON "public"."gads_geo_constants" FOR SELECT USING (true);



CREATE POLICY "Anyone reads permissions" ON "public"."permissions" FOR SELECT USING (true);



CREATE POLICY "Anyone reads role_permissions" ON "public"."role_permissions" FOR SELECT USING (true);



CREATE POLICY "Anyone reads roles" ON "public"."roles" FOR SELECT USING (true);



CREATE POLICY "Super admin manages agencies" ON "public"."agencies" TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admin manages permissions" ON "public"."permissions" TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admin manages role_permissions" ON "public"."role_permissions" TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admin manages roles" ON "public"."roles" TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admin reads all credentials" ON "public"."agency_platform_credentials" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Super admin reads all profiles" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());



CREATE POLICY "Users can insert sync_log for their agency" ON "public"."sync_log" FOR INSERT WITH CHECK (("agency_id" IN ( SELECT "user_profiles"."agency_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users can read sync_log for their agency" ON "public"."sync_log" FOR SELECT USING (("agency_id" IN ( SELECT "user_profiles"."agency_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))));



CREATE POLICY "Users read own agency" ON "public"."agencies" FOR SELECT TO "authenticated" USING ((("id" IN ( SELECT "user_profiles"."agency_id"
   FROM "public"."user_profiles"
  WHERE ("user_profiles"."id" = "auth"."uid"()))) OR "public"."is_super_admin"()));



CREATE POLICY "Users read own mappings" ON "public"."user_clients" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users read own profile" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



ALTER TABLE "public"."agencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agency_platform_credentials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agency_report_tabs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon_read" ON "public"."gads_adgroup_daily" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_adgroup_status" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_campaign_daily" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_campaign_status" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_conversion_actions" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_conversion_daily" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_customers" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_geo_constants" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_geo_location_daily" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_keyword_daily" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_keyword_status" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon_read" ON "public"."gads_search_term_daily" FOR SELECT TO "anon" USING (true);



CREATE POLICY "auth_read" ON "public"."ghl_activity_daily" FOR SELECT TO "authenticated" USING ((("location_id" IN ( SELECT "client_platform_accounts"."platform_customer_id"
   FROM "public"."client_platform_accounts"
  WHERE (("client_platform_accounts"."is_active" = true) AND (("client_platform_accounts"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("client_platform_accounts"."id" IN ( SELECT "user_clients"."client_id"
           FROM "public"."user_clients"
          WHERE ("user_clients"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "auth_read" ON "public"."ghl_calls" FOR SELECT TO "authenticated" USING ((("location_id" IN ( SELECT "client_platform_accounts"."platform_customer_id"
   FROM "public"."client_platform_accounts"
  WHERE (("client_platform_accounts"."is_active" = true) AND (("client_platform_accounts"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("client_platform_accounts"."id" IN ( SELECT "user_clients"."client_id"
           FROM "public"."user_clients"
          WHERE ("user_clients"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "auth_read" ON "public"."ghl_contacts" FOR SELECT TO "authenticated" USING ((("location_id" IN ( SELECT "client_platform_accounts"."platform_customer_id"
   FROM "public"."client_platform_accounts"
  WHERE (("client_platform_accounts"."is_active" = true) AND (("client_platform_accounts"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("client_platform_accounts"."id" IN ( SELECT "user_clients"."client_id"
           FROM "public"."user_clients"
          WHERE ("user_clients"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "auth_read" ON "public"."ghl_form_submissions" FOR SELECT TO "authenticated" USING ((("location_id" IN ( SELECT "client_platform_accounts"."platform_customer_id"
   FROM "public"."client_platform_accounts"
  WHERE (("client_platform_accounts"."is_active" = true) AND (("client_platform_accounts"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("client_platform_accounts"."id" IN ( SELECT "user_clients"."client_id"
           FROM "public"."user_clients"
          WHERE ("user_clients"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "auth_read" ON "public"."ghl_leads_daily" FOR SELECT TO "authenticated" USING ((("location_id" IN ( SELECT "client_platform_accounts"."platform_customer_id"
   FROM "public"."client_platform_accounts"
  WHERE (("client_platform_accounts"."is_active" = true) AND (("client_platform_accounts"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("client_platform_accounts"."id" IN ( SELECT "user_clients"."client_id"
           FROM "public"."user_clients"
          WHERE ("user_clients"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



ALTER TABLE "public"."client_platform_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."fb_ad_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fb_ad_daily_delete_policy" ON "public"."fb_ad_daily" FOR DELETE USING ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_ad_daily_insert_policy" ON "public"."fb_ad_daily" FOR INSERT WITH CHECK ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_ad_daily_select_policy" ON "public"."fb_ad_daily" FOR SELECT USING ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_ad_daily_update_policy" ON "public"."fb_ad_daily" FOR UPDATE USING ("public"."can_access_customer"("customer_id"));



ALTER TABLE "public"."fb_adset_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fb_adset_daily_delete_policy" ON "public"."fb_adset_daily" FOR DELETE USING ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_adset_daily_insert_policy" ON "public"."fb_adset_daily" FOR INSERT WITH CHECK ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_adset_daily_select_policy" ON "public"."fb_adset_daily" FOR SELECT USING ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_adset_daily_update_policy" ON "public"."fb_adset_daily" FOR UPDATE USING ("public"."can_access_customer"("customer_id"));



ALTER TABLE "public"."fb_campaign_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fb_campaign_daily_delete_policy" ON "public"."fb_campaign_daily" FOR DELETE USING ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_campaign_daily_insert_policy" ON "public"."fb_campaign_daily" FOR INSERT WITH CHECK ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_campaign_daily_select_policy" ON "public"."fb_campaign_daily" FOR SELECT USING ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_campaign_daily_update_policy" ON "public"."fb_campaign_daily" FOR UPDATE USING ("public"."can_access_customer"("customer_id"));



ALTER TABLE "public"."fb_customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fb_customers_delete_policy" ON "public"."fb_customers" FOR DELETE USING ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_customers_insert_policy" ON "public"."fb_customers" FOR INSERT WITH CHECK ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_customers_select_policy" ON "public"."fb_customers" FOR SELECT USING ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_customers_update_policy" ON "public"."fb_customers" FOR UPDATE USING ("public"."can_access_customer"("customer_id"));



ALTER TABLE "public"."fb_placement_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fb_placement_daily_delete_policy" ON "public"."fb_placement_daily" FOR DELETE USING ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_placement_daily_insert_policy" ON "public"."fb_placement_daily" FOR INSERT WITH CHECK ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_placement_daily_select_policy" ON "public"."fb_placement_daily" FOR SELECT USING ("public"."can_access_customer"("customer_id"));



CREATE POLICY "fb_placement_daily_update_policy" ON "public"."fb_placement_daily" FOR UPDATE USING ("public"."can_access_customer"("customer_id"));



ALTER TABLE "public"."ga4_classified_pages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ga4_daily_summary" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ga4_page_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ga4_raw" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ga4r_all" ON "public"."ga4_raw" USING (("agency_id" = ( SELECT "public"."get_user_agency_id"() AS "get_user_agency_id")));



ALTER TABLE "public"."gads_adgroup_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_adgroup_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_campaign_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_campaign_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_conversion_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_conversion_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_geo_constants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_geo_location_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_keyword_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_keyword_status" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gads_search_term_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ghl_activity_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ghl_calls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ghl_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ghl_form_submissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ghl_leads_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gmb_insights_daily" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gmb_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gsc_daily_summary" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_report_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_report_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_report_uploads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."monthly_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reddit_campaign_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reddit_campaign_daily_select" ON "public"."reddit_campaign_daily" FOR SELECT USING ("public"."can_access_customer"("customer_id"));



ALTER TABLE "public"."reddit_customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reddit_customers_insert" ON "public"."reddit_customers" FOR INSERT WITH CHECK ("public"."can_access_customer"("customer_id"));



CREATE POLICY "reddit_customers_select" ON "public"."reddit_customers" FOR SELECT USING ("public"."can_access_customer"("customer_id"));



ALTER TABLE "public"."reddit_placement_daily" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reddit_placement_daily_select" ON "public"."reddit_placement_daily" FOR SELECT USING ("public"."can_access_customer"("customer_id"));



ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "secure_read" ON "public"."gads_adgroup_daily" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "secure_read" ON "public"."gads_adgroup_status" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "secure_read" ON "public"."gads_campaign_daily" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "secure_read" ON "public"."gads_campaign_status" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "secure_read" ON "public"."gads_conversion_actions" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "secure_read" ON "public"."gads_conversion_daily" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "secure_read" ON "public"."gads_customers" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "secure_read" ON "public"."gads_geo_location_daily" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "secure_read" ON "public"."gads_keyword_daily" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "secure_read" ON "public"."gads_keyword_status" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "secure_read" ON "public"."gads_search_term_daily" FOR SELECT TO "authenticated" USING ((("customer_id" IN ( SELECT "cpa"."platform_customer_id"
   FROM "public"."client_platform_accounts" "cpa"
  WHERE (("cpa"."is_active" = true) AND (("cpa"."agency_id" = ( SELECT "user_profiles"."agency_id"
           FROM "public"."user_profiles"
          WHERE ("user_profiles"."id" = "auth"."uid"()))) OR ("cpa"."id" IN ( SELECT "uc"."client_id"
           FROM "public"."user_clients" "uc"
          WHERE ("uc"."user_id" = "auth"."uid"()))))))) OR (EXISTS ( SELECT 1
   FROM "public"."user_profiles"
  WHERE (("user_profiles"."id" = "auth"."uid"()) AND ("user_profiles"."is_super_admin" = true))))));



CREATE POLICY "service_full" ON "public"."ghl_activity_daily" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_full" ON "public"."ghl_calls" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_full" ON "public"."ghl_contacts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_full" ON "public"."ghl_form_submissions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_full" ON "public"."ghl_leads_daily" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."sync_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





























































































































































































GRANT ALL ON FUNCTION "public"."can_access_customer"("p_customer_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."can_access_customer"("p_customer_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_customer"("p_customer_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."classify_ghl_lead_type"("p_source" "text", "p_medium" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."classify_ghl_lead_type"("p_source" "text", "p_medium" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."classify_ghl_lead_type"("p_source" "text", "p_medium" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_orphaned_fb_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_fb_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_fb_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_orphaned_gads_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_gads_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_gads_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_orphaned_reddit_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_reddit_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_reddit_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fb_metrics_sync_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."fb_metrics_sync_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fb_metrics_sync_all"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ga4_advanced_report"("p_customer_id" "text", "p_report_month" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ga4_advanced_report"("p_customer_id" "text", "p_report_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ga4_advanced_report"("p_customer_id" "text", "p_report_month" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ga4_advanced_report"("p_customer_id" "text", "p_date_from" "date", "p_date_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."ga4_advanced_report"("p_customer_id" "text", "p_date_from" "date", "p_date_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ga4_advanced_report"("p_customer_id" "text", "p_date_from" "date", "p_date_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."ga4_backfill_page_types"("p_agency_id" "uuid", "p_customer_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ga4_backfill_page_types"("p_agency_id" "uuid", "p_customer_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ga4_backfill_page_types"("p_agency_id" "uuid", "p_customer_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ga4_build_monthly_reports"("p_month" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ga4_build_monthly_reports"("p_month" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ga4_build_monthly_reports"("p_month" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ga4_classify_and_enrich"("p_agency_id" "uuid", "p_customer_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ga4_classify_and_enrich"("p_agency_id" "uuid", "p_customer_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ga4_classify_and_enrich"("p_agency_id" "uuid", "p_customer_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."ga4_events_report"("p_customer_ids" "text"[], "p_date_from" "date", "p_date_to" "date", "p_reporting_only" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."ga4_events_report"("p_customer_ids" "text"[], "p_date_from" "date", "p_date_to" "date", "p_reporting_only" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ga4_events_report"("p_customer_ids" "text"[], "p_date_from" "date", "p_date_to" "date", "p_reporting_only" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."ga4_metrics_sync_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."ga4_metrics_sync_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ga4_metrics_sync_all"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ga4_summary_report"("p_customer_ids" "text"[], "p_date_from" "date", "p_date_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."ga4_summary_report"("p_customer_ids" "text"[], "p_date_from" "date", "p_date_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ga4_summary_report"("p_customer_ids" "text"[], "p_date_from" "date", "p_date_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."gads_geo_sync_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."gads_geo_sync_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gads_geo_sync_all"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gads_metrics_sync_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."gads_metrics_sync_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gads_metrics_sync_all"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gads_status_sync_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."gads_status_sync_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gads_status_sync_all"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_missing_geo_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_missing_geo_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_missing_geo_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_platform_credential"("p_customer_id" "text", "p_platform" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_platform_credential"("p_customer_id" "text", "p_platform" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_platform_credential"("p_customer_id" "text", "p_platform" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_agency_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_agency_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_agency_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ghl_sync_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."ghl_sync_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ghl_sync_all"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_agency_admin"("p_agency_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_agency_admin"("p_agency_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_agency_admin"("p_agency_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reclassify_ga4_pages"("p_platform" "text", "p_date_from" "date", "p_date_to" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."reclassify_ga4_pages"("p_platform" "text", "p_date_from" "date", "p_date_to" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reclassify_ga4_pages"("p_platform" "text", "p_date_from" "date", "p_date_to" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."reddit_metrics_sync_all"() TO "anon";
GRANT ALL ON FUNCTION "public"."reddit_metrics_sync_all"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reddit_metrics_sync_all"() TO "service_role";

































GRANT ALL ON TABLE "public"."agencies" TO "anon";
GRANT ALL ON TABLE "public"."agencies" TO "authenticated";
GRANT ALL ON TABLE "public"."agencies" TO "service_role";



GRANT ALL ON TABLE "public"."agency_platform_credentials" TO "anon";
GRANT ALL ON TABLE "public"."agency_platform_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."agency_platform_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."agency_report_tabs" TO "anon";
GRANT ALL ON TABLE "public"."agency_report_tabs" TO "authenticated";
GRANT ALL ON TABLE "public"."agency_report_tabs" TO "service_role";



GRANT ALL ON TABLE "public"."client_platform_accounts" TO "anon";
GRANT ALL ON TABLE "public"."client_platform_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."client_platform_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."fb_ad_daily" TO "anon";
GRANT ALL ON TABLE "public"."fb_ad_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."fb_ad_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fb_ad_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fb_ad_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fb_ad_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fb_adset_daily" TO "anon";
GRANT ALL ON TABLE "public"."fb_adset_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."fb_adset_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fb_adset_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fb_adset_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fb_adset_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fb_campaign_daily" TO "anon";
GRANT ALL ON TABLE "public"."fb_campaign_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."fb_campaign_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fb_campaign_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fb_campaign_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fb_campaign_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fb_customers" TO "anon";
GRANT ALL ON TABLE "public"."fb_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."fb_customers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fb_customers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fb_customers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fb_customers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."fb_placement_daily" TO "anon";
GRANT ALL ON TABLE "public"."fb_placement_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."fb_placement_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fb_placement_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fb_placement_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fb_placement_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ga4_classified_pages" TO "anon";
GRANT ALL ON TABLE "public"."ga4_classified_pages" TO "authenticated";
GRANT ALL ON TABLE "public"."ga4_classified_pages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ga4_classified_pages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ga4_classified_pages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ga4_classified_pages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ga4_daily_summary" TO "anon";
GRANT ALL ON TABLE "public"."ga4_daily_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."ga4_daily_summary" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ga4_daily_summary_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ga4_daily_summary_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ga4_daily_summary_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ga4_events" TO "anon";
GRANT ALL ON TABLE "public"."ga4_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ga4_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ga4_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ga4_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ga4_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ga4_monthly_reports" TO "anon";
GRANT ALL ON TABLE "public"."ga4_monthly_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."ga4_monthly_reports" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ga4_monthly_reports_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ga4_monthly_reports_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ga4_monthly_reports_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ga4_page_rules" TO "anon";
GRANT ALL ON TABLE "public"."ga4_page_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."ga4_page_rules" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ga4_page_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ga4_page_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ga4_page_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ga4_raw" TO "anon";
GRANT ALL ON TABLE "public"."ga4_raw" TO "authenticated";
GRANT ALL ON TABLE "public"."ga4_raw" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ga4_raw_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ga4_raw_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ga4_raw_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ga4_reporting_events" TO "anon";
GRANT ALL ON TABLE "public"."ga4_reporting_events" TO "authenticated";
GRANT ALL ON TABLE "public"."ga4_reporting_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ga4_reporting_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ga4_reporting_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ga4_reporting_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gads_adgroup_daily" TO "anon";
GRANT ALL ON TABLE "public"."gads_adgroup_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_adgroup_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gads_adgroup_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gads_adgroup_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gads_adgroup_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gads_adgroup_status" TO "anon";
GRANT ALL ON TABLE "public"."gads_adgroup_status" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_adgroup_status" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gads_adgroup_status_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gads_adgroup_status_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gads_adgroup_status_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gads_campaign_daily" TO "anon";
GRANT ALL ON TABLE "public"."gads_campaign_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_campaign_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gads_campaign_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gads_campaign_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gads_campaign_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gads_campaign_status" TO "anon";
GRANT ALL ON TABLE "public"."gads_campaign_status" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_campaign_status" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gads_campaign_status_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gads_campaign_status_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gads_campaign_status_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gads_conversion_actions" TO "anon";
GRANT ALL ON TABLE "public"."gads_conversion_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_conversion_actions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gads_conversion_actions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gads_conversion_actions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gads_conversion_actions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gads_conversion_daily" TO "anon";
GRANT ALL ON TABLE "public"."gads_conversion_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_conversion_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gads_conversion_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gads_conversion_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gads_conversion_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gads_customers" TO "anon";
GRANT ALL ON TABLE "public"."gads_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_customers" TO "service_role";



GRANT ALL ON TABLE "public"."gads_geo_constants" TO "anon";
GRANT ALL ON TABLE "public"."gads_geo_constants" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_geo_constants" TO "service_role";



GRANT ALL ON TABLE "public"."gads_geo_location_daily" TO "anon";
GRANT ALL ON TABLE "public"."gads_geo_location_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_geo_location_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gads_geo_location_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gads_geo_location_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gads_geo_location_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gads_keyword_daily" TO "anon";
GRANT ALL ON TABLE "public"."gads_keyword_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_keyword_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gads_keyword_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gads_keyword_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gads_keyword_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gads_keyword_status" TO "anon";
GRANT ALL ON TABLE "public"."gads_keyword_status" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_keyword_status" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gads_keyword_status_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gads_keyword_status_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gads_keyword_status_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."gads_search_term_daily" TO "anon";
GRANT ALL ON TABLE "public"."gads_search_term_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."gads_search_term_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."gads_search_term_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."gads_search_term_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."gads_search_term_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ghl_activity_daily" TO "anon";
GRANT ALL ON TABLE "public"."ghl_activity_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_activity_daily" TO "service_role";



GRANT ALL ON TABLE "public"."ghl_calls" TO "anon";
GRANT ALL ON TABLE "public"."ghl_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_calls" TO "service_role";



GRANT ALL ON TABLE "public"."ghl_contacts" TO "anon";
GRANT ALL ON TABLE "public"."ghl_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."ghl_calls_view" TO "anon";
GRANT ALL ON TABLE "public"."ghl_calls_view" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_calls_view" TO "service_role";



GRANT ALL ON TABLE "public"."ghl_contacts_view" TO "anon";
GRANT ALL ON TABLE "public"."ghl_contacts_view" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_contacts_view" TO "service_role";



GRANT ALL ON TABLE "public"."ghl_form_submissions" TO "anon";
GRANT ALL ON TABLE "public"."ghl_form_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_form_submissions" TO "service_role";



GRANT ALL ON TABLE "public"."ghl_form_submissions_view" TO "anon";
GRANT ALL ON TABLE "public"."ghl_form_submissions_view" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_form_submissions_view" TO "service_role";



GRANT ALL ON TABLE "public"."ghl_hipaa_calls" TO "anon";
GRANT ALL ON TABLE "public"."ghl_hipaa_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_hipaa_calls" TO "service_role";



GRANT ALL ON TABLE "public"."ghl_hipaa_forms" TO "anon";
GRANT ALL ON TABLE "public"."ghl_hipaa_forms" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_hipaa_forms" TO "service_role";



GRANT ALL ON TABLE "public"."ghl_leads_daily" TO "anon";
GRANT ALL ON TABLE "public"."ghl_leads_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_leads_daily" TO "service_role";



GRANT ALL ON TABLE "public"."gmb_insights_daily" TO "anon";
GRANT ALL ON TABLE "public"."gmb_insights_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."gmb_insights_daily" TO "service_role";



GRANT ALL ON TABLE "public"."gmb_locations" TO "anon";
GRANT ALL ON TABLE "public"."gmb_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."gmb_locations" TO "service_role";



GRANT ALL ON TABLE "public"."gsc_daily_summary" TO "anon";
GRANT ALL ON TABLE "public"."gsc_daily_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."gsc_daily_summary" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_report_accounts" TO "anon";
GRANT ALL ON TABLE "public"."monthly_report_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_report_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_report_sections" TO "anon";
GRANT ALL ON TABLE "public"."monthly_report_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_report_sections" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_report_uploads" TO "anon";
GRANT ALL ON TABLE "public"."monthly_report_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_report_uploads" TO "service_role";



GRANT ALL ON TABLE "public"."monthly_reports" TO "anon";
GRANT ALL ON TABLE "public"."monthly_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."monthly_reports" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."reddit_campaign_daily" TO "anon";
GRANT ALL ON TABLE "public"."reddit_campaign_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."reddit_campaign_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reddit_campaign_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reddit_campaign_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reddit_campaign_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reddit_customers" TO "anon";
GRANT ALL ON TABLE "public"."reddit_customers" TO "authenticated";
GRANT ALL ON TABLE "public"."reddit_customers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reddit_customers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reddit_customers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reddit_customers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reddit_placement_daily" TO "anon";
GRANT ALL ON TABLE "public"."reddit_placement_daily" TO "authenticated";
GRANT ALL ON TABLE "public"."reddit_placement_daily" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reddit_placement_daily_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reddit_placement_daily_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reddit_placement_daily_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sync_log" TO "anon";
GRANT ALL ON TABLE "public"."sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."sync_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sync_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sync_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sync_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_clients" TO "anon";
GRANT ALL ON TABLE "public"."user_clients" TO "authenticated";
GRANT ALL ON TABLE "public"."user_clients" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































