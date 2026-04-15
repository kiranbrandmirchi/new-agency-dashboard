-- Run this in Supabase SQL Editor to verify Jan 28-31 data exists
-- Data is for 2026 (not 2025)

-- 1. Date range coverage: which dates have data?
SELECT report_date, COUNT(*) AS rows, SUM(impressions) AS impressions, SUM(spend)::numeric(12,2) AS spend
FROM reddit_campaign_daily
WHERE report_date >= '2026-01-01' AND report_date <= '2026-01-31'
GROUP BY report_date
ORDER BY report_date;

-- 2. Specifically Jan 28-31
SELECT report_date, COUNT(*) AS rows
FROM reddit_campaign_daily
WHERE report_date IN ('2026-01-28', '2026-01-29', '2026-01-30', '2026-01-31')
GROUP BY report_date
ORDER BY report_date;

-- 3. Customer ID that has Jan data (use this in Reddit account dropdown)
SELECT DISTINCT customer_id
FROM reddit_campaign_daily
WHERE report_date >= '2026-01-28' AND report_date <= '2026-01-31';
