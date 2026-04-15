create sequence "public"."reddit_adgroup_daily_id_seq";

create sequence "public"."reddit_campaign_daily_id_seq";

create sequence "public"."reddit_community_daily_id_seq";

create sequence "public"."reddit_customers_id_seq";

create sequence "public"."reddit_placement_daily_id_seq";


  create table "public"."reddit_adgroup_daily" (
    "id" bigint not null default nextval('public.reddit_adgroup_daily_id_seq'::regclass),
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "ad_group_id" text not null,
    "ad_group_name" text,
    "report_date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "spend" numeric(15,6) default 0,
    "purchase_views" integer default 0,
    "purchase_clicks" integer default 0,
    "purchase_total_value" numeric(15,6) default 0,
    "currency" text default 'USD'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."reddit_adgroup_daily" enable row level security;


  create table "public"."reddit_campaign_daily" (
    "id" bigint not null default nextval('public.reddit_campaign_daily_id_seq'::regclass),
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "report_date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "spend" numeric(15,6) default 0,
    "purchase_views" integer default 0,
    "purchase_clicks" integer default 0,
    "purchase_total_value" numeric(15,6) default 0,
    "currency" text default 'USD'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."reddit_campaign_daily" enable row level security;


  create table "public"."reddit_community_daily" (
    "id" bigint not null default nextval('public.reddit_community_daily_id_seq'::regclass),
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "community" text not null,
    "report_date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "spend" numeric(15,6) default 0,
    "purchase_views" integer default 0,
    "purchase_clicks" integer default 0,
    "purchase_total_value" numeric(15,6) default 0,
    "currency" text default 'USD'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."reddit_community_daily" enable row level security;


  create table "public"."reddit_customers" (
    "id" bigint not null default nextval('public.reddit_customers_id_seq'::regclass),
    "customer_id" text not null,
    "account_name" text,
    "agency_id" uuid,
    "currency" text default 'USD'::text,
    "timezone" text default 'UTC'::text,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."reddit_customers" enable row level security;


  create table "public"."reddit_placement_daily" (
    "id" bigint not null default nextval('public.reddit_placement_daily_id_seq'::regclass),
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "placement" text not null,
    "report_date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "spend" numeric(15,6) default 0,
    "purchase_views" integer default 0,
    "purchase_clicks" integer default 0,
    "purchase_total_value" numeric(15,6) default 0,
    "currency" text default 'USD'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."reddit_placement_daily" enable row level security;

alter table "public"."client_platform_accounts" add column "last_sync_status" text;

alter table "public"."client_platform_accounts" add column "last_synced_at" timestamp with time zone;

alter sequence "public"."reddit_adgroup_daily_id_seq" owned by "public"."reddit_adgroup_daily"."id";

alter sequence "public"."reddit_campaign_daily_id_seq" owned by "public"."reddit_campaign_daily"."id";

alter sequence "public"."reddit_community_daily_id_seq" owned by "public"."reddit_community_daily"."id";

alter sequence "public"."reddit_customers_id_seq" owned by "public"."reddit_customers"."id";

alter sequence "public"."reddit_placement_daily_id_seq" owned by "public"."reddit_placement_daily"."id";

CREATE INDEX idx_reddit_adgroup_daily_cid ON public.reddit_adgroup_daily USING btree (customer_id);

CREATE INDEX idx_reddit_adgroup_daily_cid_date ON public.reddit_adgroup_daily USING btree (customer_id, report_date);

CREATE INDEX idx_reddit_adgroup_daily_date ON public.reddit_adgroup_daily USING btree (report_date);

CREATE INDEX idx_reddit_campaign_daily_cid ON public.reddit_campaign_daily USING btree (customer_id);

CREATE INDEX idx_reddit_campaign_daily_cid_date ON public.reddit_campaign_daily USING btree (customer_id, report_date);

CREATE INDEX idx_reddit_campaign_daily_date ON public.reddit_campaign_daily USING btree (report_date);

CREATE INDEX idx_reddit_community_daily_cid_date ON public.reddit_community_daily USING btree (customer_id, report_date);

CREATE INDEX idx_reddit_community_daily_date ON public.reddit_community_daily USING btree (report_date);

CREATE INDEX idx_reddit_placement_daily_cid_date ON public.reddit_placement_daily USING btree (customer_id, report_date);

CREATE INDEX idx_reddit_placement_daily_date ON public.reddit_placement_daily USING btree (report_date);

CREATE UNIQUE INDEX reddit_adgroup_daily_customer_id_campaign_id_ad_group_id_re_key ON public.reddit_adgroup_daily USING btree (customer_id, campaign_id, ad_group_id, report_date);

CREATE UNIQUE INDEX reddit_adgroup_daily_pkey ON public.reddit_adgroup_daily USING btree (id);

CREATE UNIQUE INDEX reddit_campaign_daily_customer_id_campaign_id_report_date_key ON public.reddit_campaign_daily USING btree (customer_id, campaign_id, report_date);

CREATE UNIQUE INDEX reddit_campaign_daily_pkey ON public.reddit_campaign_daily USING btree (id);

CREATE UNIQUE INDEX reddit_community_daily_customer_id_campaign_id_community_re_key ON public.reddit_community_daily USING btree (customer_id, campaign_id, community, report_date);

CREATE UNIQUE INDEX reddit_community_daily_pkey ON public.reddit_community_daily USING btree (id);

CREATE UNIQUE INDEX reddit_customers_customer_id_key ON public.reddit_customers USING btree (customer_id);

CREATE UNIQUE INDEX reddit_customers_pkey ON public.reddit_customers USING btree (id);

CREATE UNIQUE INDEX reddit_placement_daily_customer_id_campaign_id_placement_re_key ON public.reddit_placement_daily USING btree (customer_id, campaign_id, placement, report_date);

CREATE UNIQUE INDEX reddit_placement_daily_pkey ON public.reddit_placement_daily USING btree (id);

alter table "public"."reddit_adgroup_daily" add constraint "reddit_adgroup_daily_pkey" PRIMARY KEY using index "reddit_adgroup_daily_pkey";

alter table "public"."reddit_campaign_daily" add constraint "reddit_campaign_daily_pkey" PRIMARY KEY using index "reddit_campaign_daily_pkey";

alter table "public"."reddit_community_daily" add constraint "reddit_community_daily_pkey" PRIMARY KEY using index "reddit_community_daily_pkey";

alter table "public"."reddit_customers" add constraint "reddit_customers_pkey" PRIMARY KEY using index "reddit_customers_pkey";

alter table "public"."reddit_placement_daily" add constraint "reddit_placement_daily_pkey" PRIMARY KEY using index "reddit_placement_daily_pkey";

alter table "public"."reddit_adgroup_daily" add constraint "reddit_adgroup_daily_customer_id_campaign_id_ad_group_id_re_key" UNIQUE using index "reddit_adgroup_daily_customer_id_campaign_id_ad_group_id_re_key";

alter table "public"."reddit_campaign_daily" add constraint "reddit_campaign_daily_customer_id_campaign_id_report_date_key" UNIQUE using index "reddit_campaign_daily_customer_id_campaign_id_report_date_key";

alter table "public"."reddit_community_daily" add constraint "reddit_community_daily_customer_id_campaign_id_community_re_key" UNIQUE using index "reddit_community_daily_customer_id_campaign_id_community_re_key";

alter table "public"."reddit_customers" add constraint "reddit_customers_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) not valid;

alter table "public"."reddit_customers" validate constraint "reddit_customers_agency_id_fkey";

alter table "public"."reddit_customers" add constraint "reddit_customers_customer_id_key" UNIQUE using index "reddit_customers_customer_id_key";

alter table "public"."reddit_placement_daily" add constraint "reddit_placement_daily_customer_id_campaign_id_placement_re_key" UNIQUE using index "reddit_placement_daily_customer_id_campaign_id_placement_re_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.cleanup_orphaned_gads_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_orphaned_reddit_data()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM reddit_campaign_daily WHERE customer_id NOT IN (
    SELECT platform_customer_id FROM client_platform_accounts WHERE platform='reddit' AND is_active=true);
  DELETE FROM reddit_adgroup_daily WHERE customer_id NOT IN (
    SELECT platform_customer_id FROM client_platform_accounts WHERE platform='reddit' AND is_active=true);
  DELETE FROM reddit_community_daily WHERE customer_id NOT IN (
    SELECT platform_customer_id FROM client_platform_accounts WHERE platform='reddit' AND is_active=true);
  DELETE FROM reddit_placement_daily WHERE customer_id NOT IN (
    SELECT platform_customer_id FROM client_platform_accounts WHERE platform='reddit' AND is_active=true);
  DELETE FROM reddit_customers WHERE customer_id NOT IN (
    SELECT platform_customer_id FROM client_platform_accounts WHERE platform='reddit' AND is_active=true);
END;

$function$
;

CREATE OR REPLACE FUNCTION public.can_access_customer(p_customer_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM client_platform_accounts cpa
    JOIN user_profiles up ON up.agency_id = cpa.agency_id
    WHERE up.user_id = auth.uid()
      AND cpa.is_active = true
      AND REPLACE(cpa.platform_customer_id, '-', '') = REPLACE(p_customer_id, '-', '')
  );
END;

$function$
;

grant delete on table "public"."reddit_adgroup_daily" to "anon";

grant insert on table "public"."reddit_adgroup_daily" to "anon";

grant references on table "public"."reddit_adgroup_daily" to "anon";

grant select on table "public"."reddit_adgroup_daily" to "anon";

grant trigger on table "public"."reddit_adgroup_daily" to "anon";

grant truncate on table "public"."reddit_adgroup_daily" to "anon";

grant update on table "public"."reddit_adgroup_daily" to "anon";

grant delete on table "public"."reddit_adgroup_daily" to "authenticated";

grant insert on table "public"."reddit_adgroup_daily" to "authenticated";

grant references on table "public"."reddit_adgroup_daily" to "authenticated";

grant select on table "public"."reddit_adgroup_daily" to "authenticated";

grant trigger on table "public"."reddit_adgroup_daily" to "authenticated";

grant truncate on table "public"."reddit_adgroup_daily" to "authenticated";

grant update on table "public"."reddit_adgroup_daily" to "authenticated";

grant delete on table "public"."reddit_adgroup_daily" to "service_role";

grant insert on table "public"."reddit_adgroup_daily" to "service_role";

grant references on table "public"."reddit_adgroup_daily" to "service_role";

grant select on table "public"."reddit_adgroup_daily" to "service_role";

grant trigger on table "public"."reddit_adgroup_daily" to "service_role";

grant truncate on table "public"."reddit_adgroup_daily" to "service_role";

grant update on table "public"."reddit_adgroup_daily" to "service_role";

grant delete on table "public"."reddit_campaign_daily" to "anon";

grant insert on table "public"."reddit_campaign_daily" to "anon";

grant references on table "public"."reddit_campaign_daily" to "anon";

grant select on table "public"."reddit_campaign_daily" to "anon";

grant trigger on table "public"."reddit_campaign_daily" to "anon";

grant truncate on table "public"."reddit_campaign_daily" to "anon";

grant update on table "public"."reddit_campaign_daily" to "anon";

grant delete on table "public"."reddit_campaign_daily" to "authenticated";

grant insert on table "public"."reddit_campaign_daily" to "authenticated";

grant references on table "public"."reddit_campaign_daily" to "authenticated";

grant select on table "public"."reddit_campaign_daily" to "authenticated";

grant trigger on table "public"."reddit_campaign_daily" to "authenticated";

grant truncate on table "public"."reddit_campaign_daily" to "authenticated";

grant update on table "public"."reddit_campaign_daily" to "authenticated";

grant delete on table "public"."reddit_campaign_daily" to "service_role";

grant insert on table "public"."reddit_campaign_daily" to "service_role";

grant references on table "public"."reddit_campaign_daily" to "service_role";

grant select on table "public"."reddit_campaign_daily" to "service_role";

grant trigger on table "public"."reddit_campaign_daily" to "service_role";

grant truncate on table "public"."reddit_campaign_daily" to "service_role";

grant update on table "public"."reddit_campaign_daily" to "service_role";

grant delete on table "public"."reddit_community_daily" to "anon";

grant insert on table "public"."reddit_community_daily" to "anon";

grant references on table "public"."reddit_community_daily" to "anon";

grant select on table "public"."reddit_community_daily" to "anon";

grant trigger on table "public"."reddit_community_daily" to "anon";

grant truncate on table "public"."reddit_community_daily" to "anon";

grant update on table "public"."reddit_community_daily" to "anon";

grant delete on table "public"."reddit_community_daily" to "authenticated";

grant insert on table "public"."reddit_community_daily" to "authenticated";

grant references on table "public"."reddit_community_daily" to "authenticated";

grant select on table "public"."reddit_community_daily" to "authenticated";

grant trigger on table "public"."reddit_community_daily" to "authenticated";

grant truncate on table "public"."reddit_community_daily" to "authenticated";

grant update on table "public"."reddit_community_daily" to "authenticated";

grant delete on table "public"."reddit_community_daily" to "service_role";

grant insert on table "public"."reddit_community_daily" to "service_role";

grant references on table "public"."reddit_community_daily" to "service_role";

grant select on table "public"."reddit_community_daily" to "service_role";

grant trigger on table "public"."reddit_community_daily" to "service_role";

grant truncate on table "public"."reddit_community_daily" to "service_role";

grant update on table "public"."reddit_community_daily" to "service_role";

grant delete on table "public"."reddit_customers" to "anon";

grant insert on table "public"."reddit_customers" to "anon";

grant references on table "public"."reddit_customers" to "anon";

grant select on table "public"."reddit_customers" to "anon";

grant trigger on table "public"."reddit_customers" to "anon";

grant truncate on table "public"."reddit_customers" to "anon";

grant update on table "public"."reddit_customers" to "anon";

grant delete on table "public"."reddit_customers" to "authenticated";

grant insert on table "public"."reddit_customers" to "authenticated";

grant references on table "public"."reddit_customers" to "authenticated";

grant select on table "public"."reddit_customers" to "authenticated";

grant trigger on table "public"."reddit_customers" to "authenticated";

grant truncate on table "public"."reddit_customers" to "authenticated";

grant update on table "public"."reddit_customers" to "authenticated";

grant delete on table "public"."reddit_customers" to "service_role";

grant insert on table "public"."reddit_customers" to "service_role";

grant references on table "public"."reddit_customers" to "service_role";

grant select on table "public"."reddit_customers" to "service_role";

grant trigger on table "public"."reddit_customers" to "service_role";

grant truncate on table "public"."reddit_customers" to "service_role";

grant update on table "public"."reddit_customers" to "service_role";

grant delete on table "public"."reddit_placement_daily" to "anon";

grant insert on table "public"."reddit_placement_daily" to "anon";

grant references on table "public"."reddit_placement_daily" to "anon";

grant select on table "public"."reddit_placement_daily" to "anon";

grant trigger on table "public"."reddit_placement_daily" to "anon";

grant truncate on table "public"."reddit_placement_daily" to "anon";

grant update on table "public"."reddit_placement_daily" to "anon";

grant delete on table "public"."reddit_placement_daily" to "authenticated";

grant insert on table "public"."reddit_placement_daily" to "authenticated";

grant references on table "public"."reddit_placement_daily" to "authenticated";

grant select on table "public"."reddit_placement_daily" to "authenticated";

grant trigger on table "public"."reddit_placement_daily" to "authenticated";

grant truncate on table "public"."reddit_placement_daily" to "authenticated";

grant update on table "public"."reddit_placement_daily" to "authenticated";

grant delete on table "public"."reddit_placement_daily" to "service_role";

grant insert on table "public"."reddit_placement_daily" to "service_role";

grant references on table "public"."reddit_placement_daily" to "service_role";

grant select on table "public"."reddit_placement_daily" to "service_role";

grant trigger on table "public"."reddit_placement_daily" to "service_role";

grant truncate on table "public"."reddit_placement_daily" to "service_role";

grant update on table "public"."reddit_placement_daily" to "service_role";


  create policy "reddit_adgroup_daily_select"
  on "public"."reddit_adgroup_daily"
  as permissive
  for select
  to public
using (public.can_access_customer(customer_id));



  create policy "reddit_campaign_daily_select"
  on "public"."reddit_campaign_daily"
  as permissive
  for select
  to public
using (public.can_access_customer(customer_id));



  create policy "reddit_community_daily_select"
  on "public"."reddit_community_daily"
  as permissive
  for select
  to public
using (public.can_access_customer(customer_id));



  create policy "reddit_customers_insert"
  on "public"."reddit_customers"
  as permissive
  for insert
  to public
with check (public.can_access_customer(customer_id));



  create policy "reddit_customers_select"
  on "public"."reddit_customers"
  as permissive
  for select
  to public
using (public.can_access_customer(customer_id));



  create policy "reddit_placement_daily_select"
  on "public"."reddit_placement_daily"
  as permissive
  for select
  to public
using (public.can_access_customer(customer_id));



  create policy "Authenticated delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using ((bucket_id = 'agency-logos'::text));



  create policy "Authenticated update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using ((bucket_id = 'agency-logos'::text));



  create policy "Authenticated upload"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'agency-logos'::text));



  create policy "Public read access"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'agency-logos'::text));



