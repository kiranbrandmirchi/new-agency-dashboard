-- sync_log: stores sync history per account
-- Safe to re-run: uses IF NOT EXISTS

CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  sync_type TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'auto' | 'chunk'
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'success' | 'partial' | 'failed'
  rows_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_log_agency_id ON sync_log(agency_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_customer_id ON sync_log(customer_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_started_at ON sync_log(started_at DESC);

-- RLS: users can read sync_log for their agency
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read sync_log for their agency" ON sync_log;
CREATE POLICY "Users can read sync_log for their agency" ON sync_log
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert sync_log for their agency" ON sync_log;
CREATE POLICY "Users can insert sync_log for their agency" ON sync_log
  FOR INSERT WITH CHECK (
    agency_id IN (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
  );
