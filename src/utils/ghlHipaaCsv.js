/** "01:18" → 78, "05:40" → 340, "-" or "" → 0 */
export function parseDuration(dur) {
  if (dur == null || dur === '' || dur === '-') return 0;
  const parts = String(dur).split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/** "Mar 25th 2026, 1:34 pm" → ISO string */
export function parseSubmissionDate(val) {
  if (!val || val === '-') return null;
  const cleaned = String(val).replace(/(st|nd|rd|th)\b/gi, '');
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseCallDateTime(val) {
  if (!val || val === '-') return null;
  const s = String(val).trim();
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const HIPAA_CALL_CSV_HEADERS = [
  'Date & Time',
  'Contact Name',
  'Contact Phone',
  'Marketing Campaign',
  'Number Name',
  'Number Phone',
  'Source Type',
  'Direction',
  'Call Status',
  'Disposition',
  'First Time',
  'Keyword',
  'Referrer',
  'Campaign',
  'Duration',
  'Device Type',
  'Qualified Lead',
  'Landing Page',
  'From',
  'To',
];

export const HIPAA_FORM_CSV_HEADERS = [
  'Name',
  'Phone',
  'Email',
  'Message',
  'Terms and Conditions',
  'IP',
  'Timezone',
  'Submission Date',
  'URL',
];

export function mapCsvRowToHipaaCall(row, locationId) {
  const dt = row['Date & Time'];
  const id = `call_${locationId}_${String(dt || '').replace(/[^a-zA-Z0-9]/g, '_')}`;
  return {
    id,
    location_id: locationId,
    date_time: parseCallDateTime(dt),
    contact_name: row['Contact Name'] ?? null,
    contact_phone: row['Contact Phone'] ?? null,
    marketing_campaign: row['Marketing Campaign'] === '-' ? null : row['Marketing Campaign'] ?? null,
    number_name: row['Number Name'] ?? null,
    number_phone: row['Number Phone'] ?? null,
    source_type: row['Source Type'] === 'Unknown' ? null : row['Source Type'] ?? null,
    direction: String(row.Direction || '').toLowerCase() || null,
    call_status: String(row['Call Status'] || '').toLowerCase() || null,
    disposition: row.Disposition === '-' ? null : row.Disposition ?? null,
    first_time: row['First Time'] === 'Yes',
    keyword: row.Keyword === '-' ? null : row.Keyword ?? null,
    referrer: row.Referrer === '-' ? null : row.Referrer ?? null,
    campaign: row.Campaign === '-' ? null : row.Campaign ?? null,
    duration_seconds: parseDuration(row.Duration),
    device_type: row['Device Type'] === '-' ? null : row['Device Type'] ?? null,
    qualified_lead: row['Qualified Lead'] === 'Yes',
    landing_page: row['Landing Page'] === '-' ? null : row['Landing Page'] ?? null,
    from_number: row.From ?? null,
    to_number: row.To ?? null,
    uploaded_at: new Date().toISOString(),
  };
}

export function mapCsvRowToHipaaForm(row, locationId) {
  const sub = row['Submission Date'];
  const phoneDigits = String(row.Phone || '').replace(/[^0-9]/g, '') || 'nophone';
  const id = `form_${locationId}_${String(sub || '').replace(/[^a-zA-Z0-9]/g, '_')}_${phoneDigits}`;
  return {
    id,
    location_id: locationId,
    name: row.Name ?? null,
    phone: row.Phone ?? null,
    email: row.Email ?? null,
    message: row.Message || null,
    terms_and_conditions: row['Terms and Conditions'] || null,
    ip: row.IP || null,
    timezone: row.Timezone || null,
    submission_date: parseSubmissionDate(sub),
    url: row.URL || null,
    uploaded_at: new Date().toISOString(),
  };
}

export function validateCallCsvHeaders(sampleRow) {
  if (!sampleRow || typeof sampleRow !== 'object') return { ok: false, missing: HIPAA_CALL_CSV_HEADERS };
  const missing = HIPAA_CALL_CSV_HEADERS.filter((h) => !(h in sampleRow));
  return { ok: missing.length === 0, missing };
}

export function validateFormCsvHeaders(sampleRow) {
  if (!sampleRow || typeof sampleRow !== 'object') return { ok: false, missing: HIPAA_FORM_CSV_HEADERS };
  const missing = HIPAA_FORM_CSV_HEADERS.filter((h) => !(h in sampleRow));
  return { ok: missing.length === 0, missing };
}
