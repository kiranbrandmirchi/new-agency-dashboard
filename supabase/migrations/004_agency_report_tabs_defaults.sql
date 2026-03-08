-- Insert default report tab configuration for agencies that don't have any
-- Safe to re-run: only inserts for agencies with no agency_report_tabs rows
-- NOTE: Run this after agencies and agency_report_tabs tables exist

INSERT INTO agency_report_tabs (agency_id, tab_key, tab_label, tab_order, is_visible, required_permission, platform)
SELECT a.id, v.tab_key, v.tab_label, v.tab_order, true, v.required_permission, 'google_ads'
FROM agencies a
CROSS JOIN (VALUES
  ('daily', 'Daily Breakdown', 1, 'tab.daily_breakdown'),
  ('campaigntypes', 'Campaign Types', 2, 'tab.overview'),
  ('campaigns', 'Campaigns', 3, 'tab.campaigns'),
  ('adgroups', 'Ad Groups', 4, 'tab.ad_groups'),
  ('keywords', 'Keywords', 5, 'tab.keywords'),
  ('searchterms', 'Search Terms', 6, 'tab.search_terms'),
  ('geo', 'Geo', 7, 'tab.geo'),
  ('conversions', 'Conversions', 8, 'tab.conversions')
) AS v(tab_key, tab_label, tab_order, required_permission)
WHERE NOT EXISTS (
  SELECT 1 FROM agency_report_tabs art
  WHERE art.agency_id = a.id AND art.platform = 'google_ads'
);
