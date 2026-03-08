create extension if not exists "pg_cron" with schema "pg_catalog";


  create table "public"."agencies" (
    "id" uuid not null default gen_random_uuid(),
    "agency_name" text not null,
    "agency_slug" text not null,
    "client_code" text,
    "logo_url" text,
    "favicon_url" text,
    "primary_color" text default '#3B82F6'::text,
    "secondary_color" text default '#1E40AF'::text,
    "accent_color" text default '#F59E0B'::text,
    "sidebar_bg" text default '#1F2937'::text,
    "sidebar_text" text default '#FFFFFF'::text,
    "font_family" text default 'Inter, sans-serif'::text,
    "custom_css" text,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."agencies" enable row level security;


  create table "public"."agency_platform_credentials" (
    "id" uuid not null default gen_random_uuid(),
    "agency_id" uuid not null,
    "platform" text not null,
    "oauth_refresh_token" text,
    "platform_mcc_id" text,
    "platform_account_id" text,
    "token_scopes" text,
    "is_active" boolean default true,
    "connected_by" uuid,
    "connected_at" timestamp with time zone default now(),
    "last_sync_at" timestamp with time zone,
    "last_sync_status" text,
    "last_error" text
      );


alter table "public"."agency_platform_credentials" enable row level security;


  create table "public"."agency_report_tabs" (
    "id" uuid not null default gen_random_uuid(),
    "agency_id" uuid not null,
    "tab_key" text not null,
    "tab_label" text not null,
    "tab_order" integer not null default 0,
    "is_visible" boolean default true,
    "platform" text,
    "required_permission" text,
    "config_json" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."agency_report_tabs" enable row level security;


  create table "public"."client_platform_accounts" (
    "id" uuid not null default gen_random_uuid(),
    "agency_id" uuid not null,
    "credential_id" uuid,
    "platform" text not null,
    "platform_customer_id" text not null,
    "account_name" text,
    "is_active" boolean default true,
    "last_sync_at" timestamp with time zone,
    "sync_status" text default 'pending'::text,
    "created_at" timestamp with time zone default now(),
    "auto_sync_enabled" boolean default false
      );


alter table "public"."client_platform_accounts" enable row level security;


  create table "public"."gads_adgroup_daily" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "ad_group_id" text not null,
    "ad_group_name" text,
    "date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "cost" numeric default 0,
    "conversions" numeric default 0,
    "conversions_value" numeric default 0,
    "all_conversions" numeric default 0,
    "all_conversions_value" numeric default 0,
    "interactions" bigint default 0,
    "ctr" numeric default 0,
    "avg_cpc" numeric default 0,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_adgroup_daily" enable row level security;


  create table "public"."gads_adgroup_status" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "ad_group_id" text not null,
    "ad_group_name" text,
    "ad_group_status" text,
    "ad_group_type" text,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_adgroup_status" enable row level security;


  create table "public"."gads_backfill_queue" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "fill_date" date not null,
    "func" text not null,
    "status" text default 'pending'::text,
    "created_at" timestamp with time zone default now(),
    "processed_at" timestamp with time zone
      );


alter table "public"."gads_backfill_queue" enable row level security;


  create table "public"."gads_campaign_daily" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "campaign_type" text,
    "date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "cost" numeric default 0,
    "conversions" numeric default 0,
    "conversions_value" numeric default 0,
    "all_conversions" numeric default 0,
    "all_conversions_value" numeric default 0,
    "view_through_conversions" bigint default 0,
    "interactions" bigint default 0,
    "ctr" numeric default 0,
    "avg_cpc" numeric default 0,
    "avg_cpm" numeric default 0,
    "cost_per_conversion" numeric default 0,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_campaign_daily" enable row level security;


  create table "public"."gads_campaign_status" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "campaign_type" text,
    "campaign_status" text,
    "serving_status" text,
    "budget_amount" numeric default 0,
    "bidding_strategy_type" text,
    "start_date" text,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_campaign_status" enable row level security;


  create table "public"."gads_conversion_actions" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "conversion_action_id" text not null,
    "conversion_action_name" text,
    "conversion_action_category" text,
    "conversion_action_type" text,
    "status" text,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_conversion_actions" enable row level security;


  create table "public"."gads_conversion_daily" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "conversion_action_id" text not null,
    "conversion_action_name" text,
    "conversion_action_category" text,
    "date" date not null,
    "conversions" numeric default 0,
    "conversions_value" numeric default 0,
    "all_conversions" numeric default 0,
    "all_conversions_value" numeric default 0,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_conversion_daily" enable row level security;


  create table "public"."gads_customers" (
    "customer_id" text not null,
    "descriptive_name" text,
    "currency_code" text default 'USD'::text,
    "time_zone" text,
    "is_manager" boolean default false,
    "status" text,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_customers" enable row level security;


  create table "public"."gads_geo_constants" (
    "geo_id" text not null,
    "geo_name" text,
    "canonical_name" text,
    "country_code" text,
    "target_type" text,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_geo_constants" enable row level security;


  create table "public"."gads_geo_location_daily" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "date" date not null,
    "country" text default ''::text,
    "region" text default ''::text,
    "city" text default ''::text,
    "metro" text default ''::text,
    "most_specific" text default ''::text,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "cost" numeric default 0,
    "conversions" numeric default 0,
    "conversions_value" numeric default 0,
    "all_conversions" numeric default 0,
    "ctr" numeric default 0,
    "avg_cpc" numeric default 0,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_geo_location_daily" enable row level security;


  create table "public"."gads_keyword_daily" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "ad_group_id" text not null,
    "ad_group_name" text,
    "keyword_id" text not null,
    "keyword_text" text,
    "keyword_match_type" text,
    "date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "cost" numeric default 0,
    "conversions" numeric default 0,
    "conversions_value" numeric default 0,
    "all_conversions" numeric default 0,
    "ctr" numeric default 0,
    "avg_cpc" numeric default 0,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_keyword_daily" enable row level security;


  create table "public"."gads_keyword_status" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "ad_group_id" text not null,
    "ad_group_name" text,
    "keyword_id" text not null,
    "keyword_text" text,
    "keyword_match_type" text,
    "keyword_status" text,
    "approval_status" text,
    "quality_score" integer,
    "expected_ctr" text,
    "landing_page_experience" text,
    "ad_relevance" text,
    "bid_amount" numeric default 0,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_keyword_status" enable row level security;


  create table "public"."gads_search_term_daily" (
    "id" bigint generated always as identity not null,
    "customer_id" text not null,
    "campaign_id" text not null,
    "campaign_name" text,
    "ad_group_id" text not null,
    "search_term" text not null,
    "date" date not null,
    "impressions" bigint default 0,
    "clicks" bigint default 0,
    "cost" numeric default 0,
    "conversions" numeric default 0,
    "conversions_value" numeric default 0,
    "all_conversions" numeric default 0,
    "ctr" numeric default 0,
    "avg_cpc" numeric default 0,
    "synced_at" timestamp with time zone default now()
      );


alter table "public"."gads_search_term_daily" enable row level security;


  create table "public"."permissions" (
    "id" uuid not null default gen_random_uuid(),
    "permission_key" text not null,
    "description" text,
    "created_at" timestamp with time zone default now(),
    "permission_label" text,
    "category" text default 'sidebar'::text
      );


alter table "public"."permissions" enable row level security;


  create table "public"."role_permissions" (
    "id" uuid not null default gen_random_uuid(),
    "role_id" uuid not null,
    "permission_id" uuid not null
      );


alter table "public"."role_permissions" enable row level security;


  create table "public"."roles" (
    "id" uuid not null default gen_random_uuid(),
    "role_name" text not null,
    "description" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."roles" enable row level security;


  create table "public"."sync_log" (
    "id" bigint generated always as identity not null,
    "agency_id" uuid,
    "platform" text not null,
    "customer_id" text not null,
    "sync_type" text not null,
    "date_from" date,
    "date_to" date,
    "status" text default 'pending'::text,
    "rows_synced" integer default 0,
    "error_message" text,
    "started_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone,
    "duration_ms" integer
      );


alter table "public"."sync_log" enable row level security;


  create table "public"."user_clients" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "client_id" uuid not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."user_clients" enable row level security;


  create table "public"."user_profiles" (
    "id" uuid not null,
    "email" text,
    "full_name" text,
    "avatar_url" text,
    "role_id" uuid not null,
    "agency_id" uuid,
    "is_super_admin" boolean default false,
    "last_login" timestamp with time zone,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."user_profiles" enable row level security;

CREATE UNIQUE INDEX agencies_agency_slug_key ON public.agencies USING btree (agency_slug);

CREATE UNIQUE INDEX agencies_client_code_key ON public.agencies USING btree (client_code);

CREATE UNIQUE INDEX agencies_pkey ON public.agencies USING btree (id);

CREATE UNIQUE INDEX agency_platform_credentials_agency_id_platform_key ON public.agency_platform_credentials USING btree (agency_id, platform);

CREATE UNIQUE INDEX agency_platform_credentials_pkey ON public.agency_platform_credentials USING btree (id);

CREATE UNIQUE INDEX agency_report_tabs_agency_id_tab_key_key ON public.agency_report_tabs USING btree (agency_id, tab_key);

CREATE UNIQUE INDEX agency_report_tabs_pkey ON public.agency_report_tabs USING btree (id);

CREATE UNIQUE INDEX client_platform_accounts_pkey ON public.client_platform_accounts USING btree (id);

CREATE UNIQUE INDEX client_platform_accounts_platform_platform_customer_id_key ON public.client_platform_accounts USING btree (platform, platform_customer_id);

CREATE UNIQUE INDEX gads_adgroup_daily_customer_id_ad_group_id_date_key ON public.gads_adgroup_daily USING btree (customer_id, ad_group_id, date);

CREATE UNIQUE INDEX gads_adgroup_daily_pkey ON public.gads_adgroup_daily USING btree (id);

CREATE UNIQUE INDEX gads_adgroup_status_customer_id_ad_group_id_key ON public.gads_adgroup_status USING btree (customer_id, ad_group_id);

CREATE UNIQUE INDEX gads_adgroup_status_pkey ON public.gads_adgroup_status USING btree (id);

CREATE UNIQUE INDEX gads_backfill_queue_customer_id_fill_date_func_key ON public.gads_backfill_queue USING btree (customer_id, fill_date, func);

CREATE UNIQUE INDEX gads_backfill_queue_pkey ON public.gads_backfill_queue USING btree (id);

CREATE UNIQUE INDEX gads_campaign_daily_customer_id_campaign_id_date_key ON public.gads_campaign_daily USING btree (customer_id, campaign_id, date);

CREATE UNIQUE INDEX gads_campaign_daily_pkey ON public.gads_campaign_daily USING btree (id);

CREATE UNIQUE INDEX gads_campaign_status_customer_id_campaign_id_key ON public.gads_campaign_status USING btree (customer_id, campaign_id);

CREATE UNIQUE INDEX gads_campaign_status_pkey ON public.gads_campaign_status USING btree (id);

CREATE UNIQUE INDEX gads_conversion_actions_customer_id_conversion_action_id_key ON public.gads_conversion_actions USING btree (customer_id, conversion_action_id);

CREATE UNIQUE INDEX gads_conversion_actions_pkey ON public.gads_conversion_actions USING btree (id);

CREATE UNIQUE INDEX gads_conversion_daily_customer_id_campaign_id_conversion_ac_key ON public.gads_conversion_daily USING btree (customer_id, campaign_id, conversion_action_id, date);

CREATE UNIQUE INDEX gads_conversion_daily_pkey ON public.gads_conversion_daily USING btree (id);

CREATE UNIQUE INDEX gads_customers_pkey ON public.gads_customers USING btree (customer_id);

CREATE UNIQUE INDEX gads_geo_constants_pkey ON public.gads_geo_constants USING btree (geo_id);

CREATE UNIQUE INDEX gads_geo_location_daily_customer_id_campaign_id_country_reg_key ON public.gads_geo_location_daily USING btree (customer_id, campaign_id, country, region, city, most_specific, date);

CREATE UNIQUE INDEX gads_geo_location_daily_pkey ON public.gads_geo_location_daily USING btree (id);

CREATE UNIQUE INDEX gads_keyword_daily_customer_id_ad_group_id_keyword_id_date_key ON public.gads_keyword_daily USING btree (customer_id, ad_group_id, keyword_id, date);

CREATE UNIQUE INDEX gads_keyword_daily_pkey ON public.gads_keyword_daily USING btree (id);

CREATE UNIQUE INDEX gads_keyword_status_customer_id_ad_group_id_keyword_id_key ON public.gads_keyword_status USING btree (customer_id, ad_group_id, keyword_id);

CREATE UNIQUE INDEX gads_keyword_status_pkey ON public.gads_keyword_status USING btree (id);

CREATE UNIQUE INDEX gads_search_term_daily_customer_id_campaign_id_ad_group_id__key ON public.gads_search_term_daily USING btree (customer_id, campaign_id, ad_group_id, search_term, date);

CREATE UNIQUE INDEX gads_search_term_daily_pkey ON public.gads_search_term_daily USING btree (id);

CREATE INDEX idx_ag_daily_cust ON public.gads_adgroup_daily USING btree (customer_id);

CREATE INDEX idx_ag_status_cust ON public.gads_adgroup_status USING btree (customer_id);

CREATE INDEX idx_camp_daily_cust ON public.gads_campaign_daily USING btree (customer_id);

CREATE INDEX idx_camp_daily_date ON public.gads_campaign_daily USING btree (date);

CREATE INDEX idx_camp_status_cust ON public.gads_campaign_status USING btree (customer_id);

CREATE INDEX idx_conv_daily_cust ON public.gads_conversion_daily USING btree (customer_id);

CREATE INDEX idx_geo_daily_cust ON public.gads_geo_location_daily USING btree (customer_id);

CREATE INDEX idx_geo_daily_date ON public.gads_geo_location_daily USING btree (date);

CREATE INDEX idx_kw_daily_cust ON public.gads_keyword_daily USING btree (customer_id);

CREATE INDEX idx_kw_status_cust ON public.gads_keyword_status USING btree (customer_id);

CREATE INDEX idx_st_daily_cust ON public.gads_search_term_daily USING btree (customer_id);

CREATE INDEX idx_sync_log_agency ON public.sync_log USING btree (agency_id);

CREATE INDEX idx_sync_log_agency_id ON public.sync_log USING btree (agency_id);

CREATE INDEX idx_sync_log_customer_id ON public.sync_log USING btree (customer_id);

CREATE INDEX idx_sync_log_started_at ON public.sync_log USING btree (started_at DESC);

CREATE INDEX idx_sync_log_status ON public.sync_log USING btree (status);

CREATE UNIQUE INDEX permissions_permission_key_key ON public.permissions USING btree (permission_key);

CREATE UNIQUE INDEX permissions_pkey ON public.permissions USING btree (id);

CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (id);

CREATE UNIQUE INDEX role_permissions_role_id_permission_id_key ON public.role_permissions USING btree (role_id, permission_id);

CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id);

CREATE UNIQUE INDEX roles_role_name_key ON public.roles USING btree (role_name);

CREATE UNIQUE INDEX sync_log_pkey ON public.sync_log USING btree (id);

CREATE UNIQUE INDEX user_clients_pkey ON public.user_clients USING btree (id);

CREATE UNIQUE INDEX user_clients_user_id_client_id_key ON public.user_clients USING btree (user_id, client_id);

CREATE UNIQUE INDEX user_profiles_pkey ON public.user_profiles USING btree (id);

alter table "public"."agencies" add constraint "agencies_pkey" PRIMARY KEY using index "agencies_pkey";

alter table "public"."agency_platform_credentials" add constraint "agency_platform_credentials_pkey" PRIMARY KEY using index "agency_platform_credentials_pkey";

alter table "public"."agency_report_tabs" add constraint "agency_report_tabs_pkey" PRIMARY KEY using index "agency_report_tabs_pkey";

alter table "public"."client_platform_accounts" add constraint "client_platform_accounts_pkey" PRIMARY KEY using index "client_platform_accounts_pkey";

alter table "public"."gads_adgroup_daily" add constraint "gads_adgroup_daily_pkey" PRIMARY KEY using index "gads_adgroup_daily_pkey";

alter table "public"."gads_adgroup_status" add constraint "gads_adgroup_status_pkey" PRIMARY KEY using index "gads_adgroup_status_pkey";

alter table "public"."gads_backfill_queue" add constraint "gads_backfill_queue_pkey" PRIMARY KEY using index "gads_backfill_queue_pkey";

alter table "public"."gads_campaign_daily" add constraint "gads_campaign_daily_pkey" PRIMARY KEY using index "gads_campaign_daily_pkey";

alter table "public"."gads_campaign_status" add constraint "gads_campaign_status_pkey" PRIMARY KEY using index "gads_campaign_status_pkey";

alter table "public"."gads_conversion_actions" add constraint "gads_conversion_actions_pkey" PRIMARY KEY using index "gads_conversion_actions_pkey";

alter table "public"."gads_conversion_daily" add constraint "gads_conversion_daily_pkey" PRIMARY KEY using index "gads_conversion_daily_pkey";

alter table "public"."gads_customers" add constraint "gads_customers_pkey" PRIMARY KEY using index "gads_customers_pkey";

alter table "public"."gads_geo_constants" add constraint "gads_geo_constants_pkey" PRIMARY KEY using index "gads_geo_constants_pkey";

alter table "public"."gads_geo_location_daily" add constraint "gads_geo_location_daily_pkey" PRIMARY KEY using index "gads_geo_location_daily_pkey";

alter table "public"."gads_keyword_daily" add constraint "gads_keyword_daily_pkey" PRIMARY KEY using index "gads_keyword_daily_pkey";

alter table "public"."gads_keyword_status" add constraint "gads_keyword_status_pkey" PRIMARY KEY using index "gads_keyword_status_pkey";

alter table "public"."gads_search_term_daily" add constraint "gads_search_term_daily_pkey" PRIMARY KEY using index "gads_search_term_daily_pkey";

alter table "public"."permissions" add constraint "permissions_pkey" PRIMARY KEY using index "permissions_pkey";

alter table "public"."role_permissions" add constraint "role_permissions_pkey" PRIMARY KEY using index "role_permissions_pkey";

alter table "public"."roles" add constraint "roles_pkey" PRIMARY KEY using index "roles_pkey";

alter table "public"."sync_log" add constraint "sync_log_pkey" PRIMARY KEY using index "sync_log_pkey";

alter table "public"."user_clients" add constraint "user_clients_pkey" PRIMARY KEY using index "user_clients_pkey";

alter table "public"."user_profiles" add constraint "user_profiles_pkey" PRIMARY KEY using index "user_profiles_pkey";

alter table "public"."agencies" add constraint "agencies_agency_slug_key" UNIQUE using index "agencies_agency_slug_key";

alter table "public"."agencies" add constraint "agencies_client_code_key" UNIQUE using index "agencies_client_code_key";

alter table "public"."agency_platform_credentials" add constraint "agency_platform_credentials_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE not valid;

alter table "public"."agency_platform_credentials" validate constraint "agency_platform_credentials_agency_id_fkey";

alter table "public"."agency_platform_credentials" add constraint "agency_platform_credentials_agency_id_platform_key" UNIQUE using index "agency_platform_credentials_agency_id_platform_key";

alter table "public"."agency_platform_credentials" add constraint "agency_platform_credentials_connected_by_fkey" FOREIGN KEY (connected_by) REFERENCES public.user_profiles(id) not valid;

alter table "public"."agency_platform_credentials" validate constraint "agency_platform_credentials_connected_by_fkey";

alter table "public"."agency_report_tabs" add constraint "agency_report_tabs_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE not valid;

alter table "public"."agency_report_tabs" validate constraint "agency_report_tabs_agency_id_fkey";

alter table "public"."agency_report_tabs" add constraint "agency_report_tabs_agency_id_tab_key_key" UNIQUE using index "agency_report_tabs_agency_id_tab_key_key";

alter table "public"."client_platform_accounts" add constraint "client_platform_accounts_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) ON DELETE CASCADE not valid;

alter table "public"."client_platform_accounts" validate constraint "client_platform_accounts_agency_id_fkey";

alter table "public"."client_platform_accounts" add constraint "client_platform_accounts_credential_id_fkey" FOREIGN KEY (credential_id) REFERENCES public.agency_platform_credentials(id) not valid;

alter table "public"."client_platform_accounts" validate constraint "client_platform_accounts_credential_id_fkey";

alter table "public"."client_platform_accounts" add constraint "client_platform_accounts_platform_platform_customer_id_key" UNIQUE using index "client_platform_accounts_platform_platform_customer_id_key";

alter table "public"."gads_adgroup_daily" add constraint "gads_adgroup_daily_customer_id_ad_group_id_date_key" UNIQUE using index "gads_adgroup_daily_customer_id_ad_group_id_date_key";

alter table "public"."gads_adgroup_status" add constraint "gads_adgroup_status_customer_id_ad_group_id_key" UNIQUE using index "gads_adgroup_status_customer_id_ad_group_id_key";

alter table "public"."gads_backfill_queue" add constraint "gads_backfill_queue_customer_id_fill_date_func_key" UNIQUE using index "gads_backfill_queue_customer_id_fill_date_func_key";

alter table "public"."gads_campaign_daily" add constraint "gads_campaign_daily_customer_id_campaign_id_date_key" UNIQUE using index "gads_campaign_daily_customer_id_campaign_id_date_key";

alter table "public"."gads_campaign_status" add constraint "gads_campaign_status_customer_id_campaign_id_key" UNIQUE using index "gads_campaign_status_customer_id_campaign_id_key";

alter table "public"."gads_conversion_actions" add constraint "gads_conversion_actions_customer_id_conversion_action_id_key" UNIQUE using index "gads_conversion_actions_customer_id_conversion_action_id_key";

alter table "public"."gads_conversion_daily" add constraint "gads_conversion_daily_customer_id_campaign_id_conversion_ac_key" UNIQUE using index "gads_conversion_daily_customer_id_campaign_id_conversion_ac_key";

alter table "public"."gads_geo_location_daily" add constraint "gads_geo_location_daily_customer_id_campaign_id_country_reg_key" UNIQUE using index "gads_geo_location_daily_customer_id_campaign_id_country_reg_key";

alter table "public"."gads_keyword_daily" add constraint "gads_keyword_daily_customer_id_ad_group_id_keyword_id_date_key" UNIQUE using index "gads_keyword_daily_customer_id_ad_group_id_keyword_id_date_key";

alter table "public"."gads_keyword_status" add constraint "gads_keyword_status_customer_id_ad_group_id_keyword_id_key" UNIQUE using index "gads_keyword_status_customer_id_ad_group_id_keyword_id_key";

alter table "public"."gads_search_term_daily" add constraint "gads_search_term_daily_customer_id_campaign_id_ad_group_id__key" UNIQUE using index "gads_search_term_daily_customer_id_campaign_id_ad_group_id__key";

alter table "public"."permissions" add constraint "permissions_permission_key_key" UNIQUE using index "permissions_permission_key_key";

alter table "public"."role_permissions" add constraint "role_permissions_permission_id_fkey" FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_permission_id_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE not valid;

alter table "public"."role_permissions" validate constraint "role_permissions_role_id_fkey";

alter table "public"."role_permissions" add constraint "role_permissions_role_id_permission_id_key" UNIQUE using index "role_permissions_role_id_permission_id_key";

alter table "public"."roles" add constraint "roles_role_name_key" UNIQUE using index "roles_role_name_key";

alter table "public"."sync_log" add constraint "sync_log_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) not valid;

alter table "public"."sync_log" validate constraint "sync_log_agency_id_fkey";

alter table "public"."user_clients" add constraint "user_clients_client_id_fkey" FOREIGN KEY (client_id) REFERENCES public.client_platform_accounts(id) ON DELETE CASCADE not valid;

alter table "public"."user_clients" validate constraint "user_clients_client_id_fkey";

alter table "public"."user_clients" add constraint "user_clients_user_id_client_id_key" UNIQUE using index "user_clients_user_id_client_id_key";

alter table "public"."user_clients" add constraint "user_clients_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_clients" validate constraint "user_clients_user_id_fkey";

alter table "public"."user_profiles" add constraint "user_profiles_agency_id_fkey" FOREIGN KEY (agency_id) REFERENCES public.agencies(id) not valid;

alter table "public"."user_profiles" validate constraint "user_profiles_agency_id_fkey";

alter table "public"."user_profiles" add constraint "user_profiles_role_id_fkey" FOREIGN KEY (role_id) REFERENCES public.roles(id) not valid;

alter table "public"."user_profiles" validate constraint "user_profiles_role_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.can_access_customer(p_customer_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    -- Super admins see everything
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_super_admin = true
    )
    OR
    EXISTS (
      SELECT 1
      FROM client_platform_accounts cpa
      WHERE cpa.platform_customer_id = p_customer_id
        AND cpa.is_active = true
        AND (
          -- Agency admins/managers: their agency owns this account
          cpa.agency_id IN (
            SELECT up.agency_id FROM user_profiles up WHERE up.id = auth.uid()
          )
          OR
          -- Users with explicit client access
          cpa.id IN (
            SELECT uc.client_id FROM user_clients uc WHERE uc.user_id = auth.uid()
          )
        )
    );

$function$
;

CREATE OR REPLACE FUNCTION public.gads_backfill_next()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r RECORD;
  proj_url text;
  anon_key text;
BEGIN
  SELECT decrypted_secret INTO proj_url
    FROM vault.decrypted_secrets WHERE name = 'project_url';
  SELECT decrypted_secret INTO anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key';

  FOR r IN
    SELECT id, customer_id, fill_date, func
    FROM public.gads_backfill_queue
    WHERE status = 'pending'
    ORDER BY fill_date, func
    LIMIT 20
  LOOP
    IF r.func = 'full-sync' THEN
      PERFORM net.http_post(
        url := proj_url || '/functions/v1/gads-full-sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key
        ),
        body := jsonb_build_object(
          'customer_id', r.customer_id,
          'mode', 'backfill',
          'date_from', r.fill_date::text,
          'date_to', r.fill_date::text
        )
      );
    ELSIF r.func = 'geo' THEN
      PERFORM net.http_post(
        url := proj_url || '/functions/v1/gads-status-geo',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key
        ),
        body := jsonb_build_object(
          'customer_id', r.customer_id,
          'date_from', r.fill_date::text,
          'date_to', r.fill_date::text,
          'sync_type', 'geo'
        )
      );
    END IF;

    UPDATE public.gads_backfill_queue
    SET status = 'done', processed_at = now()
    WHERE id = r.id;
  END LOOP;
END;

$function$
;

CREATE OR REPLACE FUNCTION public.gads_geo_sync_all()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

$function$
;

CREATE OR REPLACE FUNCTION public.gads_metrics_sync_all()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

$function$
;

CREATE OR REPLACE FUNCTION public.gads_status_sync_all()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

$function$
;

CREATE OR REPLACE FUNCTION public.get_missing_geo_ids()
 RETURNS SETOF text
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
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

$function$
;

CREATE OR REPLACE FUNCTION public.get_platform_credential(p_customer_id text, p_platform text)
 RETURNS TABLE(refresh_token text, mcc_id text, credential_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
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

$function$
;

CREATE OR REPLACE FUNCTION public.get_user_agency_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT agency_id FROM user_profiles WHERE id = auth.uid();

$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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

$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.id = auth.uid()
    AND (r.role_name IN ('admin', 'super_admin') OR up.is_super_admin = true)
  );

$function$
;

CREATE OR REPLACE FUNCTION public.is_agency_admin(p_agency_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles up
    JOIN roles r ON up.role_id = r.id
    WHERE up.id = auth.uid()
    AND up.agency_id = p_agency_id
    AND r.role_name = 'admin'
  ) OR is_super_admin();

$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_super_admin = true
  );

