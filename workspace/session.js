import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const PRIVILEGED_ROLES = new Set([
  'director',
  'campaign_lead',
  'development',
  'data_steward',
  'auditor'
]);

const CLIENT_STORAGE_KEY = 'agi.activeClientId';

let cached = null;
let sharedClient = null;
let authReady = null;

export function getRuntimeConfig() {
  return window.AGI_FUND_INTEL_CONFIG || window.HACKER_DOJO_CONFIG || window.__HD_CONFIG__ || {};
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
 * localStorage slot. Creating a new client on every call races init and looks
 * like a sign-out on refresh.
 */
export function createWorkspaceClient() {
  if (sharedClient) return sharedClient;

  const config = getRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Workspace is not configured with public Supabase values.');
  }

  // Magic-link verify redirects use #access_token=…&refresh_token=… (implicit).
  sharedClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
      storage: window.localStorage
    }
  });
  return sharedClient;
}

/** Wait until supabase-js has finished reading storage / URL for a session. */
export async function waitForAuthReady(client = createWorkspaceClient()) {
  if (!authReady) {
    // getSession() resolves after internal initialize() in supabase-js v2.
    authReady = client.auth.getSession().then((result) => result).catch((error) => {
      authReady = null;
      throw error;
    });
  }
  return authReady;
}

export async function getRecoveredSession(client = createWorkspaceClient()) {
  await waitForAuthReady(client);
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data.session) return data.session;

  // Secondary recovery: some browsers delay storage hydration.
  await new Promise((r) => setTimeout(r, 50));
  const again = await client.auth.getSession();
  if (again.error) throw again.error;
  return again.data.session;
}

export async function requireWorkspaceSession() {
  if (cached?.session && cached?.profile && cached?.supabase && cached?.context) {
    return cached;
  }

  const supabase = createWorkspaceClient();
  const session = await getRecoveredSession(supabase);
  if (!session) {
    throw new Error('Authentication required.');
  }

  const { data: context, error: contextError } = await supabase.rpc('get_workspace_context');
  if (contextError) throw contextError;
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
