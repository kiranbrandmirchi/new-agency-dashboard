-- Token / access health tracking for the Google Ads test pipeline.
alter table public.google_ads_temp_connections
  add column if not exists token_status text,          -- 'ok' | 'expired_or_revoked' | 'error'
  add column if not exists last_checked_at timestamptz;

alter table public.google_ads_temp_accounts
  add column if not exists access_ok boolean,
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_sync_attempt_at timestamptz;
