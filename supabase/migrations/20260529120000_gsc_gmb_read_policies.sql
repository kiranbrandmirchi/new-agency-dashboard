-- Allow authenticated users to read synced GSC / GMB daily tables (matches ga4_daily_summary pattern).
DO $$
BEGIN
  IF to_regclass('public.gsc_daily_summary') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gsc_daily_summary' AND policyname = 'Allow authenticated read gsc_daily_summary'
  ) THEN
    CREATE POLICY "Allow authenticated read gsc_daily_summary"
      ON public.gsc_daily_summary FOR SELECT TO authenticated USING (true);
  END IF;

  IF to_regclass('public.gmb_insights_daily') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gmb_insights_daily' AND policyname = 'Allow authenticated read gmb_insights_daily'
  ) THEN
    CREATE POLICY "Allow authenticated read gmb_insights_daily"
      ON public.gmb_insights_daily FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
