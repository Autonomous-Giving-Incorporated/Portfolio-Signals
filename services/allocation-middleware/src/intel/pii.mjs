/**
 * SPEC-017 / SPEC-003: Signal subject, Opportunity title, and Recommendation
 * rationale MUST NOT contain donor email, name, or phone.
 * Fail closed: reject rather than silently publish PII.
 */

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
/** NANP and E.164-ish numbers; requires at least 10 digits. */
const PHONE_RE =
  /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?){2}\d{4}|\+\d{10,15}\b/;
const DONOR_FIELD_KEYS = Object.freeze([
  'donorName',
  'donorEmail',
  'donorPhone',
  'email',
  'phone',
  'firstName',
  'lastName',
  'fullName',
]);

export function extractKnownDonorTokens(input = {}) {
  const tokens = [];
  for (const key of DONOR_FIELD_KEYS) {
    const value = input[key];
    if (value != null && String(value).trim()) tokens.push(String(value).trim());
  }
  if (input.firstName && input.lastName) {
    tokens.push(`${String(input.firstName).trim()} ${String(input.lastName).trim()}`);
  }
  return tokens.filter(Boolean);
}

export function findDonorPii(text, extraTokens = []) {
  const value = text == null ? '' : String(text);
  const hits = [];
  if (EMAIL_RE.test(value)) hits.push('email');
  if (PHONE_RE.test(value)) hits.push('phone');
  for (const token of extraTokens) {
    const needle = String(token || '').trim();
    if (needle && value.toLowerCase().includes(needle.toLowerCase())) {
      hits.push('name');
      break;
    }
  }
  return hits;
}

export function assertNoDonorPii(field, text, extraTokens = []) {
  const hits = findDonorPii(text, extraTokens);
  if (hits.length > 0) {
    const err = new Error('DONOR_PII_FORBIDDEN');
    err.code = 'DONOR_PII_FORBIDDEN';
    err.field = field;
    err.hits = hits;
    throw err;
  }
}

export function assertNoDonorIdentityFields(input = {}) {
  for (const key of DONOR_FIELD_KEYS) {
    if (input[key] != null && String(input[key]).trim() !== '') {
      const err = new Error('DONOR_PII_FORBIDDEN');
      err.code = 'DONOR_PII_FORBIDDEN';
      err.field = key;
      err.hits = [key === 'donorEmail' || key === 'email' ? 'email' : key === 'donorPhone' || key === 'phone' ? 'phone' : 'name'];
      throw err;
    }
  }
}
