/**
 * BACKUP — PPT Report client dropdown query (clients table)
 * Replaced by client_platform_accounts (account_name, platform_customer_id).
 * Date: 2026-05-20
 */
export const PPT_REPORT_LOAD_CLIENTS_CLIENTS_TABLE_BACKUP = `
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('agency_id', effectiveAgencyId)
    .order('name');
  // Dropdown: value={c.id} label={c.name}
  // selectedClientName = clients.find((c) => c.id === selectedClientId)?.name
`;
