/** Derive lead-type buckets for HIPAA CSV rows (no ghl_contacts join). */

export function deriveHipaaCallLeadType(row) {
  const mc = String(row.marketing_campaign || '').toLowerCase();
  const st = String(row.source_type || '').toLowerCase();
  const ref = String(row.referrer || '').toLowerCase();
  const camp = String(row.campaign || '').toLowerCase();
  const blob = `${mc} ${st} ${ref} ${camp}`;
  if (blob.includes('facebook') || blob.includes('fbclid') || blob.includes('fb_')) return 'facebook_ads';
  if (blob.includes('gclid') || blob.includes('google ads') || (blob.includes('google') && (blob.includes('cpc') || blob.includes('ppc') || mc.includes('ads')))) {
    return 'google_ads';
  }
  if (st.includes('organic') || st.includes('organic search')) return 'organic';
  if (st.includes('referral') || (ref.startsWith('http') && !blob.includes('gclid'))) return 'referral';
  if (st.includes('direct') || st === '' || st === 'unknown') return 'direct';
  return 'unknown';
}

export function deriveHipaaFormLeadType(row) {
  const u = String(row.url || '').toLowerCase();
  if (u.includes('gclid=') || u.includes('utm_medium=cpc') || u.includes('utm_source=google')) return 'google_ads';
  if (u.includes('fbclid=') || u.includes('utm_source=facebook')) return 'facebook_ads';
  if (u.includes('utm_medium=organic') || u.includes('utm_source=organic')) return 'organic';
  return 'direct';
}

export function hipaaCallCleanSource(row) {
  const s = row.source_type;
  if (s && s !== '-' && String(s).toLowerCase() !== 'unknown') return String(s);
  if (row.marketing_campaign && row.marketing_campaign !== '-') return String(row.marketing_campaign);
  if (row.referrer && row.referrer !== '-') return String(row.referrer);
  if (row.campaign && row.campaign !== '-') return String(row.campaign);
  return '—';
}

export function hipaaFormCleanSource(row) {
  const u = row.url;
  if (u && String(u).trim()) return String(u).length > 80 ? `${String(u).slice(0, 80)}…` : String(u);
  return '—';
}

export function mapHipaaCallRowToView(r) {
  const clean_lead_type = deriveHipaaCallLeadType(r);
  return {
    id: r.id,
    date_added: r.date_time,
    contact_name: r.contact_name,
    contact_phone: r.contact_phone,
    contact_email: null,
    direction: r.direction,
    status: r.call_status,
    duration: r.duration_seconds,
    first_time: r.first_time,
    clean_source: hipaaCallCleanSource(r),
    clean_medium: null,
    clean_lead_type,
    _hipaa: true,
  };
}

export function mapHipaaFormRowToView(r) {
  const clean_lead_type = deriveHipaaFormLeadType(r);
  return {
    id: r.id,
    date_added: r.submission_date,
    contact_name: r.name,
    contact_email: r.email,
    contact_phone: r.phone,
    form_type: 'form_submission',
    form_name: 'Form submission',
    clean_source: hipaaFormCleanSource(r),
    clean_medium: null,
    clean_lead_type,
    first_time: null,
    _hipaa: true,
  };
}
