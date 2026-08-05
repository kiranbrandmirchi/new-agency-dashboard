-- Allow super admins to insert sync_log rows for any agency (agency switcher).
-- Previous INSERT policy only allowed agency_id = user_profiles.agency_id, so
-- Sync Now from a super admin viewing Chipper Digital wrote no history.

CREATE POLICY "Super admin can insert sync_log"
  ON public.sync_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin());
