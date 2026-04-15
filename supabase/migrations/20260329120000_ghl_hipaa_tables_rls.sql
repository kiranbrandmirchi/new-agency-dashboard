-- GHL HIPAA CSV storage + flag on platform accounts (idempotent where possible)

ALTER TABLE public.client_platform_accounts
  ADD COLUMN IF NOT EXISTS hipaa_compliant boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.ghl_hipaa_calls (
  id text PRIMARY KEY,
  location_id text NOT NULL,
  date_time timestamptz,
  contact_name text,
  contact_phone text,
  marketing_campaign text,
  number_name text,
  number_phone text,
  source_type text,
  direction text,
  call_status text,
  disposition text,
  first_time boolean,
  keyword text,
  referrer text,
  campaign text,
  duration_seconds integer,
  device_type text,
  qualified_lead boolean,
  landing_page text,
  from_number text,
  to_number text,
  uploaded_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.ghl_hipaa_forms (
  id text PRIMARY KEY,
  location_id text NOT NULL,
  name text,
  phone text,
  email text,
  message text,
  terms_and_conditions text,
  ip text,
  timezone text,
  submission_date timestamptz,
  url text,
  uploaded_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ghl_hipaa_calls_loc_time ON public.ghl_hipaa_calls (location_id, date_time);
CREATE INDEX IF NOT EXISTS idx_ghl_hipaa_forms_loc_sub ON public.ghl_hipaa_forms (location_id, submission_date);

ALTER TABLE public.ghl_hipaa_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_hipaa_forms ENABLE ROW LEVEL SECURITY;

-- Match ghl_calls-style access: org agency or user_clients assignment, active accounts only; super_admin bypass.
-- SELECT
CREATE POLICY "ghl_hipaa_calls_auth_select" ON public.ghl_hipaa_calls
  FOR SELECT TO authenticated
  USING (
    (location_id IN (
      SELECT cpa.platform_customer_id FROM public.client_platform_accounts cpa
      WHERE cpa.platform = 'ghl' AND cpa.is_active = true
        AND (
          cpa.agency_id = (SELECT up.agency_id FROM public.user_profiles up WHERE up.id = auth.uid())
          OR cpa.id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
        )
    ))
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_super_admin = true)
  );

CREATE POLICY "ghl_hipaa_forms_auth_select" ON public.ghl_hipaa_forms
  FOR SELECT TO authenticated
  USING (
    (location_id IN (
      SELECT cpa.platform_customer_id FROM public.client_platform_accounts cpa
      WHERE cpa.platform = 'ghl' AND cpa.is_active = true
        AND (
          cpa.agency_id = (SELECT up.agency_id FROM public.user_profiles up WHERE up.id = auth.uid())
          OR cpa.id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
        )
    ))
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_super_admin = true)
  );

-- INSERT
CREATE POLICY "ghl_hipaa_calls_auth_insert" ON public.ghl_hipaa_calls
  FOR INSERT TO authenticated
  WITH CHECK (
    (location_id IN (
      SELECT cpa.platform_customer_id FROM public.client_platform_accounts cpa
      WHERE cpa.platform = 'ghl' AND cpa.is_active = true
        AND (
          cpa.agency_id = (SELECT up.agency_id FROM public.user_profiles up WHERE up.id = auth.uid())
          OR cpa.id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
        )
    ))
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_super_admin = true)
  );

CREATE POLICY "ghl_hipaa_forms_auth_insert" ON public.ghl_hipaa_forms
  FOR INSERT TO authenticated
  WITH CHECK (
    (location_id IN (
      SELECT cpa.platform_customer_id FROM public.client_platform_accounts cpa
      WHERE cpa.platform = 'ghl' AND cpa.is_active = true
        AND (
          cpa.agency_id = (SELECT up.agency_id FROM public.user_profiles up WHERE up.id = auth.uid())
          OR cpa.id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
        )
    ))
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_super_admin = true)
  );

-- UPDATE
CREATE POLICY "ghl_hipaa_calls_auth_update" ON public.ghl_hipaa_calls
  FOR UPDATE TO authenticated
  USING (
    (location_id IN (
      SELECT cpa.platform_customer_id FROM public.client_platform_accounts cpa
      WHERE cpa.platform = 'ghl' AND cpa.is_active = true
        AND (
          cpa.agency_id = (SELECT up.agency_id FROM public.user_profiles up WHERE up.id = auth.uid())
          OR cpa.id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
        )
    ))
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_super_admin = true)
  )
  WITH CHECK (
    (location_id IN (
      SELECT cpa.platform_customer_id FROM public.client_platform_accounts cpa
      WHERE cpa.platform = 'ghl' AND cpa.is_active = true
        AND (
          cpa.agency_id = (SELECT up.agency_id FROM public.user_profiles up WHERE up.id = auth.uid())
          OR cpa.id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
        )
    ))
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_super_admin = true)
  );

CREATE POLICY "ghl_hipaa_forms_auth_update" ON public.ghl_hipaa_forms
  FOR UPDATE TO authenticated
  USING (
    (location_id IN (
      SELECT cpa.platform_customer_id FROM public.client_platform_accounts cpa
      WHERE cpa.platform = 'ghl' AND cpa.is_active = true
        AND (
          cpa.agency_id = (SELECT up.agency_id FROM public.user_profiles up WHERE up.id = auth.uid())
          OR cpa.id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
        )
    ))
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_super_admin = true)
  )
  WITH CHECK (
    (location_id IN (
      SELECT cpa.platform_customer_id FROM public.client_platform_accounts cpa
      WHERE cpa.platform = 'ghl' AND cpa.is_active = true
        AND (
          cpa.agency_id = (SELECT up.agency_id FROM public.user_profiles up WHERE up.id = auth.uid())
          OR cpa.id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
        )
    ))
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_super_admin = true)
  );

-- DELETE (clear-before-upload)
CREATE POLICY "ghl_hipaa_calls_auth_delete" ON public.ghl_hipaa_calls
  FOR DELETE TO authenticated
  USING (
    (location_id IN (
      SELECT cpa.platform_customer_id FROM public.client_platform_accounts cpa
      WHERE cpa.platform = 'ghl' AND cpa.is_active = true
        AND (
          cpa.agency_id = (SELECT up.agency_id FROM public.user_profiles up WHERE up.id = auth.uid())
          OR cpa.id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
        )
    ))
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_super_admin = true)
  );

CREATE POLICY "ghl_hipaa_forms_auth_delete" ON public.ghl_hipaa_forms
  FOR DELETE TO authenticated
  USING (
    (location_id IN (
      SELECT cpa.platform_customer_id FROM public.client_platform_accounts cpa
      WHERE cpa.platform = 'ghl' AND cpa.is_active = true
        AND (
          cpa.agency_id = (SELECT up.agency_id FROM public.user_profiles up WHERE up.id = auth.uid())
          OR cpa.id IN (SELECT uc.client_id FROM public.user_clients uc WHERE uc.user_id = auth.uid())
        )
    ))
    OR EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.is_super_admin = true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghl_hipaa_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ghl_hipaa_forms TO authenticated;
