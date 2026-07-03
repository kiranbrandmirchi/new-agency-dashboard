/**
 * BACKUP — PPT Report client dropdown query (client_platform_accounts table)
 * Reverted to clients table per product decision (2026).
 */
export const PPT_REPORT_LOAD_CLIENTS_CPA_TABLE_BACKUP = `
  const { data, error } = await supabase
    .from('client_platform_accounts')
    .select('platform_customer_id, account_name')
    .eq('agency_id', effectiveAgencyId)
    .eq('is_active', true)
    .order('account_name');
  // Deduped by platform_customer_id → { id, name }
`;
