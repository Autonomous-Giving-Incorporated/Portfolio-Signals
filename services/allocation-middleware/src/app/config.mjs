/**
 * Production readiness config.
 * In production (NODE_ENV=production or REQUIRE_PROD_GUARDS=1):
 * - DATA_FILE required
 * - WEBHOOK_TOKEN required
 * - Either Supabase director auth (SUPABASE_URL + SERVICE_ROLE) OR OPERATOR_TOKEN
 * - PUBLIC_BASE_URL required
 */
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const production =
    nodeEnv === 'production' || env.REQUIRE_PROD_GUARDS === '1' || env.REQUIRE_PROD_GUARDS === 'true';
  const orgId = env.ORG_ID || (production ? '' : 'org_hacker_dojo');
  const dataFile = env.DATA_FILE || '';
  const operatorToken = env.OPERATOR_TOKEN || '';
  const webhookToken = env.WEBHOOK_TOKEN || '';
  const publicBaseUrl = (env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const supabaseUrl = (env.SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseAnonKey = env.SUPABASE_ANON_KEY || '';
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const allowOperatorFallback =
    env.ALLOW_OPERATOR_TOKEN_FALLBACK === '1' ||
    env.ALLOW_OPERATOR_TOKEN_FALLBACK === 'true' ||
    !production;
  const port = Number(env.PORT || 8787);
  const proofSlaHours = Number(env.PROOF_SLA_HOURS || 72);
  const errors = [];

  const hasSupabaseAuth = Boolean(supabaseUrl && supabaseServiceRoleKey);

  if (production) {
    if (!orgId) errors.push('ORG_ID is required in production');
    if (!dataFile) errors.push('DATA_FILE is required in production (durable store)');
    if (!webhookToken || webhookToken.length < 16) {
      errors.push('WEBHOOK_TOKEN is required in production (min 16 chars)');
    }
    if (!publicBaseUrl) {
      errors.push('PUBLIC_BASE_URL is required in production (for every.org setup wizard)');
    }
    if (!hasSupabaseAuth) {
      if (!operatorToken || operatorToken.length < 16) {
        errors.push(
          'SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY (director login) or OPERATOR_TOKEN required in production',
        );
      }
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
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    hasSupabaseAuth,
    allowOperatorFallback,
    port,
    proofSlaHours,
    errors,
    ok: errors.length === 0,
  };
}

export function buildEveryOrgWebhookUrl(publicBaseUrl, webhookToken) {
  return buildConnectorWebhookUrl(publicBaseUrl, 'every.org', { webhookToken });
}

/**
 * Operator-owned origin only. Empty publicBaseUrl returns empty — never invent a host.
 */
export function buildConnectorWebhookUrl(publicBaseUrl, source, { webhookToken } = {}) {
  const base = (publicBaseUrl || '').replace(/\/$/, '');
  if (!base) return '';
  if (source === 'givebutter') return `${base}/webhooks/givebutter`;
  if (source === 'donorbox') return `${base}/webhooks/donorbox`;
  if (source === 'csv') return '';
  const path = '/webhooks/every-org';
  if (!webhookToken) return `${base}${path}`;
  return `${base}${path}?token=${encodeURIComponent(webhookToken)}`;
}