$function$
;

CREATE OR REPLACE FUNCTION public.trigger_daily_gads_sync()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  acc RECORD;
  resp RECORD;
BEGIN
  FOR acc IN
    SELECT cpa.platform_customer_id, cpa.agency_id
    FROM client_platform_accounts cpa
    WHERE cpa.platform = 'google_ads'
      AND cpa.is_active = true
      AND cpa.auto_sync_enabled = true
  LOOP
    -- Insert a sync_log entry
    INSERT INTO sync_log (agency_id, customer_id, sync_type, date_from, date_to, status)
    VALUES (
      acc.agency_id,
      acc.platform_customer_id,
      'auto',
      (CURRENT_DATE - INTERVAL '2 days')::date::text,
      CURRENT_DATE::text,
      'pending'
    );

    -- Call edge function via pg_net
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/gads-full-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object(
        'customer_id', acc.platform_customer_id,
        'agency_id', acc.agency_id::text,
        'mode', 'backfill',
        'date_from', (CURRENT_DATE - INTERVAL '2 days')::date::text,
        'date_to', CURRENT_DATE::text
      )
    );
  END LOOP;
END;

$function$
;

grant delete on table "public"."agencies" to "anon";

grant insert on table "public"."agencies" to "anon";

grant references on table "public"."agencies" to "anon";

