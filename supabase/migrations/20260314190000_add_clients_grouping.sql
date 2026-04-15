-- Add clients table to group multiple platform accounts under one client
-- e.g. "Wow Presents Plus" can have 3 platform accounts (Google Ads, Reddit, etc.) shown as one

CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Allow agency admins to manage their clients
CREATE POLICY "Agency manages clients"
  ON public.clients FOR ALL
  TO authenticated
  USING (
    agency_id IN (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_super_admin = true)
  )
  WITH CHECK (
    agency_id IN (SELECT agency_id FROM user_profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_super_admin = true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;

-- Add client_id to client_platform_accounts
ALTER TABLE public.client_platform_accounts
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_platform_accounts_client_id
  ON public.client_platform_accounts(client_id);

-- user_clients stays as-is (links user to client_platform_accounts.id)
-- When assigning by client, we'll assign all platform accounts under that client

COMMENT ON TABLE public.clients IS 'Groups multiple platform accounts (e.g. Wow Presents Plus) for unified access assignment';
