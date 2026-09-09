export const ONBOARDING_INTENT_KEY = 'agi.onboardingIntent';
export const ONBOARDING_INTENT_TTL_MS = 30 * 60 * 1000;

const TENANT_ID = /^org_[a-z0-9_]{1,124}$/;

export function parseOnboardingIntent(href) {
  const url = new URL(href, 'https://autogive.app');
  const onboarding = url.searchParams.getAll('onboarding');
  const tenants = url.searchParams.getAll('tenant');
  if (onboarding.length !== 1 || onboarding[0] !== 'impact-relay') return null;
  const invalidTenantHint = tenants.length > 1 || (tenants.length === 1 && !TENANT_ID.test(tenants[0]));
  const tenantHint = tenants.length === 1 && !invalidTenantHint ? tenants[0] : null;
  return invalidTenantHint
    ? { source: 'impact-relay', tenantHint: null, invalidTenantHint: true }
    : { source: 'impact-relay', tenantHint };
}

export function captureOnboardingIntent(href, storage, now = Date.now()) {
  const intent = parseOnboardingIntent(href);
  if (!intent) return null;
  try {
    if (storage === undefined) storage = globalThis.sessionStorage;
    storage?.setItem(ONBOARDING_INTENT_KEY, JSON.stringify({
      intent,
      userId: null,
      expiresAt: now + ONBOARDING_INTENT_TTL_MS
    }));
  } catch {
    // Navigation still works in-memory when storage is disabled or full.
  }
  return intent;
}

function validPersistedIntent(value) {
  const intent = value?.intent;
  if (value === null || typeof value !== 'object' || !Number.isFinite(value.expiresAt)) return null;
  if (intent?.source !== 'impact-relay') return null;
  if (value.userId !== null && typeof value.userId !== 'string') return null;
  const restored = value.userId ? { ...intent, userId: value.userId } : intent;
  if (intent.invalidTenantHint === true) {
    return intent.tenantHint === null ? restored : null;
  }
  if (intent.invalidTenantHint !== undefined) return null;
  return intent.tenantHint === null || TENANT_ID.test(intent.tenantHint)
    ? restored
    : null;
}

export function readOnboardingIntent(storage, now = Date.now()) {
  try {
    if (storage === undefined) storage = globalThis.sessionStorage;
    const value = JSON.parse(storage?.getItem(ONBOARDING_INTENT_KEY) || 'null');
    const intent = validPersistedIntent(value);
    if (!intent || value.expiresAt <= now) {
      clearOnboardingIntent(storage);
      return null;
    }
    return intent;
  } catch {
    clearOnboardingIntent(storage);
    return null;
  }
}

export function clearOnboardingIntent(storage) {
  try {
    if (storage === undefined) storage = globalThis.sessionStorage;
    storage?.removeItem(ONBOARDING_INTENT_KEY);
  } catch {
    // Storage cleanup is best-effort.
  }
}

export function onboardingIntentSearch(intent) {
  if (intent?.source !== 'impact-relay' || intent.invalidTenantHint) return '';
  if (intent.tenantHint !== null && !TENANT_ID.test(intent.tenantHint)) return '';
  return `?onboarding=impact-relay${intent.tenantHint ? `&tenant=${encodeURIComponent(intent.tenantHint)}` : ''}`;
}

export function bindOnboardingIntentToUser(intent, userId, storage) {
  if (!intent || !userId) return intent;
  if (intent.userId && intent.userId !== userId) {
    clearOnboardingIntent(storage);
    return null;
  }
  const bound = { ...intent, userId };
  try {
    if (storage === undefined) storage = globalThis.sessionStorage;
    const value = JSON.parse(storage?.getItem(ONBOARDING_INTENT_KEY) || 'null');
    if (value?.intent) storage.setItem(ONBOARDING_INTENT_KEY, JSON.stringify({ ...value, userId }));
  } catch {
    // The in-memory binding still prevents cross-user replay in this page.
  }
  return bound;
}

export function resolveOnboardingIntent(intent, clients = []) {
  if (intent?.source !== 'impact-relay' || intent.invalidTenantHint) return { available: false, client: null };
  if (!intent.tenantHint) return { available: true, client: null };
  const client = clients.find(item => item?.id === intent.tenantHint) || null;
  return { available: Boolean(client), client };
}
