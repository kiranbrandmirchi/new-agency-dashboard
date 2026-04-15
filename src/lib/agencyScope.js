/**
 * Resolves which agency id data hooks should scope to.
 * - Super admins: only `activeAgencyId` (sidebar). `null` means "all agencies" / global.
 * - Everyone else: `activeAgencyId ?? agencyId` so profile agency is used if state lags after login.
 */
export function getEffectiveAgencyScopeId(isSuperAdmin, activeAgencyId, agencyId) {
  if (isSuperAdmin) return activeAgencyId ?? null;
  return activeAgencyId ?? agencyId ?? null;
}
