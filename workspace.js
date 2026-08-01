import { createWorkspaceClient, clearWorkspaceSessionCache, roleCan } from './workspace/session.js';
import { mountDecisionQueue } from './workspace/decisions.js';
import { mountPipelineWorkspace } from './workspace/pipelines.js';

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
  'auditor'
]);

let activeClient = null;
let activeProfile = null;

function showMessage(text) {
  message.textContent = text;
}

function setBusy(isBusy) {
  content?.setAttribute('aria-busy', isBusy ? 'true' : 'false');
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
    const { error } = await activeClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}${location.pathname}` }
    });
    showMessage(error ? error.message : 'Check your email for the secure sign-in link.');
  });

  document.getElementById('signOut').addEventListener('click', async () => {
    clearWorkspaceSessionCache();
    await activeClient.auth.signOut();
  });

  activeClient.auth.onAuthStateChange((_event, session) => {
    renderSession(session).catch((error) => showMessage(error.message));
  });
  activeClient.auth.getSession().then(({ data }) => {
    renderSession(data.session).catch((error) => showMessage(error.message));
  });
}

async function renderSession(session) {
  if (!session) {
    gate.hidden = false;
    workspace.hidden = true;
    activeProfile = null;
    clearWorkspaceSessionCache();
    return;
  }

  const { data: profile, error } = await activeClient
    .from('profiles')
    .select('id,display_name,role,mfa_enforced,active')
    .eq('id', session.user.id)
    .single();

  const mfaRequired = profile && PRIVILEGED_ROLES.has(profile.role);
  if (error || !profile?.active || (mfaRequired && !profile.mfa_enforced)) {
    gate.hidden = false;
    workspace.hidden = true;
    showMessage(
      mfaRequired
        ? 'Access blocked: active profile and enforced MFA are required for privileged roles.'
        : 'Access blocked: an active campaign profile is required.'
    );
    return;
  }

  activeProfile = profile;
  gate.hidden = true;
  workspace.hidden = false;
  document.getElementById('identityLine').textContent =
    `${profile.display_name || session.user.email} · ${profile.role}`;
  renderNavigation(profile.role);
  await loadDashboard(profile.role);
}

function renderNavigation(role) {
  const items = [];
  if (roleCan(role, 'decisions')) items.push({ id: 'decisions', label: 'Decisions' });
  if (roleCan(role, 'opportunities')) {
    items.push({ id: 'sponsors', label: 'Sponsors' });
    items.push({ id: 'grants', label: 'Grants' });
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
}

async function loadDashboard(role) {
  const canReadConstituents = [
    'director',
    'campaign_lead',
    'development',
    'data_steward',
    'auditor'
  ].includes(role);

  const [decisions, opportunities, confirmedConsent, exceptions] = await Promise.all([
    activeClient.from('decisions').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    activeClient.from('opportunities').select('*', { count: 'exact', head: true })
      .in('stage', ['qualified', 'meeting', 'proposal', 'verbal']),
    canReadConstituents
      ? activeClient.from('constituents').select('*', { count: 'exact', head: true })
          .eq('consent_status', 'confirmed')
      : Promise.resolve({ count: 0 }),
    activeClient.from('import_exceptions').select('*', { count: 'exact', head: true })
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
      ${roleCan(role, 'opportunities') ? '<button type="button" class="button secondary" data-jump="sponsors">Open sponsor pipeline</button>' : ''}
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

  if (section === 'decisions') {
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
              <td>${row.claim}</td>
              <td>${row.state}</td>
              <td>${row.verified_at || '—'}</td>
            </tr>`).join('') || '<tr><td colspan="3">No claims visible.</td></tr>'}
        </tbody>
      </table></div>`;
  } else if (section === 'audit') {
    const { data, error } = await activeClient
      .from('audit_log')
      .select('id,action,entity_type,entity_id,occurred_at')
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

void root;
