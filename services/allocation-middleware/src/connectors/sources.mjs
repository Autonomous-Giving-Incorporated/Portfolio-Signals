/** SPEC-026 v1.1.0 tenant source values. Stripe is never a donation source. */

export const CONNECTOR_EVERY_ORG = 'every.org';
export const CONNECTOR_GIVEBUTTER = 'givebutter';
export const CONNECTOR_DONORBOX = 'donorbox';
export const CONNECTOR_CSV = 'csv';

export const CONNECTOR_SOURCES = Object.freeze([
  CONNECTOR_EVERY_ORG,
  CONNECTOR_GIVEBUTTER,
  CONNECTOR_DONORBOX,
  CONNECTOR_CSV,
]);

export function isConnectorSource(value) {
  return CONNECTOR_SOURCES.includes(String(value || ''));
}

export function requireConnectorSource(value) {
  const source = String(value || '').trim();
  if (!isConnectorSource(source)) {
    throw new Error('INVALID_CONNECTOR_SOURCE');
  }
  return source;
}

export function webhookPathForSource(source) {
  switch (source) {
    case CONNECTOR_GIVEBUTTER:
      return '/webhooks/givebutter';
    case CONNECTOR_DONORBOX:
      return '/webhooks/donorbox';
    case CONNECTOR_CSV:
      return null;
    case CONNECTOR_EVERY_ORG:
    default:
      return '/webhooks/every-org';
  }
}
