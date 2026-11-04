-- Shared secret so pg_cron can call gads-temp-sync without a user session.
select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'gads_temp_cron_secret',
  'Shared secret for gads-temp-sync cron calls'
)
where not exists (select 1 from vault.secrets where name = 'gads_temp_cron_secret');

create or replace function public.gads_temp_verify_cron_secret(p_secret text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets
    where name = 'gads_temp_cron_secret' and decrypted_secret = p_secret
  );
$$;

revoke all on function public.gads_temp_verify_cron_secret(text) from public, anon, authenticated;
grant execute on function public.gads_temp_verify_cron_secret(text) to service_role;

-- Daily token/access check, then batched sync of mapped accounts (last 3 days).
-- cron_sync processes up to 8 accounts per call and skips accounts already attempted today,
-- so the 10-minute runs between 06:00 and 07:50 UTC work through the whole queue.
select cron.schedule(
  'gads-temp-check-tokens',
  '50 5 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/gads-temp-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'gads_temp_cron_secret')
    ),
    body := jsonb_build_object('action', 'check_tokens'),
    timeout_milliseconds := 150000
  );
  $$
);

select cron.schedule(
  'gads-temp-cron-sync',
  '*/10 6-7 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/gads-temp-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'gads_temp_cron_secret')
    ),
    body := jsonb_build_object('action', 'cron_sync', 'days_back', 3, 'batch_size', 8),
    timeout_milliseconds := 150000
  );
  $$
);
