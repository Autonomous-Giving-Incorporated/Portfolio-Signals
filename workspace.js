import {
  createWorkspaceClient,
  clearWorkspaceSessionCache,
  requireWorkspaceSession,
  roleCan,
  selectWorkspaceClient,
  workspaceRedirectUrl,
  getRecoveredSession
} from './workspace/session.js';
import { mountDecisionQueue } from './workspace/decisions.js';
import { mountPipelineWorkspace } from './workspace/pipelines.js';
import { mountBrandConfiguration } from './workspace/configuration.js';

const root = document.getElementById('workspaceRoot');
const gate = document.getElementById('authGate');
const workspace = document.getElementById('workspace');
const message = document.getElementById('authMessage');
const content = document.getElementById('workspaceContent');

const PRIVILEGED_ROLES = new Set([
  'director',
  'campaign_lead',
  'development',
  'data_steward',
  'auditor',
  'infrastructure_delegate'
]);

let activeClient = null;
let activeProfile = null;
let selectedClient = null;
let isMasterAdmin = false;
let enabledModules = { sponsors: false, grants: false };
let renderGeneration = 0;
let lastSessionUserId = null;
let renderInFlight = null;
let pendingDelegateInvitationId = new URL(window.location.href).searchParams.get('delegate_invitation');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function showMessage(text) {
  if (message) message.textContent = text;
}

function setBusy(isBusy) {
  content?.setAttribute('aria-busy', isBusy ? 'true' : 'false');
}

function cleanAuthUrl() {
  // Drop auth hash/query so reloads don't re-process one-time tokens.
  history.replaceState({}, '', window.location.pathname);
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * Consume auth redirect payloads before session reads.
 * Supabase email/admin magic links redirect as:
 *   /workspace#access_token=…&refresh_token=…&type=magiclink
 */
async function settleAuthFromUrl(client) {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(
    url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  );

  const hashError = hashParams.get('error') || hashParams.get('error_code');
  if (hashError) {
    const detail =
      hashParams.get('error_description') ||
      hashParams.get('error_code') ||
      hashParams.get('error') ||
      'sign-in link invalid';
    showMessage(
      `Sign-in link failed: ${decodeURIComponent(detail.replace(/\+/g, ' '))}. Request a new link.`
    );
    cleanAuthUrl();
    return null;
  }

  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const otpType = url.searchParams.get('type') || hashParams.get('type');
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  const hasAuthPayload = Boolean(code || tokenHash || accessToken || refreshToken);
  if (!hasAuthPayload) {
    return getRecoveredSession(client);
  }

  showMessage('Completing secure sign-in…');

  try {
    if (code) {
      const { data, error } = await withTimeout(
        client.auth.exchangeCodeForSession(code),
        12000,
        'Code exchange'
      );
      if (error) throw error;
      cleanAuthUrl();
      showMessage('');
      return data.session;
    }

    if (tokenHash && otpType) {
      const { data, error } = await withTimeout(
        client.auth.verifyOtp({ token_hash: tokenHash, type: otpType }),
        12000,
        'OTP verify'
      );
      if (error) throw error;
      cleanAuthUrl();
      showMessage('');
      return data.session;
    }

    if (accessToken && refreshToken) {
      // Strip hash BEFORE setSession so a re-entry cannot re-process tokens,
      // and so detect/init never re-reads the same fragment.
      cleanAuthUrl();
      const { data, error } = await withTimeout(
        client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        }),
        12000,
        'Session establish'
      );
      if (error) throw error;
      showMessage('');
      return data.session;
    }

    showMessage('Sign-in link incomplete. Request a new link.');
    cleanAuthUrl();
    return null;
  } catch (error) {
    showMessage(`Sign-in link failed: ${error.message}. Request a new link.`);
    cleanAuthUrl();
    return null;
  }
}

if (!document.getElementById('loginForm')) {
  // Loaded outside the workspace shell.
} else {
  try {
    activeClient = createWorkspaceClient();
  } catch {
    showMessage('Workspace is not configured. Set runtime public Supabase values without committing server secrets.');
    document.getElementById('loginForm').querySelector('button').disabled = true;
  }
}

