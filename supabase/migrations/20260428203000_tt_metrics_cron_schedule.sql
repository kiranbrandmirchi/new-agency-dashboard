-- Run TikTok metrics after fb-daily-metrics (15 5) to avoid the same slot.
-- Cron times are UTC on Supabase. Adjust if your project uses a different convention.

UPDATE cron.job
SET schedule = '20 5 * * *'
WHERE jobname = 'tt_metrics_sync_all';
