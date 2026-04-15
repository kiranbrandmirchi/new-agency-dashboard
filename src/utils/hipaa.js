/**
 * Frontend-only HIPAA-style masking for GHL contact fields.
 * Raw values remain in Supabase; never log or send unmasked PII to analytics.
 */

function initialUpper(ch) {
  if (!ch) return '';
  return ch.toUpperCase() + '.';
}

/** @param {string|null|undefined} name */
export function maskName(name) {
  if (name == null || String(name).trim() === '') return '—';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = initialUpper(parts[0].charAt(0));
  if (parts.length === 1) return first;
  const lastInitial = initialUpper(parts[parts.length - 1].charAt(0));
  return `${first} ${lastInitial}`;
}

/** @param {string|null|undefined} phone */
export function maskPhone(phone) {
  if (phone == null || String(phone).trim() === '') return '—';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 0) return '—';
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const maskLen = digits.length - 3;
  return `${'•'.repeat(maskLen)}${last3}`;
}

/** @returns {string} */
export function maskEmail() {
  return '•••@•••';
}