if (activeClient) {
  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value.trim();
    const redirectTo = workspaceRedirectUrl();
    const { error } = await activeClient.functions.invoke('auth-email', {
      body: { action: 'self_sign_in', email, redirect_to: redirectTo }
    });
    showMessage(
      error
        ? 'Unable to request a sign-in link right now. Try again shortly.'
        : `If this email is eligible, a secure sign-in link is on its way. Return to this exact page (${redirectTo}).`
    );
  });

  document.getElementById('signOut').addEventListener('click', async () => {
    clearWorkspaceSessionCache();
    await activeClient.auth.signOut();
  });

  // CRITICAL: never await auth APIs inside onAuthStateChange — supabase-js
  // holds a lock during setSession and deadlocks if listeners call getSession.
  // Defer UI work off the auth callback stack.
  activeClient.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
    if (event === 'INITIAL_SESSION' && !session) return;
    if (!session && event !== 'SIGNED_OUT') return;
    const allowNull = event === 'SIGNED_OUT';
    setTimeout(() => {
      scheduleRender(session, { allowNull }).catch((error) => showMessage(error.message));
    }, 0);
  });

  // Boot: hash tokens first, then localStorage (refresh path).
  settleAuthFromUrl(activeClient)
    .then(async (session) => {
      if (session) return scheduleRender(session, { allowNull: false });
      const recovered = await getRecoveredSession(activeClient);
      return scheduleRender(recovered, { allowNull: true });
    })
    .catch((error) => showMessage(error.message));
}

async function scheduleRender(session, { allowNull = false } = {}) {
  const run = async () => renderSession(session, { allowNull });
  renderInFlight = (renderInFlight || Promise.resolve()).then(run, run);
  return renderInFlight;
}

async function renderSession(session, { allowNull = false } = {}) {
  if (!session) {
    if (!allowNull && lastSessionUserId) return;
    lastSessionUserId = null;
    gate.hidden = false;
    workspace.hidden = true;
    activeProfile = null;
    clearWorkspaceSessionCache();
    return;
  }

  const userId = session.user?.id || null;
  if (userId && userId === lastSessionUserId && !workspace.hidden && activeProfile) {
    showMessage('');
    return;
  }

  const generation = ++renderGeneration;
  clearWorkspaceSessionCache();
  let workspaceSession;
  try {
    showMessage('Loading workspace…');
    if (pendingDelegateInvitationId) {
      const { error: acceptanceError } = await activeClient.rpc('accept_delegate_invitation', {
        p_invitation_id: pendingDelegateInvitationId
      });
      if (acceptanceError) throw acceptanceError;
      pendingDelegateInvitationId = null;
      cleanAuthUrl();
      showMessage('Delegate invitation accepted. Loading assigned access.');
    }
    // Pass the known session; context fetch uses raw JWT (no supabase-js lock).
    workspaceSession = await requireWorkspaceSession(session);
  } catch (error) {
    if (generation !== renderGeneration) return;
    gate.hidden = false;
    workspace.hidden = true;
    showMessage(`Access blocked: ${error.message}`);
    return;
  }
  if (generation !== renderGeneration) return;

  const { profile, clients, selectedClient: currentClient, isMasterAdmin: masterAdmin } = workspaceSession;
  const mfaRequired = PRIVILEGED_ROLES.has(profile.role) || masterAdmin;
  if (mfaRequired && !profile.mfa_enforced) throw new Error('Enforced MFA is required.');
  activeProfile = profile;
  selectedClient = currentClient;
  isMasterAdmin = masterAdmin;
  if (currentClient?.id) {
    const { data: publishedConfig, error: configError } = await activeClient.from('client_config_versions').select('config').eq('client_id', currentClient.id).eq('state', 'published').maybeSingle();
    if (configError) throw configError;
    enabledModules = { sponsors: publishedConfig?.config?.modules?.sponsors !== false, grants: publishedConfig?.config?.modules?.grants !== false };
  }
  if (generation !== renderGeneration) return;

  gate.hidden = true;
  workspace.hidden = false;
  lastSessionUserId = userId;
  showMessage('');
  const roleLabel = profile.role || selectedClient?.role || (masterAdmin ? 'platform administration' : 'member');
  document.getElementById('identityLine').textContent =
    `${profile.display_name || session.user.email} · ${roleLabel}`;
  updateAuthenticatedTenantChrome(currentClient);
  renderClientSelector(clients, currentClient);
  renderNavigation(profile.role || selectedClient?.role);
  await loadDashboard(profile.role || selectedClient?.role);
}

