/**
 * Single source of truth for platform permissions and report tabs.
 * When you add new features (e.g. Facebook, Reddit reports), add them here, then run
 * "Sync Platform Config" in Admin → Permissions to update the database.
 *
 * HOW TO ADD A NEW PLATFORM (e.g. Facebook, Reddit):
 * 1. Add a section to PLATFORM_REPORT_TABS with the platform key and its tabs.
 * 2. Run "Sync Platform Config" in Admin → Permissions.
 * 3. The new "Report Tabs: <Platform>" section will appear in Roles & Permissions.
 */

/** Display labels for platform categories in Roles UI */
export const PLATFORM_LABELS = {
  google_ads: 'Google Ads',
  meta_ads: 'Meta Ads (Facebook)',
  bing_ads: 'Microsoft / Bing Ads',
  reddit_ads: 'Reddit Ads',
  tiktok_ads: 'TikTok Ads',
  ga4: 'Google Analytics (GA4)',
  ghl: 'GHL (GoHighLevel)',
};

/** Global + sidebar + action permissions (not platform-specific report tabs) */
export const PLATFORM_PERMISSIONS = [
  { permission_key: 'tab.combined_dashboard', permission_label: 'Dashboard Tab', category: 'global' },
  { permission_key: 'sidebar.google_ads', permission_label: 'Google Ads', category: 'global' },
  { permission_key: 'sidebar.facebook_ads', permission_label: 'Meta / Facebook Ads', category: 'global' },
  { permission_key: 'sidebar.bing_ads', permission_label: 'Bing / Microsoft Ads', category: 'global' },
  { permission_key: 'sidebar.tiktok_ads', permission_label: 'TikTok Ads', category: 'global' },
  { permission_key: 'sidebar.reddit_ads', permission_label: 'Reddit Ads', category: 'global' },
  { permission_key: 'sidebar.dsp', permission_label: 'DSP (TTD / DV360)', category: 'global' },
  { permission_key: 'sidebar.analytics', permission_label: 'GA4 / Web Analytics', category: 'global' },
  { permission_key: 'sidebar.ghl', permission_label: 'GHL Leads', category: 'global' },
  { permission_key: 'sidebar.settings', permission_label: 'White-Label Settings', category: 'global' },
  { permission_key: 'sidebar.agency_reports', permission_label: 'Agency Reports', category: 'global' },
  { permission_key: 'sidebar.monthly_reports', permission_label: 'Monthly Reports', category: 'global' },
  { permission_key: 'action.manage_users', permission_label: 'Admin Panel / Manage Users', category: 'global' },
  { permission_key: 'action.admin_clients', permission_label: 'Admin Client Accounts', category: 'global' },
  { permission_key: 'action.admin_roles', permission_label: 'Admin Roles & Permissions', category: 'global' },
  { permission_key: 'action.admin_report_tabs', permission_label: 'Admin Report Tabs', category: 'global' },
  { permission_key: 'action.admin_integrations', permission_label: 'Admin Integrations', category: 'global' },
  { permission_key: 'action.export_pdf', permission_label: 'Export PDF', category: 'action' },
  { permission_key: 'action.share_report', permission_label: 'Share Report', category: 'action' },
  { permission_key: 'action.sync_data', permission_label: 'Sync Data', category: 'action' },
  { permission_key: 'action.create_report', permission_label: 'Create Report', category: 'action' },
  { permission_key: 'action.publish_report', permission_label: 'Publish Report', category: 'action' },
  /** When granted, user sees all platform accounts for their agency (same as Admin/Manager role). Use for custom agency roles. */
  { permission_key: 'customer.view_all', permission_label: 'View all agency accounts (data access)', category: 'customer' },
];

/**
 * Report tabs per platform. Each tab becomes a permission with category "report_tab_<platform>".
 * Add new platforms here to get "Report Tabs: <Platform>" in Roles & Permissions.
 */
