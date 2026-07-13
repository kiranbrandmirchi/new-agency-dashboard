-- Grant Bing / Microsoft Ads permissions to standard agency roles (idempotent).

INSERT INTO public.permissions (permission_key, permission_label, category)
VALUES
  ('sidebar.bing_ads', 'Bing / Microsoft Ads', 'global'),
  ('tab.bing_ads.overview', 'Overview', 'report_tab_bing_ads'),
  ('tab.bing_ads.campaigns', 'Campaigns', 'report_tab_bing_ads'),
  ('tab.bing_ads.adgroups', 'Ad Groups', 'report_tab_bing_ads'),
  ('tab.bing_ads.ads', 'Ads', 'report_tab_bing_ads'),
  ('tab.bing_ads.keywords', 'Keywords', 'report_tab_bing_ads'),
  ('tab.bing_ads.searchterms', 'Search Terms', 'report_tab_bing_ads'),
  ('tab.bing_ads.geo', 'Locations', 'report_tab_bing_ads'),
  ('tab.bing_ads.conversions', 'Conversions', 'report_tab_bing_ads')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_name IN ('super_admin', 'admin', 'manager', 'Custom Role WoW')
  AND (
    p.permission_key = 'sidebar.bing_ads'
    OR p.permission_key LIKE 'tab.bing_ads.%'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;