/** Tenant label/chip only after sign-in (never on public pages or auth gate). */
function updateAuthenticatedTenantChrome(client) {
  const name = client?.display_name || 'No client selected';
  document.querySelectorAll('#workspace [data-tenant-name]').forEach((node) => {
    node.textContent = name;
  });
  document.querySelectorAll('#workspace .tenant-chip').forEach((node) => {
    node.hidden = false;
    node.removeAttribute('aria-hidden');
    node.setAttribute('aria-label', `Tenant: ${name}`);
  });
  document.title = client?.display_name
    ? `AGI Portfolio Signals · ${client.display_name}`
    : 'AGI Portfolio Signals · Workspace';
}

function renderClientSelector(clients, currentClient) {
  const select = document.getElementById('clientSelector');
  select.innerHTML = clients.map(client => `
    <option value="${escapeHtml(client.id)}" ${client.id === currentClient?.id ? 'selected' : ''}>
      ${escapeHtml(client.display_name)}${client.role ? ` · ${escapeHtml(client.role)}` : ' · platform view'}
    </option>`).join('');
  select.disabled = clients.length < 2;
  select.onchange = () => {
    selectWorkspaceClient(select.value);
    location.reload();
  };
  document.getElementById('clientContext').textContent = currentClient
    ? `${currentClient.display_name} · ${currentClient.state}`
    : 'No client membership assigned';
}

function renderNavigation(role) {
  const items = [];
  if (isMasterAdmin) items.push({ id: 'platform_admin', label: 'Platform admin' });
  if (roleCan(role, 'infrastructure_access')) {
    items.push({ id: 'infrastructure_access', label: 'Infrastructure access' });
  }
  if (roleCan(role, 'client_admin')) items.push({ id: 'client_admin', label: 'Client admin' });
  if (roleCan(role, 'brand_configuration')) items.push({ id: 'brand_configuration', label: 'Brand & content' });
  if (roleCan(role, 'onboarding_pack') || isMasterAdmin) {
    items.push({ id: 'onboarding_pack', label: 'Onboarding pack' });
  }
  if (roleCan(role, 'decisions')) items.push({ id: 'decisions', label: 'Decisions' });
  if (roleCan(role, 'opportunities')) {
    if (enabledModules.sponsors) items.push({ id: 'sponsors', label: 'Sponsors' });
    if (enabledModules.grants) items.push({ id: 'grants', label: 'Grants' });
  }
  if (roleCan(role, 'claims')) items.push({ id: 'claims', label: 'Claims' });
  if (roleCan(role, 'imports')) items.push({ id: 'imports', label: 'Imports' });
  if (roleCan(role, 'audit')) items.push({ id: 'audit', label: 'Audit' });
  if (roleCan(role, 'impact_finance')) {
    items.push({ id: 'impact_finance', label: 'Impact finance' });
  }
  if (roleCan(role, 'impact_donor_staff')) {
    items.push({ id: 'impact_donor', label: 'Impact donors' });
  }

  const nav = document.getElementById('roleNav');
  const previousSection = nav.querySelector('.workspace-nav-button.is-active')?.dataset.section;
  nav.innerHTML = items.map(item => `
    <button class="workspace-nav-button" type="button" data-section="${item.id}">
      ${item.label}
    </button>`).join('');

  nav.querySelectorAll('button[data-section]').forEach(button => {
    button.addEventListener('click', () => {
      nav.querySelectorAll('button').forEach(node => node.classList.remove('is-active'));
      button.classList.add('is-active');
      openSection(button.dataset.section).catch(error => {
        content.innerHTML = `<p class="note error">${error.message}</p>`;
      });
    });
  });

  // Restore prior section or open first once — do not re-click on every auth event.
  const preferred =
    nav.querySelector(`[data-section="${previousSection}"]`) ||
    nav.querySelector('.workspace-nav-button');
  if (preferred && !preferred.classList.contains('is-active')) {
    preferred.classList.add('is-active');
  }
}