grant select on table "public"."agencies" to "anon";

grant trigger on table "public"."agencies" to "anon";

grant truncate on table "public"."agencies" to "anon";

grant update on table "public"."agencies" to "anon";

grant delete on table "public"."agencies" to "authenticated";

grant insert on table "public"."agencies" to "authenticated";

grant references on table "public"."agencies" to "authenticated";

grant select on table "public"."agencies" to "authenticated";

grant trigger on table "public"."agencies" to "authenticated";

grant truncate on table "public"."agencies" to "authenticated";

grant update on table "public"."agencies" to "authenticated";

grant delete on table "public"."agencies" to "service_role";

grant insert on table "public"."agencies" to "service_role";

grant references on table "public"."agencies" to "service_role";

grant select on table "public"."agencies" to "service_role";

grant trigger on table "public"."agencies" to "service_role";

grant truncate on table "public"."agencies" to "service_role";

grant update on table "public"."agencies" to "service_role";

grant delete on table "public"."agency_platform_credentials" to "anon";

grant insert on table "public"."agency_platform_credentials" to "anon";

grant references on table "public"."agency_platform_credentials" to "anon";

grant select on table "public"."agency_platform_credentials" to "anon";

grant trigger on table "public"."agency_platform_credentials" to "anon";

grant truncate on table "public"."agency_platform_credentials" to "anon";

