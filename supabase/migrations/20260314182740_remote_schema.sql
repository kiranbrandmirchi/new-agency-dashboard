create sequence "public"."fb_ad_daily_id_seq";

create sequence "public"."fb_adset_daily_id_seq";

create sequence "public"."fb_campaign_daily_id_seq";

create sequence "public"."fb_customers_id_seq";

create sequence "public"."fb_placement_daily_id_seq";

drop policy "reddit_community_daily_select" on "public"."reddit_community_daily";

revoke delete on table "public"."reddit_community_daily" from "anon";

revoke insert on table "public"."reddit_community_daily" from "anon";

revoke references on table "public"."reddit_community_daily" from "anon";

revoke select on table "public"."reddit_community_daily" from "anon";

revoke trigger on table "public"."reddit_community_daily" from "anon";

revoke truncate on table "public"."reddit_community_daily" from "anon";

revoke update on table "public"."reddit_community_daily" from "anon";

revoke delete on table "public"."reddit_community_daily" from "authenticated";

revoke insert on table "public"."reddit_community_daily" from "authenticated";

revoke references on table "public"."reddit_community_daily" from "authenticated";

revoke select on table "public"."reddit_community_daily" from "authenticated";

revoke trigger on table "public"."reddit_community_daily" from "authenticated";

revoke truncate on table "public"."reddit_community_daily" from "authenticated";

revoke update on table "public"."reddit_community_daily" from "authenticated";

revoke delete on table "public"."reddit_community_daily" from "service_role";

revoke insert on table "public"."reddit_community_daily" from "service_role";

revoke references on table "public"."reddit_community_daily" from "service_role";

revoke select on table "public"."reddit_community_daily" from "service_role";

revoke trigger on table "public"."reddit_community_daily" from "service_role";

revoke truncate on table "public"."reddit_community_daily" from "service_role";

revoke update on table "public"."reddit_community_daily" from "service_role";

alter table "public"."reddit_adgroup_daily" drop constraint "reddit_adgroup_daily_customer_id_campaign_id_ad_group_id_re_key";

alter table "public"."reddit_campaign_daily" drop constraint "reddit_campaign_daily_customer_id_campaign_id_report_date_key";

alter table "public"."reddit_community_daily" drop constraint "reddit_community_daily_customer_id_campaign_id_community_re_key";

alter table "public"."reddit_placement_daily" drop constraint "reddit_placement_daily_customer_id_campaign_id_placement_re_key";

alter table "public"."reddit_community_daily" drop constraint "reddit_community_daily_pkey";

drop index if exists "public"."idx_reddit_community_daily_cid_date";

drop index if exists "public"."idx_reddit_community_daily_date";

drop index if exists "public"."reddit_adgroup_daily_customer_id_campaign_id_ad_group_id_re_key";

drop index if exists "public"."reddit_campaign_daily_customer_id_campaign_id_report_date_key";

drop index if exists "public"."reddit_community_daily_customer_id_campaign_id_community_re_key";

drop index if exists "public"."reddit_community_daily_pkey";

drop index if exists "public"."reddit_placement_daily_customer_id_campaign_id_placement_re_key";