async function loadDashboard(role) {
  if (role === 'infrastructure_delegate') {
    return mountInfrastructureAccess();
  }
  if (!selectedClient?.role) {
    document.getElementById('decisionCount').textContent = '—';
    document.getElementById('opportunityCount').textContent = '—';
    document.getElementById('authorizedCount').textContent = '—';
    document.getElementById('exceptionCount').textContent = '—';
    content.innerHTML = `<h2>Platform administration</h2><p>Select Platform admin to provision clients. Platform authority does not grant access to client-private campaign records.</p>`;
    return;
  }
  const canReadConstituents = [
    'director',
    'campaign_lead',
    'development',
    'data_steward',
    'auditor'
  ].includes(role);

  const [decisions, opportunities, confirmedConsent, exceptions] = await Promise.all([
    activeClient.from('decisions').select('*', { count: 'exact', head: true }).eq('client_id', selectedClient.id).eq('status', 'open'),
    activeClient.from('opportunities').select('*', { count: 'exact', head: true })
      .eq('client_id', selectedClient.id)
      .in('stage', ['qualified', 'meeting', 'proposal', 'verbal']),
    canReadConstituents
      ? activeClient.from('constituents').select('*', { count: 'exact', head: true })
          .eq('client_id', selectedClient.id)
          .eq('consent_status', 'confirmed')
      : Promise.resolve({ count: 0 }),
    activeClient.from('import_exceptions').select('*', { count: 'exact', head: true })
      .eq('client_id', selectedClient.id)
      .is('resolved_at', null)
  ]);

  document.getElementById('decisionCount').textContent = decisions.count ?? 0;
  document.getElementById('opportunityCount').textContent = opportunities.count ?? 0;
  document.getElementById('authorizedCount').textContent = confirmedConsent.count ?? 0;
  document.getElementById('exceptionCount').textContent = exceptions.count ?? 0;

  content.innerHTML = `
    <h2>Campaign operations home</h2>
    <p>
      Use the role navigation to open decisions, sponsor/grant pipelines, import review,
      claims, or audit views. All mutations run through authenticated Supabase sessions
      and row-level security. Confirmed consent is not outreach authorization.
    </p>
    <div class="control-grid">
      ${roleCan(role, 'decisions') ? '<button type="button" class="button secondary" data-jump="decisions">Open decisions</button>' : ''}
      ${roleCan(role, 'opportunities') && enabledModules.sponsors ? '<button type="button" class="button secondary" data-jump="sponsors">Open sponsor pipeline</button>' : ''}
      ${roleCan(role, 'opportunities') && enabledModules.grants ? '<button type="button" class="button secondary" data-jump="grants">Open grant pipeline</button>' : ''}
      ${roleCan(role, 'imports') ? '<button type="button" class="button secondary" data-jump="imports">Open imports</button>' : ''}
      ${roleCan(role, 'impact_finance') ? '<a class="button secondary" href="finance-impact.html">Impact finance queue</a>' : ''}
      ${roleCan(role, 'impact_donor_staff') ? '<a class="button secondary" href="donor-impact.html">Impact donor receipts</a>' : ''}
    </div>
    <p class="note">Impact Relay screens require the local console API (see docs/IMPACT-RELAY.md). Shadow mode: docs/IMPACT-RELAY-SHADOW.md.</p>`;

  content.querySelectorAll('button[data-jump]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelector(`.workspace-nav-button[data-section="${button.dataset.jump}"]`)?.click();
    });
  });
}