grant update on table "public"."agency_platform_credentials" to "anon";

grant delete on table "public"."agency_platform_credentials" to "authenticated";

grant insert on table "public"."agency_platform_credentials" to "authenticated";

grant references on table "public"."agency_platform_credentials" to "authenticated";

grant select on table "public"."agency_platform_credentials" to "authenticated";

grant trigger on table "public"."agency_platform_credentials" to "authenticated";

grant truncate on table "public"."agency_platform_credentials" to "authenticated";

grant update on table "public"."agency_platform_credentials" to "authenticated";

grant delete on table "public"."agency_platform_credentials" to "service_role";

grant insert on table "public"."agency_platform_credentials" to "service_role";

grant references on table "public"."agency_platform_credentials" to "service_role";

grant select on table "public"."agency_platform_credentials" to "service_role";

grant trigger on table "public"."agency_platform_credentials" to "service_role";

grant truncate on table "public"."agency_platform_credentials" to "service_role";

grant update on table "public"."agency_platform_credentials" to "service_role";

grant delete on table "public"."agency_report_tabs" to "anon";

grant insert on table "public"."agency_report_tabs" to "anon";

grant references on table "public"."agency_report_tabs" to "anon";

grant select on table "public"."agency_report_tabs" to "anon";

grant trigger on table "public"."agency_report_tabs" to "anon";