drop table "public"."reddit_community_daily";


  create table "public"."fb_ad_daily" (
    "id" bigint not null default nextval('public.fb_ad_daily_id_seq'::regclass),
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "adset_id" text not null,
    "adset_name" text,
    "ad_id" text not null,
    "ad_name" text,
    "report_date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "spend" numeric(15,6) default 0,
    "cpc" numeric(15,6) default 0,
    "cpm" numeric(15,6) default 0,
    "ctr" numeric(10,4) default 0,
    "reach" bigint default 0,
    "frequency" numeric(10,4) default 0,
    "link_clicks" bigint default 0,
    "purchase_count" bigint default 0,
    "purchase_value" numeric(15,6) default 0,
    "purchase_cost" numeric(15,6) default 0,
    "lead_count" bigint default 0,
    "lead_cost" numeric(15,6) default 0,
    "add_to_cart_count" bigint default 0,
    "add_to_cart_value" numeric(15,6) default 0,
    "view_content_count" bigint default 0,
    "complete_registration_count" bigint default 0,
    "initiate_checkout_count" bigint default 0,
    "initiate_checkout_value" numeric(15,6) default 0,
    "purchase_roas" numeric(10,4) default 0,
    "video_views" bigint default 0,
    "video_p25_watched" bigint default 0,
    "video_p50_watched" bigint default 0,
    "video_p75_watched" bigint default 0,
    "video_p100_watched" bigint default 0,
    "currency" text default 'USD'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."fb_ad_daily" enable row level security;


  create table "public"."fb_adset_daily" (
    "id" bigint not null default nextval('public.fb_adset_daily_id_seq'::regclass),
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "adset_id" text not null,
    "adset_name" text,
    "report_date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "spend" numeric(15,6) default 0,
    "cpc" numeric(15,6) default 0,
    "cpm" numeric(15,6) default 0,
    "ctr" numeric(10,4) default 0,
    "reach" bigint default 0,
    "frequency" numeric(10,4) default 0,
    "link_clicks" bigint default 0,
    "purchase_count" bigint default 0,
    "purchase_value" numeric(15,6) default 0,
    "purchase_cost" numeric(15,6) default 0,
    "lead_count" bigint default 0,
    "lead_cost" numeric(15,6) default 0,
    "add_to_cart_count" bigint default 0,
    "add_to_cart_value" numeric(15,6) default 0,
    "view_content_count" bigint default 0,
    "complete_registration_count" bigint default 0,
    "initiate_checkout_count" bigint default 0,
    "initiate_checkout_value" numeric(15,6) default 0,
    "purchase_roas" numeric(10,4) default 0,
    "video_views" bigint default 0,
    "video_p25_watched" bigint default 0,
    "video_p50_watched" bigint default 0,
    "video_p75_watched" bigint default 0,
    "video_p100_watched" bigint default 0,
    "currency" text default 'USD'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."fb_adset_daily" enable row level security;


  create table "public"."fb_campaign_daily" (
    "id" bigint not null default nextval('public.fb_campaign_daily_id_seq'::regclass),
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "report_date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "spend" numeric(15,6) default 0,
    "cpc" numeric(15,6) default 0,
    "cpm" numeric(15,6) default 0,
    "ctr" numeric(10,4) default 0,
    "reach" bigint default 0,
    "frequency" numeric(10,4) default 0,
    "link_clicks" bigint default 0,
    "purchase_count" bigint default 0,
    "purchase_value" numeric(15,6) default 0,
    "purchase_cost" numeric(15,6) default 0,
    "lead_count" bigint default 0,
    "lead_cost" numeric(15,6) default 0,
    "add_to_cart_count" bigint default 0,
    "add_to_cart_value" numeric(15,6) default 0,
    "view_content_count" bigint default 0,
    "complete_registration_count" bigint default 0,
    "initiate_checkout_count" bigint default 0,
    "initiate_checkout_value" numeric(15,6) default 0,
    "purchase_roas" numeric(10,4) default 0,
    "video_views" bigint default 0,
    "video_p25_watched" bigint default 0,
    "video_p50_watched" bigint default 0,
    "video_p75_watched" bigint default 0,
    "video_p100_watched" bigint default 0,
    "currency" text default 'USD'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."fb_campaign_daily" enable row level security;


  create table "public"."fb_customers" (
    "id" bigint not null default nextval('public.fb_customers_id_seq'::regclass),
    "customer_id" text not null,
    "account_name" text,
    "agency_id" uuid,
    "currency" text default 'USD'::text,
    "timezone" text default 'UTC'::text,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."fb_customers" enable row level security;


  create table "public"."fb_placement_daily" (
    "id" bigint not null default nextval('public.fb_placement_daily_id_seq'::regclass),
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "publisher_platform" text,
    "platform_position" text,
    "report_date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "spend" numeric(15,6) default 0,
    "cpc" numeric(15,6) default 0,
    "cpm" numeric(15,6) default 0,
    "ctr" numeric(10,4) default 0,
    "reach" bigint default 0,
    "frequency" numeric(10,4) default 0,
    "link_clicks" bigint default 0,
    "purchase_count" bigint default 0,
    "purchase_value" numeric(15,6) default 0,
    "purchase_cost" numeric(15,6) default 0,
    "lead_count" bigint default 0,
    "lead_cost" numeric(15,6) default 0,
    "add_to_cart_count" bigint default 0,
    "add_to_cart_value" numeric(15,6) default 0,
    "view_content_count" bigint default 0,
    "complete_registration_count" bigint default 0,
    "initiate_checkout_count" bigint default 0,
    "initiate_checkout_value" numeric(15,6) default 0,
    "purchase_roas" numeric(10,4) default 0,
    "video_views" bigint default 0,
    "video_p25_watched" bigint default 0,
    "video_p50_watched" bigint default 0,
    "video_p75_watched" bigint default 0,
    "video_p100_watched" bigint default 0,
    "currency" text default 'USD'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."fb_placement_daily" enable row level security;

alter table "public"."reddit_adgroup_daily" add column "add_to_cart_clicks" integer default 0;

alter table "public"."reddit_adgroup_daily" add column "add_to_cart_total_value" numeric(15,6) default 0;

alter table "public"."reddit_adgroup_daily" add column "add_to_cart_views" integer default 0;

alter table "public"."reddit_adgroup_daily" add column "conversion_roas" numeric(15,6) default 0;

alter table "public"."reddit_adgroup_daily" add column "country" text default 'ALL'::text;

alter table "public"."reddit_adgroup_daily" add column "cpc" numeric(15,6) default 0;

alter table "public"."reddit_adgroup_daily" add column "ctr" numeric(15,6) default 0;

alter table "public"."reddit_adgroup_daily" add column "ecpm" numeric(15,6) default 0;

alter table "public"."reddit_adgroup_daily" add column "frequency" numeric(15,6) default 0;

alter table "public"."reddit_adgroup_daily" add column "lead_clicks" integer default 0;

alter table "public"."reddit_adgroup_daily" add column "lead_views" integer default 0;

alter table "public"."reddit_adgroup_daily" add column "page_visit_clicks" integer default 0;

alter table "public"."reddit_adgroup_daily" add column "page_visit_views" integer default 0;

alter table "public"."reddit_adgroup_daily" add column "purchase_ecpa" numeric(15,6) default 0;

alter table "public"."reddit_adgroup_daily" add column "reach" bigint default 0;

alter table "public"."reddit_adgroup_daily" add column "sign_up_clicks" integer default 0;

alter table "public"."reddit_adgroup_daily" add column "sign_up_views" integer default 0;

alter table "public"."reddit_adgroup_daily" add column "video_started" bigint default 0;

alter table "public"."reddit_adgroup_daily" add column "video_viewable_impressions" bigint default 0;

alter table "public"."reddit_adgroup_daily" add column "video_watched_100_pct" bigint default 0;

alter table "public"."reddit_adgroup_daily" add column "video_watched_25_pct" bigint default 0;

alter table "public"."reddit_adgroup_daily" add column "video_watched_50_pct" bigint default 0;

alter table "public"."reddit_adgroup_daily" add column "video_watched_75_pct" bigint default 0;

alter table "public"."reddit_campaign_daily" add column "add_to_cart_clicks" integer default 0;

alter table "public"."reddit_campaign_daily" add column "add_to_cart_total_value" numeric(15,6) default 0;

alter table "public"."reddit_campaign_daily" add column "add_to_cart_views" integer default 0;

alter table "public"."reddit_campaign_daily" add column "conversion_roas" numeric(15,6) default 0;

alter table "public"."reddit_campaign_daily" add column "country" text default 'ALL'::text;

alter table "public"."reddit_campaign_daily" add column "cpc" numeric(15,6) default 0;

alter table "public"."reddit_campaign_daily" add column "ctr" numeric(15,6) default 0;

alter table "public"."reddit_campaign_daily" add column "ecpm" numeric(15,6) default 0;

alter table "public"."reddit_campaign_daily" add column "frequency" numeric(15,6) default 0;

alter table "public"."reddit_campaign_daily" add column "lead_clicks" integer default 0;

alter table "public"."reddit_campaign_daily" add column "lead_views" integer default 0;

alter table "public"."reddit_campaign_daily" add column "page_visit_clicks" integer default 0;

alter table "public"."reddit_campaign_daily" add column "page_visit_views" integer default 0;

alter table "public"."reddit_campaign_daily" add column "purchase_ecpa" numeric(15,6) default 0;

alter table "public"."reddit_campaign_daily" add column "reach" bigint default 0;

alter table "public"."reddit_campaign_daily" add column "sign_up_clicks" integer default 0;

alter table "public"."reddit_campaign_daily" add column "sign_up_views" integer default 0;

alter table "public"."reddit_campaign_daily" add column "video_started" bigint default 0;

alter table "public"."reddit_campaign_daily" add column "video_viewable_impressions" bigint default 0;

alter table "public"."reddit_campaign_daily" add column "video_watched_100_pct" bigint default 0;

alter table "public"."reddit_campaign_daily" add column "video_watched_25_pct" bigint default 0;

alter table "public"."reddit_campaign_daily" add column "video_watched_50_pct" bigint default 0;

alter table "public"."reddit_campaign_daily" add column "video_watched_75_pct" bigint default 0;

alter table "public"."reddit_placement_daily" add column "add_to_cart_clicks" integer default 0;

alter table "public"."reddit_placement_daily" add column "add_to_cart_total_value" numeric(15,6) default 0;

alter table "public"."reddit_placement_daily" add column "add_to_cart_views" integer default 0;

alter table "public"."reddit_placement_daily" add column "conversion_roas" numeric(15,6) default 0;

alter table "public"."reddit_placement_daily" add column "country" text default 'ALL'::text;

alter table "public"."reddit_placement_daily" add column "cpc" numeric(15,6) default 0;

alter table "public"."reddit_placement_daily" add column "ctr" numeric(15,6) default 0;

alter table "public"."reddit_placement_daily" add column "ecpm" numeric(15,6) default 0;

alter table "public"."reddit_placement_daily" add column "frequency" numeric(15,6) default 0;

alter table "public"."reddit_placement_daily" add column "lead_clicks" integer default 0;

alter table "public"."reddit_placement_daily" add column "lead_views" integer default 0;

alter table "public"."reddit_placement_daily" add column "page_visit_clicks" integer default 0;

alter table "public"."reddit_placement_daily" add column "page_visit_views" integer default 0;

alter table "public"."reddit_placement_daily" add column "purchase_ecpa" numeric(15,6) default 0;

alter table "public"."reddit_placement_daily" add column "reach" bigint default 0;

alter table "public"."reddit_placement_daily" add column "sign_up_clicks" integer default 0;

alter table "public"."reddit_placement_daily" add column "sign_up_views" integer default 0;

alter table "public"."reddit_placement_daily" add column "video_started" bigint default 0;

alter table "public"."reddit_placement_daily" add column "video_viewable_impressions" bigint default 0;

alter table "public"."reddit_placement_daily" add column "video_watched_100_pct" bigint default 0;

alter table "public"."reddit_placement_daily" add column "video_watched_25_pct" bigint default 0;

alter table "public"."reddit_placement_daily" add column "video_watched_50_pct" bigint default 0;

alter table "public"."reddit_placement_daily" add column "video_watched_75_pct" bigint default 0;

alter sequence "public"."fb_ad_daily_id_seq" owned by "public"."fb_ad_daily"."id";

alter sequence "public"."fb_adset_daily_id_seq" owned by "public"."fb_adset_daily"."id";

alter sequence "public"."fb_campaign_daily_id_seq" owned by "public"."fb_campaign_daily"."id";

alter sequence "public"."fb_customers_id_seq" owned by "public"."fb_customers"."id";

alter sequence "public"."fb_placement_daily_id_seq" owned by "public"."fb_placement_daily"."id";

drop sequence if exists "public"."reddit_community_daily_id_seq";

CREATE INDEX fb_ad_daily_cust_date ON public.fb_ad_daily USING btree (customer_id, report_date);

CREATE UNIQUE INDEX fb_ad_daily_pkey ON public.fb_ad_daily USING btree (id);

CREATE UNIQUE INDEX fb_ad_daily_uq ON public.fb_ad_daily USING btree (customer_id, campaign_id, adset_id, ad_id, report_date);

CREATE INDEX fb_adset_daily_cust_date ON public.fb_adset_daily USING btree (customer_id, report_date);

CREATE UNIQUE INDEX fb_adset_daily_pkey ON public.fb_adset_daily USING btree (id);

CREATE UNIQUE INDEX fb_adset_daily_uq ON public.fb_adset_daily USING btree (customer_id, campaign_id, adset_id, report_date);

CREATE INDEX fb_campaign_daily_cust_date ON public.fb_campaign_daily USING btree (customer_id, report_date);

CREATE UNIQUE INDEX fb_campaign_daily_pkey ON public.fb_campaign_daily USING btree (id);

CREATE UNIQUE INDEX fb_campaign_daily_uq ON public.fb_campaign_daily USING btree (customer_id, campaign_id, report_date);

CREATE UNIQUE INDEX fb_customers_customer_id_key ON public.fb_customers USING btree (customer_id);

CREATE UNIQUE INDEX fb_customers_pkey ON public.fb_customers USING btree (id);

CREATE INDEX fb_placement_daily_cust_date ON public.fb_placement_daily USING btree (customer_id, report_date);

CREATE UNIQUE INDEX fb_placement_daily_pkey ON public.fb_placement_daily USING btree (id);

CREATE UNIQUE INDEX fb_placement_daily_uq ON public.fb_placement_daily USING btree (customer_id, campaign_id, publisher_platform, platform_position, report_date);

CREATE INDEX idx_reddit_adgroup_daily_country ON public.reddit_adgroup_daily USING btree (country);

CREATE INDEX idx_reddit_campaign_daily_country ON public.reddit_campaign_daily USING btree (country);

CREATE INDEX idx_reddit_placement_daily_country ON public.reddit_placement_daily USING btree (country);

CREATE UNIQUE INDEX reddit_adgroup_daily_uq ON public.reddit_adgroup_daily USING btree (customer_id, campaign_id, ad_group_id, report_date);

CREATE UNIQUE INDEX reddit_campaign_daily_uq ON public.reddit_campaign_daily USING btree (customer_id, campaign_id, report_date, country);

CREATE UNIQUE INDEX reddit_placement_daily_uq ON public.reddit_placement_daily USING btree (customer_id, campaign_id, placement, report_date);

alter table "public"."fb_ad_daily" add constraint "fb_ad_daily_pkey" PRIMARY KEY using index "fb_ad_daily_pkey";

alter table "public"."fb_adset_daily" add constraint "fb_adset_daily_pkey" PRIMARY KEY using index "fb_adset_daily_pkey";

alter table "public"."fb_campaign_daily" add constraint "fb_campaign_daily_pkey" PRIMARY KEY using index "fb_campaign_daily_pkey";

alter table "public"."fb_customers" add constraint "fb_customers_pkey" PRIMARY KEY using index "fb_customers_pkey";

alter table "public"."fb_placement_daily" add constraint "fb_placement_daily_pkey" PRIMARY KEY using index "fb_placement_daily_pkey";

alter table "public"."fb_customers" add constraint "fb_customers_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) not valid;

alter table "public"."fb_customers" validate constraint "fb_customers_agency_id_fkey";

alter table "public"."fb_customers" add constraint "fb_customers_customer_id_key" UNIQUE using index "fb_customers_customer_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.cleanup_orphaned_fb_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

$function$
;

CREATE OR REPLACE FUNCTION public.fb_metrics_sync_all()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

$function$
;

CREATE OR REPLACE FUNCTION public.reddit_metrics_sync_all()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.can_access_customer(p_customer_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_super_admin = true
    )
    OR
    EXISTS (
      SELECT 1
      FROM client_platform_accounts cpa
      WHERE REPLACE(COALESCE(cpa.platform_customer_id, ''), '-', '') = REPLACE(COALESCE(p_customer_id, ''), '-', '')
        AND cpa.is_active = true
        AND (
          cpa.agency_id IN (
            SELECT up.agency_id FROM user_profiles up WHERE up.id = auth.uid()
          )
          OR
          cpa.id IN (
            SELECT uc.client_id FROM user_clients uc WHERE uc.user_id = auth.uid()
          )
        )
    );

$function$
;

grant delete on table "public"."fb_ad_daily" to "anon";

grant insert on table "public"."fb_ad_daily" to "anon";

grant references on table "public"."fb_ad_daily" to "anon";

grant select on table "public"."fb_ad_daily" to "anon";

grant trigger on table "public"."fb_ad_daily" to "anon";

grant truncate on table "public"."fb_ad_daily" to "anon";

grant update on table "public"."fb_ad_daily" to "anon";

grant delete on table "public"."fb_ad_daily" to "authenticated";

grant insert on table "public"."fb_ad_daily" to "authenticated";

grant references on table "public"."fb_ad_daily" to "authenticated";

grant select on table "public"."fb_ad_daily" to "authenticated";

grant trigger on table "public"."fb_ad_daily" to "authenticated";

grant truncate on table "public"."fb_ad_daily" to "authenticated";

grant update on table "public"."fb_ad_daily" to "authenticated";

grant delete on table "public"."fb_ad_daily" to "service_role";

grant insert on table "public"."fb_ad_daily" to "service_role";

grant references on table "public"."fb_ad_daily" to "service_role";

grant select on table "public"."fb_ad_daily" to "service_role";

grant trigger on table "public"."fb_ad_daily" to "service_role";

grant truncate on table "public"."fb_ad_daily" to "service_role";

grant update on table "public"."fb_ad_daily" to "service_role";

grant delete on table "public"."fb_adset_daily" to "anon";

grant insert on table "public"."fb_adset_daily" to "anon";

grant references on table "public"."fb_adset_daily" to "anon";

grant select on table "public"."fb_adset_daily" to "anon";

grant trigger on table "public"."fb_adset_daily" to "anon";

grant truncate on table "public"."fb_adset_daily" to "anon";

grant update on table "public"."fb_adset_daily" to "anon";

grant delete on table "public"."fb_adset_daily" to "authenticated";

grant insert on table "public"."fb_adset_daily" to "authenticated";

grant references on table "public"."fb_adset_daily" to "authenticated";

grant select on table "public"."fb_adset_daily" to "authenticated";

grant trigger on table "public"."fb_adset_daily" to "authenticated";

grant truncate on table "public"."fb_adset_daily" to "authenticated";

grant update on table "public"."fb_adset_daily" to "authenticated";

grant delete on table "public"."fb_adset_daily" to "service_role";

grant insert on table "public"."fb_adset_daily" to "service_role";

grant references on table "public"."fb_adset_daily" to "service_role";

grant select on table "public"."fb_adset_daily" to "service_role";

grant trigger on table "public"."fb_adset_daily" to "service_role";

grant truncate on table "public"."fb_adset_daily" to "service_role";

grant update on table "public"."fb_adset_daily" to "service_role";

grant delete on table "public"."fb_campaign_daily" to "anon";

grant insert on table "public"."fb_campaign_daily" to "anon";

grant references on table "public"."fb_campaign_daily" to "anon";

grant select on table "public"."fb_campaign_daily" to "anon";

grant trigger on table "public"."fb_campaign_daily" to "anon";

grant truncate on table "public"."fb_campaign_daily" to "anon";

grant update on table "public"."fb_campaign_daily" to "anon";

grant delete on table "public"."fb_campaign_daily" to "authenticated";

grant insert on table "public"."fb_campaign_daily" to "authenticated";

grant references on table "public"."fb_campaign_daily" to "authenticated";

grant select on table "public"."fb_campaign_daily" to "authenticated";

grant trigger on table "public"."fb_campaign_daily" to "authenticated";

grant truncate on table "public"."fb_campaign_daily" to "authenticated";

grant update on table "public"."fb_campaign_daily" to "authenticated";

grant delete on table "public"."fb_campaign_daily" to "service_role";

grant insert on table "public"."fb_campaign_daily" to "service_role";

grant references on table "public"."fb_campaign_daily" to "service_role";

grant select on table "public"."fb_campaign_daily" to "service_role";

grant trigger on table "public"."fb_campaign_daily" to "service_role";

grant truncate on table "public"."fb_campaign_daily" to "service_role";

grant update on table "public"."fb_campaign_daily" to "service_role";

grant delete on table "public"."fb_customers" to "anon";

grant insert on table "public"."fb_customers" to "anon";

grant references on table "public"."fb_customers" to "anon";

grant select on table "public"."fb_customers" to "anon";

grant trigger on table "public"."fb_customers" to "anon";

grant truncate on table "public"."fb_customers" to "anon";

grant update on table "public"."fb_customers" to "anon";

grant delete on table "public"."fb_customers" to "authenticated";

grant insert on table "public"."fb_customers" to "authenticated";

grant references on table "public"."fb_customers" to "authenticated";

grant select on table "public"."fb_customers" to "authenticated";

grant trigger on table "public"."fb_customers" to "authenticated";

grant truncate on table "public"."fb_customers" to "authenticated";

grant update on table "public"."fb_customers" to "authenticated";

grant delete on table "public"."fb_customers" to "service_role";

grant insert on table "public"."fb_customers" to "service_role";

grant references on table "public"."fb_customers" to "service_role";

grant select on table "public"."fb_customers" to "service_role";

grant trigger on table "public"."fb_customers" to "service_role";

grant truncate on table "public"."fb_customers" to "service_role";

grant update on table "public"."fb_customers" to "service_role";

grant delete on table "public"."fb_placement_daily" to "anon";

grant insert on table "public"."fb_placement_daily" to "anon";

grant references on table "public"."fb_placement_daily" to "anon";

grant select on table "public"."fb_placement_daily" to "anon";

grant trigger on table "public"."fb_placement_daily" to "anon";

grant truncate on table "public"."fb_placement_daily" to "anon";

grant update on table "public"."fb_placement_daily" to "anon";

grant delete on table "public"."fb_placement_daily" to "authenticated";

grant insert on table "public"."fb_placement_daily" to "authenticated";

grant references on table "public"."fb_placement_daily" to "authenticated";

grant select on table "public"."fb_placement_daily" to "authenticated";

grant trigger on table "public"."fb_placement_daily" to "authenticated";

grant truncate on table "public"."fb_placement_daily" to "authenticated";

grant update on table "public"."fb_placement_daily" to "authenticated";

grant delete on table "public"."fb_placement_daily" to "service_role";

grant insert on table "public"."fb_placement_daily" to "service_role";

grant references on table "public"."fb_placement_daily" to "service_role";

grant select on table "public"."fb_placement_daily" to "service_role";

grant trigger on table "public"."fb_placement_daily" to "service_role";

grant truncate on table "public"."fb_placement_daily" to "service_role";

grant update on table "public"."fb_placement_daily" to "service_role";


  create policy "fb_ad_daily_delete_policy"
  on "public"."fb_ad_daily"
  as permissive
  for delete
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_ad_daily_insert_policy"
  on "public"."fb_ad_daily"
  as permissive
  for insert
  to public
with check (public.can_access_customer(customer_id));



  create policy "fb_ad_daily_select_policy"
  on "public"."fb_ad_daily"
  as permissive
  for select
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_ad_daily_update_policy"
  on "public"."fb_ad_daily"
  as permissive
  for update
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_adset_daily_delete_policy"
  on "public"."fb_adset_daily"
  as permissive
  for delete
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_adset_daily_insert_policy"
  on "public"."fb_adset_daily"
  as permissive
  for insert
  to public
with check (public.can_access_customer(customer_id));



  create policy "fb_adset_daily_select_policy"
  on "public"."fb_adset_daily"
  as permissive
  for select
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_adset_daily_update_policy"
  on "public"."fb_adset_daily"
  as permissive
  for update
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_campaign_daily_delete_policy"
  on "public"."fb_campaign_daily"
  as permissive
  for delete
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_campaign_daily_insert_policy"
  on "public"."fb_campaign_daily"
  as permissive
  for insert
  to public
with check (public.can_access_customer(customer_id));



  create policy "fb_campaign_daily_select_policy"
  on "public"."fb_campaign_daily"
  as permissive
  for select
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_campaign_daily_update_policy"
  on "public"."fb_campaign_daily"
  as permissive
  for update
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_customers_delete_policy"
  on "public"."fb_customers"
  as permissive
  for delete
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_customers_insert_policy"
  on "public"."fb_customers"
  as permissive
  for insert
  to public
with check (public.can_access_customer(customer_id));



  create policy "fb_customers_select_policy"
  on "public"."fb_customers"
  as permissive
  for select
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_customers_update_policy"
  on "public"."fb_customers"
  as permissive
  for update
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_placement_daily_delete_policy"
  on "public"."fb_placement_daily"
  as permissive
  for delete
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_placement_daily_insert_policy"
  on "public"."fb_placement_daily"
  as permissive
  for insert
  to public
with check (public.can_access_customer(customer_id));



  create policy "fb_placement_daily_select_policy"
  on "public"."fb_placement_daily"
  as permissive
  for select
  to public
using (public.can_access_customer(customer_id));



  create policy "fb_placement_daily_update_policy"
  on "public"."fb_placement_daily"
  as permissive
  for update
  to public
using (public.can_access_customer(customer_id));



