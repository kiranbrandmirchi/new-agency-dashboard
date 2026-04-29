-- Expand customer access to sibling platform accounts under the same client group.
-- `user_clients.client_id` stores `client_platform_accounts.id` assignments.
-- If one assigned account belongs to a grouped `client_id`, grant access to
-- all accounts in that same group so cross-platform data (e.g. TikTok) is visible.
CREATE OR REPLACE FUNCTION public.can_access_customer(p_customer_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT
    EXISTS (
      SELECT 1
      FROM user_profiles
      WHERE id = auth.uid()
        AND is_super_admin = true
    )
    OR EXISTS (
      SELECT 1
      FROM client_platform_accounts cpa
      WHERE REPLACE(COALESCE(cpa.platform_customer_id, ''), '-', '') = REPLACE(COALESCE(p_customer_id, ''), '-', '')
        AND cpa.is_active = true
        AND (
          cpa.agency_id IN (
            SELECT up.agency_id
            FROM user_profiles up
            WHERE up.id = auth.uid()
          )
          OR cpa.id IN (
            SELECT uc.client_id
            FROM user_clients uc
            WHERE uc.user_id = auth.uid()
          )
          OR cpa.client_id IN (
            SELECT assigned.client_id
            FROM user_clients uc
            JOIN client_platform_accounts assigned
              ON assigned.id = uc.client_id
            WHERE uc.user_id = auth.uid()
              AND assigned.client_id IS NOT NULL
          )
        )
    );
$function$;