grant truncate on table "public"."agency_report_tabs" to "anon";

grant update on table "public"."agency_report_tabs" to "anon";

grant delete on table "public"."agency_report_tabs" to "authenticated";

grant insert on table "public"."agency_report_tabs" to "authenticated";

grant references on table "public"."agency_report_tabs" to "authenticated";

grant select on table "public"."agency_report_tabs" to "authenticated";

grant trigger on table "public"."agency_report_tabs" to "authenticated";

grant truncate on table "public"."agency_report_tabs" to "authenticated";

grant update on table "public"."agency_report_tabs" to "authenticated";

grant delete on table "public"."agency_report_tabs" to "service_role";

grant insert on table "public"."agency_report_tabs" to "service_role";

grant references on table "public"."agency_report_tabs" to "service_role";

grant select on table "public"."agency_report_tabs" to "service_role";

grant trigger on table "public"."agency_report_tabs" to "service_role";

grant truncate on table "public"."agency_report_tabs" to "service_role";

grant update on table "public"."agency_report_tabs" to "service_role";

grant delete on table "public"."client_platform_accounts" to "anon";

grant insert on table "public"."client_platform_accounts" to "anon";

grant references on table "public"."client_platform_accounts" to "anon";

grant select on table "public"."client_platform_accounts" to "anon";

grant trigger on table "public"."client_platform_accounts" to "anon";

grant truncate on table "public"."client_platform_accounts" to "anon";

grant update on table "public"."client_platform_accounts" to "anon";

grant delete on table "public"."client_platform_accounts" to "authenticated";

grant insert on table "public"."client_platform_accounts" to "authenticated";

grant references on table "public"."client_platform_accounts" to "authenticated";

grant select on table "public"."client_platform_accounts" to "authenticated";

grant trigger on table "public"."client_platform_accounts" to "authenticated";

grant truncate on table "public"."client_platform_accounts" to "authenticated";

grant update on table "public"."client_platform_accounts" to "authenticated";

grant delete on table "public"."client_platform_accounts" to "service_role";

grant insert on table "public"."client_platform_accounts" to "service_role";

grant references on table "public"."client_platform_accounts" to "service_role";

grant select on table "public"."client_platform_accounts" to "service_role";

grant trigger on table "public"."client_platform_accounts" to "service_role";

grant truncate on table "public"."client_platform_accounts" to "service_role";

grant update on table "public"."client_platform_accounts" to "service_role";

grant delete on table "public"."gads_adgroup_daily" to "anon";

grant insert on table "public"."gads_adgroup_daily" to "anon";

grant references on table "public"."gads_adgroup_daily" to "anon";

grant select on table "public"."gads_adgroup_daily" to "anon";

grant trigger on table "public"."gads_adgroup_daily" to "anon";

grant truncate on table "public"."gads_adgroup_daily" to "anon";

grant update on table "public"."gads_adgroup_daily" to "anon";

grant delete on table "public"."gads_adgroup_daily" to "authenticated";

grant insert on table "public"."gads_adgroup_daily" to "authenticated";

grant references on table "public"."gads_adgroup_daily" to "authenticated";

grant select on table "public"."gads_adgroup_daily" to "authenticated";

grant trigger on table "public"."gads_adgroup_daily" to "authenticated";

grant truncate on table "public"."gads_adgroup_daily" to "authenticated";

grant update on table "public"."gads_adgroup_daily" to "authenticated";

grant delete on table "public"."gads_adgroup_daily" to "service_role";

grant insert on table "public"."gads_adgroup_daily" to "service_role";

grant references on table "public"."gads_adgroup_daily" to "service_role";

grant select on table "public"."gads_adgroup_daily" to "service_role";

grant trigger on table "public"."gads_adgroup_daily" to "service_role";

grant truncate on table "public"."gads_adgroup_daily" to "service_role";

grant update on table "public"."gads_adgroup_daily" to "service_role";

grant delete on table "public"."gads_adgroup_status" to "anon";

grant insert on table "public"."gads_adgroup_status" to "anon";

grant references on table "public"."gads_adgroup_status" to "anon";

grant select on table "public"."gads_adgroup_status" to "anon";

grant trigger on table "public"."gads_adgroup_status" to "anon";

grant truncate on table "public"."gads_adgroup_status" to "anon";

grant update on table "public"."gads_adgroup_status" to "anon";

grant delete on table "public"."gads_adgroup_status" to "authenticated";

grant insert on table "public"."gads_adgroup_status" to "authenticated";

grant references on table "public"."gads_adgroup_status" to "authenticated";

grant select on table "public"."gads_adgroup_status" to "authenticated";

grant trigger on table "public"."gads_adgroup_status" to "authenticated";

grant truncate on table "public"."gads_adgroup_status" to "authenticated";

grant update on table "public"."gads_adgroup_status" to "authenticated";

grant delete on table "public"."gads_adgroup_status" to "service_role";

grant insert on table "public"."gads_adgroup_status" to "service_role";

grant references on table "public"."gads_adgroup_status" to "service_role";

grant select on table "public"."gads_adgroup_status" to "service_role";

grant trigger on table "public"."gads_adgroup_status" to "service_role";

grant truncate on table "public"."gads_adgroup_status" to "service_role";

grant update on table "public"."gads_adgroup_status" to "service_role";

grant delete on table "public"."gads_backfill_queue" to "anon";

grant insert on table "public"."gads_backfill_queue" to "anon";

grant references on table "public"."gads_backfill_queue" to "anon";

grant select on table "public"."gads_backfill_queue" to "anon";

grant trigger on table "public"."gads_backfill_queue" to "anon";

grant truncate on table "public"."gads_backfill_queue" to "anon";

grant update on table "public"."gads_backfill_queue" to "anon";

grant delete on table "public"."gads_backfill_queue" to "authenticated";

grant insert on table "public"."gads_backfill_queue" to "authenticated";

grant references on table "public"."gads_backfill_queue" to "authenticated";

grant select on table "public"."gads_backfill_queue" to "authenticated";

grant trigger on table "public"."gads_backfill_queue" to "authenticated";

grant truncate on table "public"."gads_backfill_queue" to "authenticated";

grant update on table "public"."gads_backfill_queue" to "authenticated";

grant delete on table "public"."gads_backfill_queue" to "service_role";

grant insert on table "public"."gads_backfill_queue" to "service_role";

grant references on table "public"."gads_backfill_queue" to "service_role";

grant select on table "public"."gads_backfill_queue" to "service_role";

grant trigger on table "public"."gads_backfill_queue" to "service_role";

grant truncate on table "public"."gads_backfill_queue" to "service_role";

grant update on table "public"."gads_backfill_queue" to "service_role";

grant delete on table "public"."gads_campaign_daily" to "anon";

grant insert on table "public"."gads_campaign_daily" to "anon";

grant references on table "public"."gads_campaign_daily" to "anon";

grant select on table "public"."gads_campaign_daily" to "anon";

grant trigger on table "public"."gads_campaign_daily" to "anon";

grant truncate on table "public"."gads_campaign_daily" to "anon";

grant update on table "public"."gads_campaign_daily" to "anon";

grant delete on table "public"."gads_campaign_daily" to "authenticated";

grant insert on table "public"."gads_campaign_daily" to "authenticated";

grant references on table "public"."gads_campaign_daily" to "authenticated";

grant select on table "public"."gads_campaign_daily" to "authenticated";

grant trigger on table "public"."gads_campaign_daily" to "authenticated";

grant truncate on table "public"."gads_campaign_daily" to "authenticated";

grant update on table "public"."gads_campaign_daily" to "authenticated";

