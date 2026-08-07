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

export function getRuntimeConfig() {
  return window.AGI_FUND_INTEL_CONFIG || window.HACKER_DOJO_CONFIG || window.__HD_CONFIG__ || {};
}

/** Canonical workspace return URLs (path-prefixed production + local). */
export function workspaceRedirectUrl() {
  const { origin, pathname, href } = window.location;
  // Prefer the path the user is already on (clean URL or .html).
  if (pathname.includes('workspace')) {
    return `${origin}${pathname}`;
  }
  return href.split('#')[0].split('?')[0];
}

export function createWorkspaceClient() {
  const config = getRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Workspace is not configured with public Supabase values.');
  }
  // Magic-link / invite verify redirects use implicit hash tokens
  // (#access_token=…&refresh_token=…). PKCE-only clients ignore that hash and
  // leave the operator on the "send another link" form.
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit'
    }
  });
}

export async function requireWorkspaceSession() {
  if (cached?.session && cached?.profile && cached?.supabase && cached?.context) {
    return cached;
  }

  const supabase = createWorkspaceClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    throw new Error('Authentication required.');
  }

  const { data: context, error: contextError } = await supabase.rpc('get_workspace_context');
  if (contextError) throw contextError;
  const profile = context?.profile;
  if (!profile?.active) throw new Error('Active A.G.I. profile required.');

  const clients = Array.isArray(context.clients) ? context.clients : [];
  const preferredClientId = localStorage.getItem(CLIENT_STORAGE_KEY);
  const selectedClient = clients.find(client => client.id === preferredClientId)
    || clients.find(client => client.role)
    || clients[0]
    || null;
  const role = selectedClient?.role || null;

  if ((PRIVILEGED_ROLES.has(role) || context.is_master_admin) && !profile.mfa_enforced) {
    throw new Error('Enforced MFA is required for privileged roles.');
  }

  if (selectedClient) localStorage.setItem(CLIENT_STORAGE_KEY, selectedClient.id);

  cached = {
    supabase,
    session: sessionData.session,
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
  if (!cached?.clients?.some(client => client.id === clientId)) {
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
    // Impact Relay host screens
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