export const PLATFORM_REPORT_TABS = {
  ghl: [
    { tab_key: 'leads', tab_label: 'Leads', tab_order: 1 },
  ],
  google_ads: [
    { tab_key: 'daily', tab_label: 'Daily Breakdown', tab_order: 1 },
    { tab_key: 'campaigntypes', tab_label: 'Campaign Types / Overview', tab_order: 2 },
    { tab_key: 'campaigns', tab_label: 'Campaigns', tab_order: 3 },
    { tab_key: 'adgroups', tab_label: 'Ad Groups', tab_order: 4 },
    { tab_key: 'keywords', tab_label: 'Keywords', tab_order: 5 },
    { tab_key: 'conversions', tab_label: 'Conversions', tab_order: 6 },
  ],
  meta_ads: [
    { tab_key: 'campaigns', tab_label: 'Campaigns', tab_order: 1 },
    { tab_key: 'adsets', tab_label: 'Ad Sets', tab_order: 2 },
    { tab_key: 'ads', tab_label: 'Ads', tab_order: 3 },
    { tab_key: 'platforms', tab_label: 'By Platform', tab_order: 4 },
    { tab_key: 'placements', tab_label: 'Placements', tab_order: 5 },
    { tab_key: 'daily', tab_label: 'Daily Breakdown', tab_order: 6 },
  ],
  reddit_ads: [
    { tab_key: 'campaigns', tab_label: 'Campaigns', tab_order: 1 },
    { tab_key: 'adgroups', tab_label: 'Ad Groups', tab_order: 2 },
    { tab_key: 'placements', tab_label: 'Placements', tab_order: 3 },
    { tab_key: 'daily', tab_label: 'Daily Breakdown', tab_order: 4 },
  ],
  ga4: [
    { tab_key: 'overview', tab_label: 'Overview', tab_order: 1 },
    { tab_key: 'daily', tab_label: 'Daily', tab_order: 2 },
    { tab_key: 'channels', tab_label: 'Channels', tab_order: 3 },
    { tab_key: 'sourcemedium', tab_label: 'Source / Medium', tab_order: 4 },
    { tab_key: 'pages', tab_label: 'Pages', tab_order: 5 },
    { tab_key: 'campaigns', tab_label: 'Campaigns', tab_order: 6 },
    { tab_key: 'devices', tab_label: 'Devices', tab_order: 7 },
    { tab_key: 'geo', tab_label: 'Geography', tab_order: 8 },
    { tab_key: 'pagetypes', tab_label: 'Page Types', tab_order: 9 },
    { tab_key: 'vdp_make', tab_label: 'VDP by Make', tab_order: 10 },
    { tab_key: 'vdp_model', tab_label: 'VDP by Model', tab_order: 11 },
    { tab_key: 'vdp_rvtype', tab_label: 'VDP by RV Type', tab_order: 12 },
    { tab_key: 'vdp_condition', tab_label: 'VDP by Condition', tab_order: 13 },
    { tab_key: 'srp', tab_label: 'SRP Pages', tab_order: 14 },
  ],
  bing_ads: [
    { tab_key: 'overview', tab_label: 'Overview', tab_order: 1 },
    { tab_key: 'campaigns', tab_label: 'Campaigns', tab_order: 2 },
    { tab_key: 'adgroups', tab_label: 'Ad Groups', tab_order: 3 },
    { tab_key: 'ads', tab_label: 'Ads', tab_order: 4 },
    { tab_key: 'keywords', tab_label: 'Keywords', tab_order: 5 },
    { tab_key: 'searchterms', tab_label: 'Search Terms', tab_order: 6 },
    { tab_key: 'geo', tab_label: 'Locations', tab_order: 7 },
    { tab_key: 'conversions', tab_label: 'Conversions', tab_order: 8 },
  ],
};

/** All permissions derived from config (global + per-platform report tabs). Used by Sync. */
export function getAllPlatformPermissions() {
  const perms = [...PLATFORM_PERMISSIONS];
  for (const [platform, tabs] of Object.entries(PLATFORM_REPORT_TABS)) {
    const category = `report_tab_${platform}`;
    for (const t of tabs) {
      perms.push({
        permission_key: `tab.${platform}.${t.tab_key}`,
        permission_label: t.tab_label,
        category,
      });
    }
  }
  return perms;
}