grant delete on table "public"."gads_campaign_daily" to "service_role";

grant insert on table "public"."gads_campaign_daily" to "service_role";

grant references on table "public"."gads_campaign_daily" to "service_role";

grant select on table "public"."gads_campaign_daily" to "service_role";

grant trigger on table "public"."gads_campaign_daily" to "service_role";

grant truncate on table "public"."gads_campaign_daily" to "service_role";

grant update on table "public"."gads_campaign_daily" to "service_role";

grant delete on table "public"."gads_campaign_status" to "anon";

grant insert on table "public"."gads_campaign_status" to "anon";

grant references on table "public"."gads_campaign_status" to "anon";

grant select on table "public"."gads_campaign_status" to "anon";

grant trigger on table "public"."gads_campaign_status" to "anon";

grant truncate on table "public"."gads_campaign_status" to "anon";

grant update on table "public"."gads_campaign_status" to "anon";

grant delete on table "public"."gads_campaign_status" to "authenticated";

grant insert on table "public"."gads_campaign_status" to "authenticated";

grant references on table "public"."gads_campaign_status" to "authenticated";

grant select on table "public"."gads_campaign_status" to "authenticated";

grant trigger on table "public"."gads_campaign_status" to "authenticated";

grant truncate on table "public"."gads_campaign_status" to "authenticated";

grant update on table "public"."gads_campaign_status" to "authenticated";

grant delete on table "public"."gads_campaign_status" to "service_role";

grant insert on table "public"."gads_campaign_status" to "service_role";

grant references on table "public"."gads_campaign_status" to "service_role";

grant select on table "public"."gads_campaign_status" to "service_role";

grant trigger on table "public"."gads_campaign_status" to "service_role";

grant truncate on table "public"."gads_campaign_status" to "service_role";

grant update on table "public"."gads_campaign_status" to "service_role";

grant delete on table "public"."gads_conversion_actions" to "anon";

grant insert on table "public"."gads_conversion_actions" to "anon";

grant references on table "public"."gads_conversion_actions" to "anon";

grant select on table "public"."gads_conversion_actions" to "anon";

grant trigger on table "public"."gads_conversion_actions" to "anon";

grant truncate on table "public"."gads_conversion_actions" to "anon";

grant update on table "public"."gads_conversion_actions" to "anon";

grant delete on table "public"."gads_conversion_actions" to "authenticated";

grant insert on table "public"."gads_conversion_actions" to "authenticated";

grant references on table "public"."gads_conversion_actions" to "authenticated";

grant select on table "public"."gads_conversion_actions" to "authenticated";

grant trigger on table "public"."gads_conversion_actions" to "authenticated";

grant truncate on table "public"."gads_conversion_actions" to "authenticated";

grant update on table "public"."gads_conversion_actions" to "authenticated";

grant delete on table "public"."gads_conversion_actions" to "service_role";

grant insert on table "public"."gads_conversion_actions" to "service_role";

grant references on table "public"."gads_conversion_actions" to "service_role";

grant select on table "public"."gads_conversion_actions" to "service_role";

grant trigger on table "public"."gads_conversion_actions" to "service_role";

grant truncate on table "public"."gads_conversion_actions" to "service_role";

grant update on table "public"."gads_conversion_actions" to "service_role";

grant delete on table "public"."gads_conversion_daily" to "anon";

grant insert on table "public"."gads_conversion_daily" to "anon";

grant references on table "public"."gads_conversion_daily" to "anon";

grant select on table "public"."gads_conversion_daily" to "anon";

grant trigger on table "public"."gads_conversion_daily" to "anon";

grant truncate on table "public"."gads_conversion_daily" to "anon";

grant update on table "public"."gads_conversion_daily" to "anon";

grant delete on table "public"."gads_conversion_daily" to "authenticated";

grant insert on table "public"."gads_conversion_daily" to "authenticated";

grant references on table "public"."gads_conversion_daily" to "authenticated";

grant select on table "public"."gads_conversion_daily" to "authenticated";

grant trigger on table "public"."gads_conversion_daily" to "authenticated";

grant truncate on table "public"."gads_conversion_daily" to "authenticated";

grant update on table "public"."gads_conversion_daily" to "authenticated";

grant delete on table "public"."gads_conversion_daily" to "service_role";

grant insert on table "public"."gads_conversion_daily" to "service_role";

grant references on table "public"."gads_conversion_daily" to "service_role";

grant select on table "public"."gads_conversion_daily" to "service_role";

grant trigger on table "public"."gads_conversion_daily" to "service_role";

grant truncate on table "public"."gads_conversion_daily" to "service_role";

grant update on table "public"."gads_conversion_daily" to "service_role";

grant delete on table "public"."gads_customers" to "anon";

grant insert on table "public"."gads_customers" to "anon";

grant references on table "public"."gads_customers" to "anon";

grant select on table "public"."gads_customers" to "anon";

grant trigger on table "public"."gads_customers" to "anon";

grant truncate on table "public"."gads_customers" to "anon";

grant update on table "public"."gads_customers" to "anon";

grant delete on table "public"."gads_customers" to "authenticated";

grant insert on table "public"."gads_customers" to "authenticated";

grant references on table "public"."gads_customers" to "authenticated";

grant select on table "public"."gads_customers" to "authenticated";

grant trigger on table "public"."gads_customers" to "authenticated";

grant truncate on table "public"."gads_customers" to "authenticated";

grant update on table "public"."gads_customers" to "authenticated";

grant delete on table "public"."gads_customers" to "service_role";

grant insert on table "public"."gads_customers" to "service_role";

grant references on table "public"."gads_customers" to "service_role";

grant select on table "public"."gads_customers" to "service_role";

grant trigger on table "public"."gads_customers" to "service_role";

grant truncate on table "public"."gads_customers" to "service_role";

grant update on table "public"."gads_customers" to "service_role";

grant delete on table "public"."gads_geo_constants" to "anon";

grant insert on table "public"."gads_geo_constants" to "anon";

grant references on table "public"."gads_geo_constants" to "anon";

grant select on table "public"."gads_geo_constants" to "anon";

grant trigger on table "public"."gads_geo_constants" to "anon";

grant truncate on table "public"."gads_geo_constants" to "anon";

grant update on table "public"."gads_geo_constants" to "anon";

grant delete on table "public"."gads_geo_constants" to "authenticated";

grant insert on table "public"."gads_geo_constants" to "authenticated";

grant references on table "public"."gads_geo_constants" to "authenticated";

grant select on table "public"."gads_geo_constants" to "authenticated";

grant trigger on table "public"."gads_geo_constants" to "authenticated";

grant truncate on table "public"."gads_geo_constants" to "authenticated";

grant update on table "public"."gads_geo_constants" to "authenticated";

grant delete on table "public"."gads_geo_constants" to "service_role";

grant insert on table "public"."gads_geo_constants" to "service_role";

grant references on table "public"."gads_geo_constants" to "service_role";

grant select on table "public"."gads_geo_constants" to "service_role";

grant trigger on table "public"."gads_geo_constants" to "service_role";

grant truncate on table "public"."gads_geo_constants" to "service_role";

grant update on table "public"."gads_geo_constants" to "service_role";

grant delete on table "public"."gads_geo_location_daily" to "anon";

grant insert on table "public"."gads_geo_location_daily" to "anon";

grant references on table "public"."gads_geo_location_daily" to "anon";

grant select on table "public"."gads_geo_location_daily" to "anon";

grant trigger on table "public"."gads_geo_location_daily" to "anon";

grant truncate on table "public"."gads_geo_location_daily" to "anon";

grant update on table "public"."gads_geo_location_daily" to "anon";

grant delete on table "public"."gads_geo_location_daily" to "authenticated";

grant insert on table "public"."gads_geo_location_daily" to "authenticated";

grant references on table "public"."gads_geo_location_daily" to "authenticated";

grant select on table "public"."gads_geo_location_daily" to "authenticated";

grant trigger on table "public"."gads_geo_location_daily" to "authenticated";

