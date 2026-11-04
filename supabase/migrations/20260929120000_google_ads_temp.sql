create table if not exists public.google_ads_temp (
  id                        bigint generated always as identity primary key,
  agency_id                 uuid references public.agencies(id) on delete set null,
  customer_id               text not null,
  customer_name             text,
  currency_code             text,
  time_zone                 text,
  campaign_id               text not null,
  campaign_name             text,
  campaign_status           text,
  channel_type              text,
  channel_sub_type          text,
  bidding_strategy_type     text,
  budget_id                 text,
  budget_amount             numeric(14,2),
  budget_period             text,
  start_date                date,
  end_date                  date,
  date                      date not null,
  impressions               bigint  default 0,
  clicks                    bigint  default 0,
  interactions              bigint  default 0,
  cost                      numeric(14,2) default 0,
  conversions               numeric(14,2) default 0,
  conversions_value         numeric(14,2) default 0,
  all_conversions           numeric(14,2) default 0,
  all_conversions_value     numeric(14,2) default 0,
  view_through_conversions  bigint  default 0,
  ctr                       numeric(8,4),
  avg_cpc                   numeric(14,2),
  avg_cpm                   numeric(14,2),
  cost_per_conversion       numeric(14,2),
  search_impression_share   numeric(8,4),
  synced_at                 timestamptz not null default now(),
  constraint google_ads_temp_customer_campaign_date_key unique (customer_id, campaign_id, date)
);

comment on table public.google_ads_temp is
  'Daily Google Ads campaign metrics (one row per customer_id + campaign_id + date). cost/cpc/cpm stored in account currency (micros / 1e6); ctr stored as percent.';

create index if not exists idx_google_ads_temp_cust_date on public.google_ads_temp (customer_id, date);
create index if not exists idx_google_ads_temp_date      on public.google_ads_temp (date);
create index if not exists idx_google_ads_temp_agency    on public.google_ads_temp (agency_id);

alter table public.google_ads_temp enable row level security;
revoke all on public.google_ads_temp from anon;

create policy google_ads_temp_secure_read on public.google_ads_temp
  for select to authenticated
  using (
    customer_id in (
      select cpa.platform_customer_id
      from public.client_platform_accounts cpa
      where cpa.is_active = true
        and (
          cpa.agency_id = (select up.agency_id from public.user_profiles up where up.id = (select auth.uid()))
          or cpa.id in (select uc.client_id from public.user_clients uc where uc.user_id = (select auth.uid()))
        )
    )
    or exists (
      select 1 from public.user_profiles up
      where up.id = (select auth.uid()) and up.is_super_admin = true
    )
  );
