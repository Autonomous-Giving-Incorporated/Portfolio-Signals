/**
 * Production readiness config.
 * In production (NODE_ENV=production or REQUIRE_PROD_GUARDS=1):
 * - DATA_FILE required (durable store)
 * - OPERATOR_TOKEN required
 * - WEBHOOK_TOKEN required
 * - PUBLIC_BASE_URL recommended for setup wizard copy-paste URL
 */
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const production =
    nodeEnv === 'production' || env.REQUIRE_PROD_GUARDS === '1' || env.REQUIRE_PROD_GUARDS === 'true';
  const orgId = env.ORG_ID || (production ? '' : 'org_demo');
  const dataFile = env.DATA_FILE || '';
  const operatorToken = env.OPERATOR_TOKEN || '';
  const webhookToken = env.WEBHOOK_TOKEN || '';
  const publicBaseUrl = (env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const port = Number(env.PORT || 8787);
  const proofSlaHours = Number(env.PROOF_SLA_HOURS || 72);
  const errors = [];

  if (production) {
    if (!orgId) errors.push('ORG_ID is required in production');
    if (!dataFile) errors.push('DATA_FILE is required in production (durable store)');
    if (!operatorToken || operatorToken.length < 16) {
      errors.push('OPERATOR_TOKEN is required in production (min 16 chars)');
    }
    if (!webhookToken || webhookToken.length < 16) {
      errors.push('WEBHOOK_TOKEN is required in production (min 16 chars)');
    }
    if (!publicBaseUrl) {
      errors.push('PUBLIC_BASE_URL is required in production (for every.org setup wizard)');
    }
  }

  return {
    nodeEnv,
    production,
    orgId,
    dataFile,
    operatorToken,
    webhookToken,
    publicBaseUrl,
    port,
    proofSlaHours,
    errors,
    ok: errors.length === 0,
  };
}

/**
 * Build the every.org webhook URL a nonprofit pastes into Advanced settings.
 */
export function buildEveryOrgWebhookUrl(publicBaseUrl, webhookToken) {
  const base = (publicBaseUrl || '').replace(/\/$/, '');
  if (!base) return '';
  const path = '/webhooks/every-org';
  if (!webhookToken) return `${base}${path}`;
  return `${base}${path}?token=${encodeURIComponent(webhookToken)}`;
}
