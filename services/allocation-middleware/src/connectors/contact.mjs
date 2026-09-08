import { CONNECTOR_DONORBOX, CONNECTOR_GIVEBUTTER } from './sources.mjs';
import { isTruthyOptIn } from './amount.mjs';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function contactFromFields({ email, donorPrincipal }) {
  const emailRaw = asTrimmedString(email).toLowerCase();
  const safeEmail = EMAIL_PATTERN.test(emailRaw) && emailRaw.length <= 254 ? emailRaw : '';
  const principal = asTrimmedString(donorPrincipal);
  if (!safeEmail && !principal) return null;
  const contact = {};
  if (safeEmail) contact.email = safeEmail;
  if (principal) contact.donorPrincipal = principal;
  return contact;
}

/**
 * Opt-in contact from a connector payload or CSV row.
 * Returns null when the connector omitted contactable identity.
 * Never invents email or a donor principal.
 */
export function extractOptInContact(payload, { source } = {}) {
  if (!payload || typeof payload !== 'object') return null;
  if (source === CONNECTOR_GIVEBUTTER) {
    const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
    if (!isTruthyOptIn(data.communication_opt_in)) return null;
    return contactFromFields({ email: data.email });
  }
  if (source === CONNECTOR_DONORBOX) {
    const donation = payload.donation && typeof payload.donation === 'object'
      ? payload.donation
      : Array.isArray(payload)
        ? payload[0]
        : payload;
    if (!isTruthyOptIn(donation?.join_mailing_list)) return null;
    const donor = donation?.donor && typeof donation.donor === 'object' ? donation.donor : {};
    return contactFromFields({ email: donor.email, donorPrincipal: donor.id });
  }
  const record = /** @type {Record<string, any>} */ (payload);
  const donor = record.fromDonor && typeof record.fromDonor === 'object' ? record.fromDonor : {};
  return contactFromFields({
    email: record.email || record.donorEmail || donor.email,
    donorPrincipal: record.donorId || record.donorPrincipal || donor.id || '',
  });
}

export function hasContactableIdentity(contact) {
  return Boolean(contact && (contact.email || contact.donorPrincipal));
}
