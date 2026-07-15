import React, { createContext, useContext, useMemo } from 'react';
import {
  getAgencyBrandLabel,
  getAgencyPreparedBy,
  getAgencyWebsite,
} from '../utils/agencyBranding';

const ReportBrandingContext = createContext({
  agencyName: 'AGENCY',
  preparedBy: 'Agency',
  website: 'agency.com',
});

export function ReportBrandingProvider({ agency, children }) {
  const value = useMemo(() => ({
    agencyName: getAgencyBrandLabel(agency),
    preparedBy: getAgencyPreparedBy(agency),
    website: getAgencyWebsite(agency),
  }), [agency]);

  return (
    <ReportBrandingContext.Provider value={value}>
      {children}
    </ReportBrandingContext.Provider>
  );
}

export function useReportBranding() {
  return useContext(ReportBrandingContext);
}
