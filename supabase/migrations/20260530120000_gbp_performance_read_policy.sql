-- Browser reads gbp_performance for monthly reports (same pattern as gsc_daily_summary / gmb_insights_daily).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gbp_performance' AND policyname = 'Allow authenticated read gbp_performance'
  ) THEN
    CREATE POLICY "Allow authenticated read gbp_performance"
      ON public.gbp_performance FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
