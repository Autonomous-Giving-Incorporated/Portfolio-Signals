/**
 * SPEC-026 adapter surface. Re-exports the three adapter functions only.
 * Source-specific modules stay behind this boundary.
 */
export { CONNECTOR_EVERY_ORG } from './sources.mjs';
export {
  CONNECTOR_CSV,
  CONNECTOR_DONORBOX,
  CONNECTOR_GIVEBUTTER,
  CONNECTOR_SOURCES,
  isConnectorSource,
  requireConnectorSource,
  webhookPathForSource,
} from './sources.mjs';
export { verify_webhook, normalize_gift, list_campaign_hints } from './adapter.mjs';