async function openSection(section) {
  if (!activeProfile) throw new Error('Authentication required.');
  setBusy(true);

  if (section === 'client_admin') {
    await mountClientAdmin();
  } else if (section === 'infrastructure_access') {
    await mountInfrastructureAccess();
  } else if (section === 'platform_admin') {
    await mountPlatformAdmin();
  } else if (section === 'brand_configuration') {
    await mountBrandConfiguration(content);
  } else if (section === 'onboarding_pack') {
    if (!selectedClient?.id) throw new Error('Select a client to open the onboarding pack.');
    const { mountOnboardingPack } = await import('./workspace/onboarding-pack.js');
    await mountOnboardingPack(content, {
      clientId: selectedClient.id,
      session: await requireWorkspaceSession(),
      isMasterAdmin
    });
  } else if (section === 'decisions') {
    await mountDecisionQueue(content);
  } else if (section === 'sponsors') {
    await mountPipelineWorkspace(content, 'sponsorship');
  } else if (section === 'grants') {
    await mountPipelineWorkspace(content, 'grant');
  } else if (section === 'impact_finance') {
    content.innerHTML = `
      <h2>Impact Relay finance</h2>
      <p class="note">L3 expense approval queue (opens dedicated page; requires console_server).</p>
      <p><a class="button" href="finance-impact.html">Open finance-impact.html</a></p>
      <p class="note">Docs: <a href="docs/IMPACT-RELAY.md">IMPACT-RELAY.md</a> · <a href="docs/IMPACT-RELAY-SHADOW.md">shadow mode</a></p>`;
  } else if (section === 'impact_donor') {
    content.innerHTML = `
      <h2>Impact Relay donors</h2>
      <p class="note">Staff view of fund timeline and use-of-funds receipts (no CRM export in git).</p>
      <p><a class="button" href="donor-impact.html">Open donor-impact.html</a></p>`;
  } else if (section === 'imports') {
    content.innerHTML = `
      <div class="workspace-toolbar">
        <div>
          <strong>Import quarantine</strong>
          <span>${roleCan(activeProfile.role, 'imports_act') ? 'approve / reject / promote available' : 'read-only access'}</span>
        </div>
      </div>
      <p>
        Open a specific batch with
        <code>import-review.html?batch=&lt;import_batch_id&gt;</code>.
        Actions execute <code>approve_import_row</code>, <code>reject_import_row</code>,
        and <code>promote_import_row</code> under live RLS.
      </p>
      <label>Batch id
        <input id="batchJump" type="text" placeholder="uuid" />
      </label>
      <button type="button" class="button" id="openBatch">Open import review</button>`;
    content.querySelector('#openBatch')?.addEventListener('click', () => {
      const batch = content.querySelector('#batchJump')?.value.trim();
      if (!batch) {
        alert('Enter an import batch id.');
        return;
      }
      location.assign(`import-review.html?batch=${encodeURIComponent(batch)}`);
    });
  } else if (section === 'claims') {
    const { data, error } = await activeClient
      .from('claims')
      .select('id,claim,state,verified_at,created_at')
      .eq('client_id', selectedClient.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    content.innerHTML = `
      <div class="workspace-toolbar"><div><strong>Claims registry</strong><span>${data.length} visible</span></div></div>
      <div class="table-wrap"><table class="workspace-table">
        <thead><tr><th>Claim</th><th>State</th><th>Verified</th></tr></thead>
        <tbody>
          ${data.map(row => `
            <tr>
              <td>${escapeHtml(row.claim)}</td>
              <td>${escapeHtml(row.state)}</td>
              <td>${escapeHtml(row.verified_at || '—')}</td>
            </tr>`).join('') || '<tr><td colspan="3">No claims visible.</td></tr>'}
        </tbody>
      </table></div>`;
  } else if (section === 'audit') {
    const { data, error } = await activeClient
      .from('audit_log')
      .select('id,action,entity_type,entity_id,occurred_at')
      .eq('client_id', selectedClient.id)
      .order('occurred_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    content.innerHTML = `
      <div class="workspace-toolbar"><div><strong>Audit log</strong><span>${data.length} recent events</span></div></div>
      <div class="table-wrap"><table class="workspace-table">
        <thead><tr><th>When</th><th>Action</th><th>Entity</th></tr></thead>
        <tbody>
          ${data.map(row => `
            <tr>
              <td>${row.occurred_at}</td>
              <td>${row.action}</td>
              <td>${row.entity_type}${row.entity_id ? `:${row.entity_id}` : ''}</td>
            </tr>`).join('') || '<tr><td colspan="3">No audit events visible.</td></tr>'}
        </tbody>
      </table></div>`;
  } else {
    content.innerHTML = '<p class="note">Unknown workspace section.</p>';
  }

  setBusy(false);
}

async function mountClientAdmin() {
  if (activeProfile.role !== 'director' || !selectedClient?.role) {
    throw new Error('Client director access required.');
  }
  const [memberships, delegations, invitations] = await Promise.all([
    activeClient.from('client_memberships')
      .select('user_id,role,active,membership_version,profiles(display_name)')
      .eq('client_id', selectedClient.id).order('role'),
    activeClient.from('infrastructure_delegations')
      .select('user_id,scopes,active,delegation_version')
      .eq('client_id', selectedClient.id),
    activeClient.from('client_delegate_invitations')
      .select('id,email,scopes,state,expires_at,send_count')
      .eq('client_id', selectedClient.id).eq('state', 'pending')
  ]);
  if (memberships.error) throw memberships.error;
  if (delegations.error) throw delegations.error;
  if (invitations.error) throw invitations.error;
  const delegationByUser = new Map(delegations.data.map(item => [item.user_id, item]));
  const data = memberships.data;

  content.innerHTML = `
    <div class="workspace-toolbar"><div><strong>Client administration</strong><span>${selectedClient.display_name}</span></div></div>
    <div class="table-wrap"><table class="workspace-table">
      <thead><tr><th>Member</th><th>Role / scope</th><th>State</th><th>Actions</th></tr></thead>
      <tbody>${data.map(member => {
        const delegation = delegationByUser.get(member.user_id);
        const scope = delegation?.scopes?.join(', ') || 'none';
        const actions = member.role === 'infrastructure_delegate' && member.active
          ? `<button class="button secondary" type="button" data-send-delegate="${escapeHtml(member.user_id)}">Send sign-in</button>
             <button class="button secondary" type="button" data-revoke-delegate="${escapeHtml(member.user_id)}">Revoke</button>`
          : 'none';
        return `<tr><td>${escapeHtml(member.profiles?.display_name || member.user_id)}<small>${escapeHtml(member.user_id)}</small></td><td>${escapeHtml(member.role)}<small>${escapeHtml(scope)}</small></td><td>${member.active ? 'active' : 'inactive'}</td><td>${actions}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    <h3>Invite infrastructure delegate</h3>
    <form id="delegateInviteForm" class="control-grid">
      <label>Email address<input name="email" type="email" autocomplete="off" required></label>
      <fieldset><legend>Approved infrastructure scope</legend>
        ${[
          ['workspace_access', 'Workspace access'],
          ['identity_support', 'Identity support'],
          ['integration_operations', 'Integration operations'],
          ['delivery_observability', 'Delivery observability'],
          ['configuration_support', 'Configuration support']
        ].map(([value, label]) => `<label><input name="scopes" type="checkbox" value="${value}" ${value === 'workspace_access' ? 'checked' : ''}> ${label}</label>`).join('')}
      </fieldset>
      <label>Invitation rationale<input name="rationale" required minlength="12" placeholder="Why this delegate needs access"></label>
      <button class="button" type="submit">Invite delegate</button>
    </form>
    ${invitations.data.length ? `<h4>Pending delegate invitations</h4><ul>${invitations.data.map(item => `<li>${escapeHtml(item.email)} &middot; ${escapeHtml(item.scopes.join(', '))} &middot; expires ${escapeHtml(item.expires_at)} <button class="button secondary" type="button" data-revoke-invitation="${escapeHtml(item.id)}">Revoke invitation</button></li>`).join('')}</ul>` : ''}
    <label>Delegate action rationale<input id="delegateActionRationale" minlength="12" placeholder="Reason for sign-in or revocation"></label>
    <h3>Manage existing member</h3>
    <form id="membershipForm" class="control-grid">
      <label>User UUID<input name="userId" required pattern="[0-9a-fA-F-]{36}" placeholder="Existing authenticated profile UUID"></label>
      <label>Client role<select name="role">${['director','campaign_lead','development','board_viewer','data_steward','auditor'].map(role => `<option>${role}</option>`).join('')}</select></label>
      <label>Status<select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></label>
      <label>Rationale<input name="rationale" required minlength="12" placeholder="Reason for membership change"></label>
      <button class="button" type="submit">Save membership</button>
    </form>
    <p class="note" id="adminMessage">Membership and delegate-email changes are audited. The final active director cannot be removed.</p>`;

  content.querySelector('#delegateInviteForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error: inviteError } = await activeClient.functions.invoke('auth-email', {
      body: {
        action: 'invite_delegate',
        client_id: selectedClient.id,
        email: form.get('email').trim(),
        scopes: form.getAll('scopes').map(String),
        rationale: form.get('rationale').trim(),
        redirect_to: workspaceRedirectUrl()
      }
    });
    if (inviteError) {
      content.querySelector('#adminMessage').textContent = inviteError.message;
      return;
    }
    await mountClientAdmin();
  });

  content.querySelectorAll('[data-send-delegate]').forEach(button => {
    button.addEventListener('click', async () => {
      const rationale = content.querySelector('#delegateActionRationale').value.trim();
      const { error: sendError } = await activeClient.functions.invoke('auth-email', {
        body: {
          action: 'resend_delegate_sign_in',
          client_id: selectedClient.id,
          user_id: button.dataset.sendDelegate,
          rationale,
          redirect_to: workspaceRedirectUrl()
        }
      });
      content.querySelector('#adminMessage').textContent = sendError
        ? sendError.message
        : 'Secure delegate sign-in email sent.';
    });
  });

  content.querySelectorAll('[data-revoke-delegate]').forEach(button => {
    button.addEventListener('click', async () => {
      const rationale = content.querySelector('#delegateActionRationale').value.trim();
      const { error: revokeError } = await activeClient.rpc('revoke_infrastructure_delegate', {
        p_client_id: selectedClient.id,
        p_user_id: button.dataset.revokeDelegate,
        p_rationale: rationale
      });
      if (revokeError) {
        content.querySelector('#adminMessage').textContent = revokeError.message;
        return;
      }
      clearWorkspaceSessionCache();
      await mountClientAdmin();
    });
  });

  content.querySelectorAll('[data-revoke-invitation]').forEach(button => {
    button.addEventListener('click', async () => {
      const rationale = content.querySelector('#delegateActionRationale').value.trim();
      const { error: revokeError } = await activeClient.rpc('revoke_delegate_invitation', {
        p_invitation_id: button.dataset.revokeInvitation,
        p_rationale: rationale
      });
      if (revokeError) {
        content.querySelector('#adminMessage').textContent = revokeError.message;
        return;
      }
      await mountClientAdmin();
    });
  });

  content.querySelector('#membershipForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error: mutationError } = await activeClient.rpc('set_client_membership', {
      p_client_id: selectedClient.id,
      p_user_id: form.get('userId').trim(),
      p_role: form.get('role'),
      p_active: form.get('active') === 'true',
      p_rationale: form.get('rationale').trim()
    });
    if (mutationError) {
      content.querySelector('#adminMessage').textContent = mutationError.message;
      return;
    }
    clearWorkspaceSessionCache();
    await mountClientAdmin();
  });
}

