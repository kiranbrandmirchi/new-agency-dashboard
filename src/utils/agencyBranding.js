export const DEFAULT_COVER_LOGO_URL = '/brand-logo.png';

const FALLBACK_PREPARED_BY = 'Agency';
const FALLBACK_WEBSITE = 'agency.com';

/**
 * Uppercase brand label for report footers and cover left column.
 * @param {{ agency_name?: string } | null | undefined} agency
 * @returns {string}
 */
export function getAgencyBrandLabel(agency) {
  const name = (agency?.agency_name || FALLBACK_PREPARED_BY).trim();
  return name.toUpperCase();
}

/**
 * Display name for "Prepared by" lines.
 * @param {{ agency_name?: string } | null | undefined} agency
 * @returns {string}
 */
export function getAgencyPreparedBy(agency) {
  return (agency?.agency_name || FALLBACK_PREPARED_BY).trim() || FALLBACK_PREPARED_BY;
}

/**
 * Website host without protocol for cover / thank-you slides.
 * @param {{ website_url?: string } | null | undefined} agency
 * @returns {string}
 */
export function getAgencyWebsite(agency) {
  const raw = (agency?.website_url || FALLBACK_WEBSITE).trim();
  return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '') || FALLBACK_WEBSITE;
}

/**
 * Uppercase brand label from a preparedBy string (for PPTX footers).
 * @param {string | null | undefined} preparedBy
 * @returns {string}
 */
export function brandLabelFromPreparedBy(preparedBy) {
  const name = (preparedBy || FALLBACK_PREPARED_BY).trim();
  return name.toUpperCase();
}
