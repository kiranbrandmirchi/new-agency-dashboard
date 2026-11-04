-- Google logins authorized through the verified "test" OAuth app (GADS_TEST_CLIENT_ID).
-- Holds refresh tokens, so it is service-role only: RLS on, no policies, no grants.
create table if not exists public.google_ads_temp_connections (
  id             uuid primary key default gen_random_uuid(),
  google_email   text not null unique,
  mcc_id         text,
  refresh_token  text not null,
  token_scopes   text,
  is_active      boolean not null default true,
  connected_by   uuid references public.user_profiles(id) on delete set null,
  connected_at   timestamptz not null default now(),
  last_error     text
);

alter table public.google_ads_temp_connections enable row level security;
revoke all on public.google_ads_temp_connections from anon, authenticated;

-- Ad accounts discovered under a connection, each mapped to an agency.
create table if not exists public.google_ads_temp_accounts (
  customer_id       text primary key,
  connection_id     uuid not null references public.google_ads_temp_connections(id) on delete cascade,
  agency_id         uuid references public.agencies(id) on delete set null,
  descriptive_name  text,
  currency_code     text,
  time_zone         text,
  is_manager        boolean not null default false,
  last_synced_at    timestamptz,
  last_sync_rows    integer,
  last_error        text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_google_ads_temp_accounts_agency     on public.google_ads_temp_accounts (agency_id);
create index if not exists idx_google_ads_temp_accounts_connection on public.google_ads_temp_accounts (connection_id);

alter table public.google_ads_temp_accounts enable row level security;
revoke all on public.google_ads_temp_accounts from anon, authenticated;
