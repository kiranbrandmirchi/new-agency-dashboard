-- Fix duplicate key error: unique constraint must include platform
-- so the same tab_key (e.g. 'campaigns') can exist per platform per agency.

-- Backfill null platform to 'google_ads' for legacy rows
UPDATE public.agency_report_tabs SET platform = 'google_ads' WHERE platform IS NULL;

-- Drop old constraint (agency_id, tab_key only)
ALTER TABLE public.agency_report_tabs DROP CONSTRAINT IF EXISTS agency_report_tabs_agency_id_tab_key_key;

-- Remove duplicates (keep lowest id per agency_id, platform, tab_key)
DELETE FROM public.agency_report_tabs a
USING public.agency_report_tabs b
WHERE a.agency_id = b.agency_id AND a.platform = b.platform AND a.tab_key = b.tab_key
  AND a.id > b.id;

-- Add new unique constraint (agency_id, platform, tab_key)
CREATE UNIQUE INDEX agency_report_tabs_agency_platform_tab_key_key
  ON public.agency_report_tabs (agency_id, platform, tab_key);

ALTER TABLE public.agency_report_tabs
  ADD CONSTRAINT agency_report_tabs_agency_platform_tab_key_key
  UNIQUE USING INDEX agency_report_tabs_agency_platform_tab_key_key;
