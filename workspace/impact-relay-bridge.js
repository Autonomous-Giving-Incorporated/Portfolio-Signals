/**
 * Bridge: Supabase session + campaign profile → Impact Relay console API headers.
 * See docs/IMPACT-RELAY.md
 */

import {
  createWorkspaceClient,
  getRuntimeConfig,
  clearWorkspaceSessionCache
} from './session.js';

/** Display-only role map. Production authority comes from the signed JWT. */
export const CAMPAIGN_TO_IMPACT_ROLES = {
  director: ['tenant_admin', 'finance_approver'],
  campaign_lead: ['finance_approver', 'finance_reviewer'],
  development: ['finance_approver', 'finance_reviewer'],
  data_steward: ['finance_reviewer'],
  auditor: ['auditor'],
  board_viewer: ['auditor']
};

export const FINANCE_IMPACT_ROLES = new Set([
  'director',
  'campaign_lead',
  'development'
]);

export const DONOR_STAFF_ROLES = new Set([
  'director',
  'campaign_lead',
  'development',
  'data_steward',
  'auditor',
  'board_viewer'
]);

/** Same privileged set as workspace.js — MFA enforced when Supabase profile is used. */
export const PRIVILEGED_ROLES = new Set([
  'director',
  'campaign_lead',
  'development',
  'data_steward',
  'auditor'
]);

export function impactRelayApiBase() {
  const cfg = getRuntimeConfig();
  const fromCfg = cfg.impactRelayApiBase;
  const fromStore = localStorage.getItem('IMPACT_RELAY_API');
  const fromInput = document.getElementById('apiBase')?.value?.trim();
  return (fromInput || fromStore || fromCfg || 'http://127.0.0.1:8787').replace(/\/$/, '');
}

/**
 * Build fetch headers for Impact Relay after Supabase auth.
 * Falls back to fixture pilot email when no session (local file open).
 */
export function impactRelayHeaders({ accessToken, fixtureFallback = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }
  if (fixtureFallback) {
    const pilot = 'finance.approver@hackersdojo.example';
    headers['Authorization'] = `Bearer ${pilot}`;
    return headers;
  }
  throw new Error('Not authenticated for Impact Relay');
}

export async function loadImpactRelaySession({ requireFinance = false, requireStaff = false } = {}) {
  const cfg = getRuntimeConfig();
  const hasSupabase = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);

  if (!hasSupabase) {
    return {
      mode: 'fixture',
      email: 'finance.approver@hackersdojo.example',
      role: 'campaign_lead',
      profile: null,
      session: null,
      headers: impactRelayHeaders({ fixtureFallback: true })
    };
  }

  const supabase = createWorkspaceClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) {
    return { mode: 'unauthenticated', headers: null, supabase };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,display_name,role,mfa_enforced,active')
    .eq('id', sessionData.session.user.id)
    .single();
  if (profileError) throw profileError;
  if (!profile?.active) throw new Error('Active campaign profile required.');

  if (PRIVILEGED_ROLES.has(profile.role) && !profile.mfa_enforced) {
    const err = new Error(
      'Enforced MFA is required for privileged roles before using Impact Relay screens.'
    );
    err.code = 'MFA_REQUIRED';
    throw err;
  }

  if (requireFinance && !FINANCE_IMPACT_ROLES.has(profile.role)) {
    throw new Error(`Role ${profile.role} cannot approve Impact Relay expenses.`);
  }
  if (requireStaff && !DONOR_STAFF_ROLES.has(profile.role)) {
    throw new Error(`Role ${profile.role} cannot open staff donor views.`);
  }

  const email = sessionData.session.user.email || profile.display_name;
  return {
    mode: 'supabase',
    email,
    role: profile.role,
    profile,
    session: sessionData.session,
    supabase,
    headers: impactRelayHeaders({
      accessToken: sessionData.session.access_token,
      fixtureFallback: false
    })
  };
}

export async function impactRelayFetch(path, { method = 'GET', body, requireFinance, requireStaff } = {}) {
  const ctx = await loadImpactRelaySession({ requireFinance, requireStaff });
  if (ctx.mode === 'unauthenticated') {
    const err = new Error('Authentication required');
    err.code = 'UNAUTHENTICATED';
    throw err;
  }
  const res = await fetch(`${impactRelayApiBase()}${path}`, {
    method,
    headers: ctx.headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.ok !== true) {
    const err = new Error(data.message || data.error || res.statusText);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return { data, ctx };
}

export { clearWorkspaceSessionCache, createWorkspaceClient };