async function mountInfrastructureAccess() {
  if (activeProfile?.role !== 'infrastructure_delegate' || !selectedClient?.id) {
    throw new Error('Active infrastructure delegate access required.');
  }
  const scopes = Array.isArray(selectedClient.delegate_scopes)
    ? selectedClient.delegate_scopes
    : [];
  content.innerHTML = `
    <div class="workspace-toolbar"><div><strong>Infrastructure delegation</strong><span>${escapeHtml(selectedClient.display_name)}</span></div></div>
    <p>Your access is limited to infrastructure support scopes assigned by this tenant.</p>
    <ul>${scopes.map(scope => `<li>${escapeHtml(scope.replaceAll('_', ' '))}</li>`).join('') || '<li>No active scopes</li>'}</ul>
    <p class="note">This role grants no campaign, donor, outreach, allocation, payment, or publication authority. Contact a tenant director to change or revoke access.</p>`;
}

async function mountPlatformAdmin() {
  if (!isMasterAdmin) throw new Error('Master administrator access required.');
  const { data, error } = await activeClient
    .from('clients')
    .select('id,slug,display_name,state,reference_tenant,created_at')
    .order('display_name');
  if (error) throw error;

  content.innerHTML = `
    <div class="workspace-toolbar"><div><strong>A.G.I. platform administration</strong><span>${data.length} clients</span></div></div>
    <div class="table-wrap"><table class="workspace-table">
      <thead><tr><th>Client</th><th>Identifier</th><th>State</th><th>Reference</th><th>Onboarding</th></tr></thead>
      <tbody>${data.map(client => `<tr><td>${escapeHtml(client.display_name)}<small>${escapeHtml(client.slug)}</small></td><td>${escapeHtml(client.id)}</td><td>${escapeHtml(client.state)}</td><td>${client.reference_tenant ? 'yes' : 'no'}</td><td>${client.state === 'provisioning' ? `<button class="button secondary" type="button" data-activate-client="${escapeHtml(client.id)}">Activate</button>` : 'complete'}</td></tr>`).join('')}</tbody>
    </table></div>
    <form id="provisionClientForm" class="control-grid">
      <label>Client ID<input name="clientId" required pattern="org_[a-z0-9_]+" placeholder="org_example"></label>
      <label>URL slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="example"></label>
      <label>Display name<input name="displayName" required></label>
      <label>Initial director UUID<input name="directorId" required pattern="[0-9a-fA-F-]{36}"></label>
      <label>Rationale<input name="rationale" required minlength="12"></label>
      <button class="button" type="submit">Provision client</button>
    </form>
    <label>Activation rationale<input id="activationRationale" minlength="12" placeholder="Confirm published config and enabled modules"></label>
    <p class="note" id="platformMessage">Provisioning creates the client boundary and initial director membership. Activation requires a published configuration, at least one fundraising module, MFA, and master-administrator authority.</p>`;

  content.querySelectorAll('[data-activate-client]').forEach(button => {
    button.addEventListener('click', async () => {
      const rationale = content.querySelector('#activationRationale').value.trim();
      const { error: activationError } = await activeClient.rpc('activate_client', {
        p_client_id: button.dataset.activateClient,
        p_rationale: rationale
      });
      if (activationError) {
        content.querySelector('#platformMessage').textContent = activationError.message;
        return;
      }
      clearWorkspaceSessionCache();
      await mountPlatformAdmin();
    });
  });

  content.querySelector('#provisionClientForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error: provisionError } = await activeClient.rpc('provision_client', {
      p_client_id: form.get('clientId').trim(),
      p_slug: form.get('slug').trim(),
      p_display_name: form.get('displayName').trim(),
      p_initial_director: form.get('directorId').trim(),
      p_rationale: form.get('rationale').trim()
    });
    if (provisionError) {
      content.querySelector('#platformMessage').textContent = provisionError.message;
      return;
    }
    clearWorkspaceSessionCache();
    location.reload();
  });
}

void root;

// Provenance: Notion Sprint 001 Hub + Loop 805 Slice AGI-AUTH-DELEGATES + Hash: 8e2d66e30c2a77967a3c0aa064c24422eedfac59
