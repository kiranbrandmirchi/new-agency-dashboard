import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const TAB_KEY_TO_INTERNAL = {
  overview: 'overview',
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

function getDefaultTabs(platform) {
  const prefix = `tab.${platform}.`;
  if (platform === 'google_ads') {
    return [
      { id: 'daily', label: 'Daily Breakdown', permission: `${prefix}daily` },
      { id: 'campaigntypes', label: 'Campaign Types', permission: `${prefix}campaigntypes` },
      { id: 'campaigns', label: 'Campaigns', permission: `${prefix}campaigns` },
      { id: 'adgroups', label: 'Ad Groups', permission: `${prefix}adgroups` },
      { id: 'keywords', label: 'Keywords', permission: `${prefix}keywords` },
      { id: 'conversions', label: 'Conversions', permission: `${prefix}conversions` },
    ];
  }
  if (platform === 'ga4') {
    return [
      { id: 'overview', label: 'Overview', permission: `${prefix}overview` },
      { id: 'daily', label: 'Daily', permission: `${prefix}daily` },
      { id: 'channels', label: 'Channels', permission: `${prefix}channels` },
      { id: 'sourcemedium', label: 'Source / Medium', permission: `${prefix}sourcemedium` },
      { id: 'pages', label: 'Pages', permission: `${prefix}pages` },
      { id: 'campaigns', label: 'Campaigns', permission: `${prefix}campaigns` },
      { id: 'devices', label: 'Devices', permission: `${prefix}devices` },
      { id: 'geo', label: 'Geography', permission: `${prefix}geo` },
      { id: 'pagetypes', label: 'Page Types', permission: `${prefix}pagetypes` },
      { id: 'vdp_make', label: 'VDP by Make', permission: `${prefix}vdp_make` },
      { id: 'vdp_model', label: 'VDP by Model', permission: `${prefix}vdp_model` },
      { id: 'vdp_rvtype', label: 'VDP by RV Type', permission: `${prefix}vdp_rvtype` },
      { id: 'vdp_condition', label: 'VDP by Condition', permission: `${prefix}vdp_condition` },
      { id: 'srp', label: 'SRP Pages', permission: `${prefix}srp` },
    ];
  }
  return [
    { id: 'daily', label: 'Daily Breakdown', permission: `${prefix}daily` },
    { id: 'campaigntypes', label: 'Campaign Types', permission: `${prefix}campaigntypes` },
    { id: 'campaigns', label: 'Campaigns', permission: `${prefix}campaigns` },
    { id: 'adgroups', label: 'Ad Groups', permission: `${prefix}adgroups` },
    { id: 'keywords', label: 'Keywords', permission: `${prefix}keywords` },
    { id: 'searchterms', label: 'Search Terms', permission: `${prefix}searchterms` },
    { id: 'geo', label: 'Geo', permission: `${prefix}geo` },
    { id: 'conversions', label: 'Conversions', permission: `${prefix}conversions` },
  ];
}

export function useAgencyReportTabs(platform = 'google_ads') {
  const { agencyId, hasPermission } = useAuth();
  const defaultTabs = useMemo(() => getDefaultTabs(platform), [platform]);
  const [tabs, setTabs] = useState(defaultTabs);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!agencyId) {
      setTabs(defaultTabs);
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase
      .from('agency_report_tabs')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('platform', platform)
      .eq('is_visible', true)
      .order('tab_order', { ascending: true })
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error || !data?.length) {
          setTabs(defaultTabs);
          setLoading(false);
          return;
        }
        const excludeForGoogleAds = new Set(['geo', 'searchterms']);
        const configured = data
          .filter((t) => platform === 'google_ads' ? !excludeForGoogleAds.has(t.tab_key) : true)
          .filter((t) => !t.required_permission || hasPermission(t.required_permission))
          .map((t) => {
            const internalId = TAB_KEY_TO_INTERNAL[t.tab_key] || t.tab_key;
            const defaultTab = defaultTabs.find((d) => d.id === internalId);
            return {
              id: internalId,
              label: t.tab_label || defaultTab?.label || t.tab_key,
              permission: t.required_permission || defaultTab?.permission,
            };
          });
        setTabs(configured.length > 0 ? configured : defaultTabs);
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [agencyId, hasPermission, platform]);

  return { tabs, loading };
}
