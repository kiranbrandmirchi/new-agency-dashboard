-- Normalize customer_id comparison in can_access_customer so that
-- "3969168045" and "396-916-8045" are treated as the same.
-- This ensures RLS works regardless of dash format in DB vs client_platform_accounts.
CREATE OR REPLACE FUNCTION public.can_access_customer(p_customer_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    -- Super admins see everything
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_super_admin = true
    )
    OR
    EXISTS (
      SELECT 1
      FROM client_platform_accounts cpa
      WHERE REPLACE(COALESCE(cpa.platform_customer_id, ''), '-', '') = REPLACE(COALESCE(p_customer_id, ''), '-', '')
        AND cpa.is_active = true
        AND (
          -- Agency admins/managers: their agency owns this account
          cpa.agency_id IN (
            SELECT up.agency_id FROM user_profiles up WHERE up.id = auth.uid()
          )
          OR
          -- Users with explicit client access
          cpa.id IN (
            SELECT uc.client_id FROM user_clients uc WHERE uc.user_id = auth.uid()
          )
        )
    );
$function$;
