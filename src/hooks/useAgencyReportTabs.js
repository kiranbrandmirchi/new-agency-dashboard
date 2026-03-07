import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const TAB_KEY_TO_INTERNAL = {
  overview: 'daily',
  daily: 'daily',
  campaigntypes: 'campaigntypes',
  campaigns: 'campaigns',
  adgroups: 'adgroups',
  ad_groups: 'adgroups',
  keywords: 'keywords',
  search_terms: 'searchterms',
  searchterms: 'searchterms',
  geo: 'geo',
  conversions: 'conversions',
};

const DEFAULT_TABS = [
  { id: 'daily', label: 'Daily Breakdown', permission: 'tab.daily_breakdown' },
  { id: 'campaigntypes', label: 'Campaign Types', permission: 'tab.overview' },
  { id: 'campaigns', label: 'Campaigns', permission: 'tab.campaigns' },
  { id: 'adgroups', label: 'Ad Groups', permission: 'tab.ad_groups' },
  { id: 'keywords', label: 'Keywords', permission: 'tab.keywords' },
  { id: 'searchterms', label: 'Search Terms', permission: 'tab.search_terms' },
  { id: 'geo', label: 'Geo', permission: 'tab.geo' },
  { id: 'conversions', label: 'Conversions', permission: 'tab.conversions' },
];

export function useAgencyReportTabs(platform = 'google_ads') {
  const { agencyId, hasPermission } = useAuth();
  const [tabs, setTabs] = useState(DEFAULT_TABS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) {
      setTabs(DEFAULT_TABS);
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase
      .from('agency_report_tabs')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('is_visible', true)
      .order('tab_order', { ascending: true })
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error || !data?.length) {
          setTabs(DEFAULT_TABS);
          setLoading(false);
          return;
        }
        const configured = data
          .filter((t) => !t.required_permission || hasPermission(t.required_permission))
          .map((t) => {
            const internalId = TAB_KEY_TO_INTERNAL[t.tab_key] || t.tab_key;
            const defaultTab = DEFAULT_TABS.find((d) => d.id === internalId);
            return {
              id: internalId,
              label: t.tab_label || defaultTab?.label || t.tab_key,
              permission: t.required_permission || defaultTab?.permission,
            };
          });
        setTabs(configured.length > 0 ? configured : DEFAULT_TABS);
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [agencyId, hasPermission]);

  return { tabs, loading };
}
