-- Seed default permissions for sidebar, report tabs, and actions
-- Safe to re-run: inserts only if permission_key does not exist

-- Sidebar permissions (from src/components/Sidebar.jsx NAV_ITEMS)
INSERT INTO permissions (permission_key, permission_label, category)
SELECT v.k, v.l, v.c FROM (VALUES
  ('tab.combined_dashboard', 'Dashboard Tab', 'sidebar'),
  ('sidebar.google_ads', 'Google Ads', 'sidebar'),
  ('sidebar.facebook_ads', 'Meta / Facebook Ads', 'sidebar'),
  ('sidebar.bing_ads', 'Bing / Microsoft Ads', 'sidebar'),
  ('sidebar.tiktok_ads', 'TikTok Ads', 'sidebar'),
  ('sidebar.reddit_ads', 'Reddit Ads', 'sidebar'),
  ('sidebar.dsp', 'DSP (TTD / DV360)', 'sidebar'),
  ('sidebar.dating_apps', 'Dating Apps / Direct', 'sidebar'),
  ('sidebar.ctv', 'CTV Campaigns', 'sidebar'),
  ('sidebar.analytics', 'GA4 / Web Analytics', 'sidebar'),
  ('sidebar.email', 'Email Marketing', 'sidebar'),
  ('sidebar.ghl', 'GoHighLevel', 'sidebar'),
  ('sidebar.ott', 'OTT / Vimeo', 'sidebar'),
  ('sidebar.seo', 'SEO Performance', 'sidebar'),
  ('sidebar.geo', 'Geographic View', 'sidebar'),
  ('sidebar.creatives', 'Creative Analysis', 'sidebar'),
  ('sidebar.events', 'Events / Special', 'sidebar'),
  ('sidebar.settings', 'White-Label Settings', 'sidebar')
) AS v(k, l, c)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_key = v.k);

-- Report tab permissions (from src/hooks/useAgencyReportTabs.js)
INSERT INTO permissions (permission_key, permission_label, category)
SELECT v.k, v.l, v.c FROM (VALUES
  ('tab.daily_breakdown', 'Daily Breakdown', 'report_tab'),
  ('tab.overview', 'Campaign Types / Overview', 'report_tab'),
  ('tab.campaigns', 'Campaigns', 'report_tab'),
  ('tab.ad_groups', 'Ad Groups', 'report_tab'),
  ('tab.keywords', 'Keywords', 'report_tab'),
  ('tab.search_terms', 'Search Terms', 'report_tab'),
  ('tab.geo', 'Geo', 'report_tab'),
  ('tab.conversions', 'Conversions', 'report_tab')
) AS v(k, l, c)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_key = v.k);

-- Action permissions
INSERT INTO permissions (permission_key, permission_label, category)
SELECT v.k, v.l, v.c FROM (VALUES
  ('action.export_pdf', 'Export PDF', 'action'),
  ('action.share_report', 'Share Report', 'action'),
  ('action.sync_data', 'Sync Data', 'action'),
  ('action.manage_users', 'Manage Users / Admin Panel', 'action')
) AS v(k, l, c)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_key = v.k);
