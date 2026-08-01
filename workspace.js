import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const config = window.HACKER_DOJO_CONFIG || window.__HD_CONFIG__ || {};
const root = document.getElementById('workspaceRoot');
const gate = document.getElementById('authGate');
const workspace = document.getElementById('workspace');
const message = document.getElementById('authMessage');

const PRIVILEGED_ROLES = new Set([
  'director',
  'campaign_lead',
  'development',
  'data_steward',
  'auditor'
]);

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  message.textContent = 'Workspace is not configured. Set runtime public Supabase values without committing server secrets.';
  document.getElementById('loginForm').querySelector('button').disabled = true;
} else {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, detectSessionInUrl: true }
  });

  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}${location.pathname}` }
    });
    message.textContent = error
      ? error.message
      : 'Check your email for the secure sign-in link.';
  });

  document.getElementById('signOut').addEventListener('click', () => supabase.auth.signOut());
  supabase.auth.onAuthStateChange((_event, session) => renderSession(supabase, session));
  supabase.auth.getSession().then(({ data }) => renderSession(supabase, data.session));
}

async function renderSession(supabase, session) {
  if (!session) {
    gate.hidden = false;
    workspace.hidden = true;
    return;
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('display_name,role,mfa_enforced,active')
    .eq('id', session.user.id)
    .single();

  const mfaRequired = profile && PRIVILEGED_ROLES.has(profile.role);
  if (error || !profile?.active || (mfaRequired && !profile.mfa_enforced)) {
    gate.hidden = false;
    workspace.hidden = true;
    message.textContent = mfaRequired
      ? 'Access blocked: active profile and enforced MFA are required for privileged roles.'
      : 'Access blocked: an active campaign profile is required.';
    return;
  }

  gate.hidden = true;
  workspace.hidden = false;
  document.getElementById('identityLine').textContent =
    `${profile.display_name || session.user.email} · ${profile.role}`;
  renderNavigation(profile.role);
  await loadDashboard(supabase, profile.role);
}

function renderNavigation(role) {
  const permissions = {
    director: ['Decisions', 'Opportunities', 'Claims', 'Imports', 'Audit'],
    campaign_lead: ['Decisions', 'Opportunities', 'Claims', 'Imports'],
    development: ['Opportunities', 'Claims'],
    data_steward: ['Claims', 'Imports', 'Audit'],
    auditor: ['Claims', 'Audit'],
    board_viewer: ['Decisions', 'Opportunities']
  };
  document.getElementById('roleNav').innerHTML = (permissions[role] || [])
    .map(label => `<button class="workspace-nav-button" type="button">${label}</button>`)
    .join('');
}

async function loadDashboard(supabase, role) {
  const canReadConstituents = [
    'director',
    'campaign_lead',
    'development',
    'data_steward',
    'auditor'
  ].includes(role);

  const [decisions, opportunities, confirmedConsent, exceptions] = await Promise.all([
    supabase.from('decisions').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('opportunities').select('*', { count: 'exact', head: true })
      .in('stage', ['qualified', 'meeting', 'proposal', 'verbal']),
    canReadConstituents
      ? supabase.from('constituents').select('*', { count: 'exact', head: true })
          .eq('consent_status', 'confirmed')
      : Promise.resolve({ count: 0 }),
    supabase.from('import_exceptions').select('*', { count: 'exact', head: true })
      .is('resolved_at', null)
  ]);

  document.getElementById('decisionCount').textContent = decisions.count ?? 0;
  document.getElementById('opportunityCount').textContent = opportunities.count ?? 0;
  document.getElementById('authorizedCount').textContent = confirmedConsent.count ?? 0;
  document.getElementById('exceptionCount').textContent = exceptions.count ?? 0;
  document.getElementById('workspaceContent').innerHTML = `
    <h2>Workspace foundation active</h2>
    <p>All data access is mediated by Supabase authentication and row-level security.
    Confirmed-consent counts are not outreach authorization. Editing modules remain gated
    behind production environment hardening and leadership approvals.</p>
  `;
}

// Silence unused root warning in static analysis environments.
void root;
