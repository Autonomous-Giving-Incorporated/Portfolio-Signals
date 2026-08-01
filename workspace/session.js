import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const PRIVILEGED_ROLES = new Set([
  'director',
  'campaign_lead',
  'development',
  'data_steward',
  'auditor'
]);

let cached = null;

export function getRuntimeConfig() {
  return window.HACKER_DOJO_CONFIG || window.__HD_CONFIG__ || {};
}

export function createWorkspaceClient() {
  const config = getRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Workspace is not configured with public Supabase values.');
  }
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, detectSessionInUrl: true }
  });
}

export async function requireWorkspaceSession() {
  if (cached?.session && cached?.profile && cached?.supabase) {
    return cached;
  }

  const supabase = createWorkspaceClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    throw new Error('Authentication required.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,display_name,role,mfa_enforced,active')
    .eq('id', sessionData.session.user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile?.active) throw new Error('Active campaign profile required.');

  if (PRIVILEGED_ROLES.has(profile.role) && !profile.mfa_enforced) {
    throw new Error('Enforced MFA is required for privileged roles.');
  }

  cached = {
    supabase,
    session: sessionData.session,
    profile
  };
  return cached;
}

export function clearWorkspaceSessionCache() {
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
    audit: ['director', 'data_steward', 'auditor']
  };
  return (matrix[capability] || []).includes(role);
}
