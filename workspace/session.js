import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const PRIVILEGED_ROLES = new Set([
  'director',
  'campaign_lead',
  'development',
  'data_steward',
  'auditor',
  'infrastructure_delegate'
]);

const CLIENT_STORAGE_KEY = 'agi.activeClientId';

let cached = null;
let sharedClient = null;

export function getRuntimeConfig() {
  return window.AGI_PORTFOLIO_SIGNALS_CONFIG || window.AGI_FUND_INTEL_CONFIG || window.HACKER_DOJO_CONFIG || window.__HD_CONFIG__ || {};
}

/** Canonical workspace return URLs (path-prefixed production + local). */
export function workspaceRedirectUrl() {
  const { origin, pathname, href } = window.location;
  if (pathname.includes('workspace')) {
    return `${origin}${pathname}`;
  }
  return href.split('#')[0].split('?')[0];
}

/**
 * Single shared browser client so setSession / refresh / getSession share one
 * localStorage slot.
 */
export function createWorkspaceClient() {
  if (sharedClient) return sharedClient;

  const config = getRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Workspace is not configured with public Supabase values.');
  }

  // Magic-link verify redirects use #access_token=…&refresh_token=… (implicit).
  // detectSessionInUrl OFF: we parse the hash ourselves to avoid init races.
  sharedClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'implicit',
      storage: window.localStorage
    }
  });
  return sharedClient;
}

export async function getRecoveredSession(client = createWorkspaceClient()) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session;

  await new Promise((r) => setTimeout(r, 75));
  const again = await client.auth.getSession();
  if (again.error) throw again.error;
  return again.data.session;
}

/**
 * Fetch workspace context with the session JWT via plain fetch.
 * Avoids supabase-js auth-lock issues that can hang .rpc() after setSession.
 */
async function fetchWorkspaceContext(session) {
  const config = getRuntimeConfig();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Authentication required.');
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Workspace is not configured with public Supabase values.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/get_workspace_context`, {
      method: 'POST',
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: '{}',
      signal: controller.signal
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Workspace context invalid response (${response.status})`);
    }
    if (!response.ok) {
      const msg =
        payload?.message ||
        payload?.error_description ||
        payload?.error ||
        `Workspace context failed (${response.status})`;
      throw new Error(msg);
    }
    // PostgREST may return the jsonb value directly or wrapped.
    if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.profile) {
      return payload;
    }
    if (Array.isArray(payload) && payload[0]?.profile) return payload[0];
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch {
        /* fall through */
      }
    }
    throw new Error('Workspace context missing profile');
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Workspace authorization timed out contacting Supabase');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {import('@supabase/supabase-js').Session | null | undefined} knownSession
 */
export async function requireWorkspaceSession(knownSession = null) {
  if (cached?.session && cached?.profile && cached?.supabase && cached?.context) {
    return cached;
  }

  const supabase = createWorkspaceClient();
  const session = knownSession || (await getRecoveredSession(supabase));
  if (!session?.access_token) {
    throw new Error('Authentication required.');
  }

  // Context uses the JWT directly (no supabase.rpc lock). Later panel queries
  // use the shared client, which should already hold this session after setSession
  // in settleAuthFromUrl or localStorage recovery.

  const context = await fetchWorkspaceContext(session);
  const profile = context?.profile;
  if (!profile?.active) throw new Error('Active A.G.I. profile required.');

  const clients = Array.isArray(context.clients) ? context.clients : [];
  const preferredClientId = localStorage.getItem(CLIENT_STORAGE_KEY);
  const selectedClient =
    clients.find((client) => client.id === preferredClientId) ||
    clients.find((client) => client.role) ||
    clients[0] ||
    null;
  const role = selectedClient?.role || null;

  if ((PRIVILEGED_ROLES.has(role) || context.is_master_admin) && !profile.mfa_enforced) {
    throw new Error('Enforced MFA is required for privileged roles.');
  }

  if (selectedClient) localStorage.setItem(CLIENT_STORAGE_KEY, selectedClient.id);

  cached = {
    supabase,
    session,
    profile: { ...profile, role },
    context,
    clients,
    selectedClient,
    isMasterAdmin: Boolean(context.is_master_admin)
  };
  return cached;
}

export function clearWorkspaceSessionCache() {
  cached = null;
}

export function selectWorkspaceClient(clientId) {
  if (!cached?.clients?.some((client) => client.id === clientId)) {
    throw new Error('Selected client is not available to this account.');
  }
  localStorage.setItem(CLIENT_STORAGE_KEY, clientId);
  cached = null;
}

export function roleCan(role, capability) {
  const matrix = {
    decisions: ['director', 'campaign_lead', 'board_viewer'],
    decisions_write: ['director', 'campaign_lead'],
    opportunities: ['director', 'campaign_lead', 'development', 'board_viewer', 'auditor'],
    opportunities_write: ['director', 'campaign_lead', 'development'],
    claims: ['director', 'campaign_lead', 'development', 'data_steward', 'auditor'],
    imports: ['director', 'campaign_lead', 'data_steward'],
    imports_act: ['director', 'data_steward'],
    audit: ['director', 'data_steward', 'auditor'],
    client_admin: ['director'],
    brand_configuration: ['director'],
    onboarding_pack: ['director'],
    infrastructure_access: ['infrastructure_delegate'],
    impact_finance: ['director', 'campaign_lead', 'development'],
    impact_donor_staff: [
      'director',
      'campaign_lead',
      'development',
      'data_steward',
      'auditor',
      'board_viewer'
    ]
  };
  return (matrix[capability] || []).includes(role);
}

// Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: 622346cc565b1d6c7ebfc75eb7590b8dd03af601
