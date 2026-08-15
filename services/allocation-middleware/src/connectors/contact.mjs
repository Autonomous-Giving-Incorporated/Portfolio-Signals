const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Opt-in contact from a connector payload or CSV row.
 * Returns null when the connector omitted contactable identity.
 * Never invents email or a donor principal.
 */
export function extractOptInContact(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const source = /** @type {Record<string, any>} */ (payload);
  const donor = source.fromDonor && typeof source.fromDonor === 'object' ? source.fromDonor : {};
  const emailRaw = asTrimmedString(source.email || source.donorEmail || donor.email).toLowerCase();
  const email = EMAIL_PATTERN.test(emailRaw) && emailRaw.length <= 254 ? emailRaw : '';
  const donorPrincipal = asTrimmedString(
    source.donorId || source.donorPrincipal || donor.id || '',
  );
  if (!email && !donorPrincipal) return null;
  const contact = {};
  if (email) contact.email = email;
  if (donorPrincipal) contact.donorPrincipal = donorPrincipal;
  return contact;
}

export function hasContactableIdentity(contact) {
  return Boolean(contact && (contact.email || contact.donorPrincipal));
}
