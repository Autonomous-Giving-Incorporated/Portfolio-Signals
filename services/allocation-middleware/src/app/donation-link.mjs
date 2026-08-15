/**
 * Tenant outbound Donation Link. HTTPS only. Never invent a URL.
 * Empty / missing → null (omit CTA).
 */
export function normalizeDonationLink(value) {
  const raw = value == null ? '' : String(value).trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DONATION_LINK_INVALID');
  }
  if (url.protocol !== 'https:') throw new Error('DONATION_LINK_INVALID');
  if (url.username || url.password) throw new Error('DONATION_LINK_INVALID');
  if (!url.hostname) throw new Error('DONATION_LINK_INVALID');
  return url.toString();
}

export function publicDonationLink(value) {
  try {
    return normalizeDonationLink(value);
  } catch {
    return null;
  }
}
