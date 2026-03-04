/**
 * Ensures dashboard-related permissions exist in Supabase.
 * Call once on app load. Uses upsert with onConflict to insert only if not exists.
 *
 * Run in Supabase SQL Editor (if upsert fails or for role assignment):
 * -- INSERT INTO permissions (permission_key, permission_label, category) VALUES
 * -- ('tab.combined_dashboard', 'Combined Dashboard', 'report_tab'),
 * -- ('tab.account_breakdown', 'Account Breakdown', 'report_tab')
 * -- ON CONFLICT (permission_key) DO NOTHING;
 * --
 * -- INSERT INTO role_permissions (role_id, permission_id)
 * -- SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
 * -- WHERE r.role_name IN ('admin','manager','client')
 * -- AND p.permission_key IN ('tab.combined_dashboard','tab.account_breakdown')
 * -- ON CONFLICT (role_id, permission_id) DO NOTHING;
 */

import { supabase } from './supabaseClient';

const DASHBOARD_PERMISSIONS = [
  { permission_key: 'tab.combined_dashboard', permission_label: 'Combined Dashboard', category: 'report_tab' },
  { permission_key: 'tab.account_breakdown', permission_label: 'Account Breakdown', category: 'report_tab' },
];

let ensured = false;

export async function ensureDashboardPermissions() {
  if (ensured) return;
  try {
    const { error } = await supabase
      .from('permissions')
      .upsert(DASHBOARD_PERMISSIONS, { onConflict: 'permission_key', ignoreDuplicates: true });
    if (error) {
      console.warn('[ensurePermissions] Could not upsert permissions:', error.message);
    } else {
      ensured = true;
    }
  } catch (err) {
    console.warn('[ensurePermissions] Error:', err.message);
  }
}