grant truncate on table "public"."gads_geo_location_daily" to "authenticated";

grant update on table "public"."gads_geo_location_daily" to "authenticated";

grant delete on table "public"."gads_geo_location_daily" to "service_role";

grant insert on table "public"."gads_geo_location_daily" to "service_role";

grant references on table "public"."gads_geo_location_daily" to "service_role";

grant select on table "public"."gads_geo_location_daily" to "service_role";

grant trigger on table "public"."gads_geo_location_daily" to "service_role";

grant truncate on table "public"."gads_geo_location_daily" to "service_role";

grant update on table "public"."gads_geo_location_daily" to "service_role";

grant delete on table "public"."gads_keyword_daily" to "anon";

grant insert on table "public"."gads_keyword_daily" to "anon";

grant references on table "public"."gads_keyword_daily" to "anon";

grant select on table "public"."gads_keyword_daily" to "anon";

grant trigger on table "public"."gads_keyword_daily" to "anon";

grant truncate on table "public"."gads_keyword_daily" to "anon";

grant update on table "public"."gads_keyword_daily" to "anon";

grant delete on table "public"."gads_keyword_daily" to "authenticated";

grant insert on table "public"."gads_keyword_daily" to "authenticated";

grant references on table "public"."gads_keyword_daily" to "authenticated";

grant select on table "public"."gads_keyword_daily" to "authenticated";

grant trigger on table "public"."gads_keyword_daily" to "authenticated";

grant truncate on table "public"."gads_keyword_daily" to "authenticated";

grant update on table "public"."gads_keyword_daily" to "authenticated";

grant delete on table "public"."gads_keyword_daily" to "service_role";

grant insert on table "public"."gads_keyword_daily" to "service_role";

grant references on table "public"."gads_keyword_daily" to "service_role";

grant select on table "public"."gads_keyword_daily" to "service_role";

grant trigger on table "public"."gads_keyword_daily" to "service_role";

grant truncate on table "public"."gads_keyword_daily" to "service_role";

grant update on table "public"."gads_keyword_daily" to "service_role";

grant delete on table "public"."gads_keyword_status" to "anon";

grant insert on table "public"."gads_keyword_status" to "anon";

grant references on table "public"."gads_keyword_status" to "anon";

grant select on table "public"."gads_keyword_status" to "anon";

grant trigger on table "public"."gads_keyword_status" to "anon";

grant truncate on table "public"."gads_keyword_status" to "anon";

grant update on table "public"."gads_keyword_status" to "anon";

grant delete on table "public"."gads_keyword_status" to "authenticated";

grant insert on table "public"."gads_keyword_status" to "authenticated";

grant references on table "public"."gads_keyword_status" to "authenticated";

grant select on table "public"."gads_keyword_status" to "authenticated";

grant trigger on table "public"."gads_keyword_status" to "authenticated";

grant truncate on table "public"."gads_keyword_status" to "authenticated";

grant update on table "public"."gads_keyword_status" to "authenticated";

grant delete on table "public"."gads_keyword_status" to "service_role";

grant insert on table "public"."gads_keyword_status" to "service_role";

grant references on table "public"."gads_keyword_status" to "service_role";

grant select on table "public"."gads_keyword_status" to "service_role";

grant trigger on table "public"."gads_keyword_status" to "service_role";

grant truncate on table "public"."gads_keyword_status" to "service_role";

grant update on table "public"."gads_keyword_status" to "service_role";

grant delete on table "public"."gads_search_term_daily" to "anon";

grant insert on table "public"."gads_search_term_daily" to "anon";

grant references on table "public"."gads_search_term_daily" to "anon";

grant select on table "public"."gads_search_term_daily" to "anon";

grant trigger on table "public"."gads_search_term_daily" to "anon";

grant truncate on table "public"."gads_search_term_daily" to "anon";

grant update on table "public"."gads_search_term_daily" to "anon";

grant delete on table "public"."gads_search_term_daily" to "authenticated";

grant insert on table "public"."gads_search_term_daily" to "authenticated";

grant references on table "public"."gads_search_term_daily" to "authenticated";

grant select on table "public"."gads_search_term_daily" to "authenticated";

grant trigger on table "public"."gads_search_term_daily" to "authenticated";

grant truncate on table "public"."gads_search_term_daily" to "authenticated";

grant update on table "public"."gads_search_term_daily" to "authenticated";

grant delete on table "public"."gads_search_term_daily" to "service_role";

grant insert on table "public"."gads_search_term_daily" to "service_role";

grant references on table "public"."gads_search_term_daily" to "service_role";

grant select on table "public"."gads_search_term_daily" to "service_role";

grant trigger on table "public"."gads_search_term_daily" to "service_role";

grant truncate on table "public"."gads_search_term_daily" to "service_role";

grant update on table "public"."gads_search_term_daily" to "service_role";

grant delete on table "public"."permissions" to "anon";

grant insert on table "public"."permissions" to "anon";

grant references on table "public"."permissions" to "anon";

grant select on table "public"."permissions" to "anon";

grant trigger on table "public"."permissions" to "anon";

grant truncate on table "public"."permissions" to "anon";

grant update on table "public"."permissions" to "anon";

grant delete on table "public"."permissions" to "authenticated";

grant insert on table "public"."permissions" to "authenticated";

grant references on table "public"."permissions" to "authenticated";

grant select on table "public"."permissions" to "authenticated";

grant trigger on table "public"."permissions" to "authenticated";

grant truncate on table "public"."permissions" to "authenticated";

grant update on table "public"."permissions" to "authenticated";

grant delete on table "public"."permissions" to "service_role";

grant insert on table "public"."permissions" to "service_role";

grant references on table "public"."permissions" to "service_role";

grant select on table "public"."permissions" to "service_role";

grant trigger on table "public"."permissions" to "service_role";

grant truncate on table "public"."permissions" to "service_role";

grant update on table "public"."permissions" to "service_role";

grant delete on table "public"."role_permissions" to "anon";

grant insert on table "public"."role_permissions" to "anon";

grant references on table "public"."role_permissions" to "anon";

grant select on table "public"."role_permissions" to "anon";

grant trigger on table "public"."role_permissions" to "anon";

grant truncate on table "public"."role_permissions" to "anon";

grant update on table "public"."role_permissions" to "anon";

grant delete on table "public"."role_permissions" to "authenticated";

grant insert on table "public"."role_permissions" to "authenticated";

grant references on table "public"."role_permissions" to "authenticated";

grant select on table "public"."role_permissions" to "authenticated";

grant trigger on table "public"."role_permissions" to "authenticated";

grant truncate on table "public"."role_permissions" to "authenticated";

grant update on table "public"."role_permissions" to "authenticated";

grant delete on table "public"."role_permissions" to "service_role";

grant insert on table "public"."role_permissions" to "service_role";

grant references on table "public"."role_permissions" to "service_role";

grant select on table "public"."role_permissions" to "service_role";

grant trigger on table "public"."role_permissions" to "service_role";

grant truncate on table "public"."role_permissions" to "service_role";

grant update on table "public"."role_permissions" to "service_role";

grant delete on table "public"."roles" to "anon";

grant insert on table "public"."roles" to "anon";

grant references on table "public"."roles" to "anon";

grant select on table "public"."roles" to "anon";

grant trigger on table "public"."roles" to "anon";

grant truncate on table "public"."roles" to "anon";

grant update on table "public"."roles" to "anon";

grant delete on table "public"."roles" to "authenticated";

grant insert on table "public"."roles" to "authenticated";

grant references on table "public"."roles" to "authenticated";

grant select on table "public"."roles" to "authenticated";

grant trigger on table "public"."roles" to "authenticated";

grant truncate on table "public"."roles" to "authenticated";

grant update on table "public"."roles" to "authenticated";

grant delete on table "public"."roles" to "service_role";

grant insert on table "public"."roles" to "service_role";

grant references on table "public"."roles" to "service_role";

grant select on table "public"."roles" to "service_role";

