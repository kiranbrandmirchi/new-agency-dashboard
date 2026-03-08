-- Add auto_sync_enabled to client_platform_accounts
-- Safe to re-run: uses IF NOT EXISTS for column

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'client_platform_accounts'
    AND column_name = 'auto_sync_enabled'
  ) THEN
    ALTER TABLE client_platform_accounts
    ADD COLUMN auto_sync_enabled BOOLEAN DEFAULT false;
  END IF;
END $$;

COMMENT ON COLUMN client_platform_accounts.auto_sync_enabled IS 'When true, this account is included in daily auto-sync. Use pg_cron or external scheduler to call gads-full-sync edge function for accounts where auto_sync_enabled = true. Example pg_cron: SELECT cron.schedule('gads-daily-sync', '0 6 * * *', $$ SELECT net.http_post(...) $$);';
