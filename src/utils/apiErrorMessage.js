/** User-safe message for GA4 / Google HTTP failures (no HTML error pages). */
function ga4FriendlyStatus(status) {
  switch (String(status)) {
    case '502':
    case '503':
    case '504':
      return `Google Analytics is temporarily unavailable (${status}). Please try again in a few minutes.`;
    case '429':
      return 'Google Analytics rate limit exceeded. Please try again later.';
    case '401':
    case '403':
      return `Google Analytics authorization failed (${status}). Reconnect the account in settings.`;
    default:
      return status && status !== 'unknown'
        ? `Google Analytics request failed (${status}).`
        : 'Google Analytics request failed. Please try again.';
  }
}

/**
 * Turn raw API/edge error text into a short user-safe message (no HTML dumps).
 */
export function sanitizeApiErrorMessage(raw) {
  if (raw == null || raw === '') return '';
  let msg = String(raw).trim();

  const ga4StatusMatch = msg.match(/^GA4\s+(\d{3})\s*:\s*/i);
  if (ga4StatusMatch) {
    const status = ga4StatusMatch[1];
    const rest = msg.slice(ga4StatusMatch[0].length);
    if (/^<\s*(!DOCTYPE|html)/i.test(rest.trim())) {
      return ga4FriendlyStatus(status);
    }
  }

  if (/^<\s*(!DOCTYPE|html)/i.test(msg)) {
    const status = (msg.match(/\b502\b/) && '502')
      || (msg.match(/\b503\b/) && '503')
      || (msg.match(/\b504\b/) && '504')
      || 'unknown';
    return ga4FriendlyStatus(status);
  }

  if (/<[a-z]/i.test(msg)) {
    msg = msg.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  if (msg.length > 280) msg = `${msg.slice(0, 280)}…`;
  return msg;
}