grant trigger on table "public"."roles" to "service_role";

grant truncate on table "public"."roles" to "service_role";

grant update on table "public"."roles" to "service_role";

grant delete on table "public"."sync_log" to "anon";

grant insert on table "public"."sync_log" to "anon";

grant references on table "public"."sync_log" to "anon";

grant select on table "public"."sync_log" to "anon";

grant trigger on table "public"."sync_log" to "anon";

grant truncate on table "public"."sync_log" to "anon";

grant update on table "public"."sync_log" to "anon";

grant delete on table "public"."sync_log" to "authenticated";

grant insert on table "public"."sync_log" to "authenticated";

grant references on table "public"."sync_log" to "authenticated";

grant select on table "public"."sync_log" to "authenticated";

grant trigger on table "public"."sync_log" to "authenticated";

grant truncate on table "public"."sync_log" to "authenticated";

grant update on table "public"."sync_log" to "authenticated";

grant delete on table "public"."sync_log" to "service_role";

grant insert on table "public"."sync_log" to "service_role";

grant references on table "public"."sync_log" to "service_role";

grant select on table "public"."sync_log" to "service_role";

grant trigger on table "public"."sync_log" to "service_role";

grant truncate on table "public"."sync_log" to "service_role";

grant update on table "public"."sync_log" to "service_role";

grant delete on table "public"."user_clients" to "anon";

grant insert on table "public"."user_clients" to "anon";

grant references on table "public"."user_clients" to "anon";

grant select on table "public"."user_clients" to "anon";

grant trigger on table "public"."user_clients" to "anon";

grant truncate on table "public"."user_clients" to "anon";

grant update on table "public"."user_clients" to "anon";

grant delete on table "public"."user_clients" to "authenticated";

grant insert on table "public"."user_clients" to "authenticated";

grant references on table "public"."user_clients" to "authenticated";

grant select on table "public"."user_clients" to "authenticated";

grant trigger on table "public"."user_clients" to "authenticated";

grant truncate on table "public"."user_clients" to "authenticated";

grant update on table "public"."user_clients" to "authenticated";

grant delete on table "public"."user_clients" to "service_role";

grant insert on table "public"."user_clients" to "service_role";

grant references on table "public"."user_clients" to "service_role";

grant select on table "public"."user_clients" to "service_role";

grant trigger on table "public"."user_clients" to "service_role";

grant truncate on table "public"."user_clients" to "service_role";

grant update on table "public"."user_clients" to "service_role";

grant delete on table "public"."user_profiles" to "anon";

grant insert on table "public"."user_profiles" to "anon";

grant references on table "public"."user_profiles" to "anon";

grant select on table "public"."user_profiles" to "anon";

grant trigger on table "public"."user_profiles" to "anon";

grant truncate on table "public"."user_profiles" to "anon";

grant update on table "public"."user_profiles" to "anon";

grant delete on table "public"."user_profiles" to "authenticated";

grant insert on table "public"."user_profiles" to "authenticated";

grant references on table "public"."user_profiles" to "authenticated";

grant select on table "public"."user_profiles" to "authenticated";

grant trigger on table "public"."user_profiles" to "authenticated";

grant truncate on table "public"."user_profiles" to "authenticated";

grant update on table "public"."user_profiles" to "authenticated";

grant delete on table "public"."user_profiles" to "service_role";

grant insert on table "public"."user_profiles" to "service_role";

grant references on table "public"."user_profiles" to "service_role";

grant select on table "public"."user_profiles" to "service_role";

grant trigger on table "public"."user_profiles" to "service_role";

grant truncate on table "public"."user_profiles" to "service_role";

grant update on table "public"."user_profiles" to "service_role";


  create policy "Agency admin updates own agency"
  on "public"."agencies"
  as permissive
  for update
  to authenticated
using (public.is_agency_admin(id));



  create policy "Super admin manages agencies"
  on "public"."agencies"
  as permissive
  for all
  to authenticated
using (public.is_super_admin());



  create policy "Users read own agency"
  on "public"."agencies"
  as permissive
  for select
  to authenticated
using (((id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))) OR public.is_super_admin()));



  create policy "Agency admin manages credentials"
  on "public"."agency_platform_credentials"
  as permissive
  for all
  to authenticated
using (public.is_agency_admin(agency_id));



  create policy "Super admin reads all credentials"
  on "public"."agency_platform_credentials"
  as permissive
  for select
  to authenticated
using (public.is_super_admin());



  create policy "Agency admin manages tabs"
  on "public"."agency_report_tabs"
  as permissive
  for all
  to authenticated
using (public.is_agency_admin(agency_id));



  create policy "Agency members read tabs"
  on "public"."agency_report_tabs"
  as permissive
  for select
  to authenticated
using (((agency_id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))) OR public.is_super_admin()));



  create policy "Agency admin manages accounts"
  on "public"."client_platform_accounts"
  as permissive
  for all
  to authenticated
using (public.is_agency_admin(agency_id));



  create policy "Agency members read accounts"
  on "public"."client_platform_accounts"
  as permissive
  for select
  to authenticated
using (((agency_id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))) OR public.is_super_admin()));



  create policy "secure_read"
  on "public"."gads_adgroup_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_adgroup_status"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "Admin manages backfill"
  on "public"."gads_backfill_queue"
  as permissive
  for all
  to authenticated
using (public.is_admin());



  create policy "secure_read"
  on "public"."gads_campaign_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_campaign_status"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_conversion_actions"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_conversion_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_customers"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "Anyone reads geo_constants"
  on "public"."gads_geo_constants"
  as permissive
  for select
  to public
using (true);



  create policy "secure_read"
  on "public"."gads_geo_location_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_keyword_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_keyword_status"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "secure_read"
  on "public"."gads_search_term_daily"
  as permissive
  for select
  to authenticated
using (public.can_access_customer(customer_id));



  create policy "Anyone reads permissions"
  on "public"."permissions"
  as permissive
  for select
  to public
using (true);



  create policy "Super admin manages permissions"
  on "public"."permissions"
  as permissive
  for all
  to authenticated
using (public.is_super_admin());



  create policy "Anyone reads role_permissions"
  on "public"."role_permissions"
  as permissive
  for select
  to public
using (true);



  create policy "Super admin manages role_permissions"
  on "public"."role_permissions"
  as permissive
  for all
  to authenticated
using (public.is_super_admin());



  create policy "Anyone reads roles"
  on "public"."roles"
  as permissive
  for select
  to public
using (true);



  create policy "Super admin manages roles"
  on "public"."roles"
  as permissive
  for all
  to authenticated
using (public.is_super_admin());



  create policy "Agency members read sync log"
  on "public"."sync_log"
  as permissive
  for select
  to authenticated
using (((agency_id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))) OR public.is_super_admin()));



  create policy "Users can insert sync_log for their agency"
  on "public"."sync_log"
  as permissive
  for insert
  to public
with check ((agency_id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))));



  create policy "Users can read sync_log for their agency"
  on "public"."sync_log"
  as permissive
  for select
  to public
using ((agency_id IN ( SELECT user_profiles.agency_id
   FROM public.user_profiles
  WHERE (user_profiles.id = auth.uid()))));



  create policy "Admin manages user_clients"
  on "public"."user_clients"
  as permissive
  for all
  to authenticated
using (public.is_admin());



  create policy "Users read own mappings"
  on "public"."user_clients"
  as permissive
  for select
  to authenticated
using ((user_id = auth.uid()));



  create policy "Admin manages profiles"
  on "public"."user_profiles"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "Agency admin reads agency profiles"
  on "public"."user_profiles"
  as permissive
  for select
  to authenticated
using (((agency_id = public.get_user_agency_id()) AND public.is_admin()));



  create policy "Super admin reads all profiles"
  on "public"."user_profiles"
  as permissive
  for select
  to authenticated
using (public.is_super_admin());



  create policy "Users read own profile"
  on "public"."user_profiles"
  as permissive
  for select
  to authenticated
using ((id = auth.uid()));


CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


