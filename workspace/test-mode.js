const FIXTURE = 'portfolio-signals-synthetic-readonly-v1';
const TEST_BANNER = 'TEST MODE — synthetic data, no production authority';
const READ_RPCS = new Set(['get_onboarding_pack', 'get_ir_provisioning_request']);

function loopbackHostname(hostname = '') {
  const value = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
}

export function resolveLocalTestMode(config = {}, location = globalThis.location) {
  const candidate = config?.testMode;
  if (!candidate || candidate.runtime !== 'test' || candidate.fixture !== FIXTURE) return null;
  if (!location || !loopbackHostname(location.hostname)) return null;
  if (config.supabaseUrl || config.supabaseAnonKey) return null;

  let backend;
  try {
    backend = new URL(candidate.backendOrigin);
  } catch {
    return null;
  }
  if (!loopbackHostname(backend.hostname) || !['http:', 'https:'].includes(backend.protocol)) return null;

  return Object.freeze({
    fixture: FIXTURE,
    backendOrigin: backend.origin,
    authority: 'none',
    synthetic: true
  });
}

export function syntheticWorkspaceSession(mode) {
  if (!mode?.synthetic || mode.fixture !== FIXTURE) throw new Error('Synthetic fixture is not active.');
  const selectedClient = {
    id: 'org_synthetic_fixture',
    display_name: 'Synthetic Test Tenant',
    role: 'director',
    state: 'active',
    reference_tenant: false
  };
  const profile = {
    id: '00000000-0000-4000-8000-000000000001',
    display_name: 'Synthetic Test Operator',
    active: true,
    mfa_enforced: true,
    role: 'director'
  };
  return {
    session: {
      synthetic: true,
      user: { id: profile.id, email: 'synthetic.operator@example.invalid' }
    },
    profile,
    context: { profile, clients: [selectedClient], is_master_admin: true, synthetic: true },
    clients: [selectedClient],
    selectedClient,
    isMasterAdmin: true
  };
}

const datasets = Object.freeze({
  decisions: [{
    id: 'synthetic-decision-1', key: 'SYN-001', title: 'Synthetic approval exercise', status: 'open',
    rationale: '', decided_at: null, evidence: [], created_at: '2026-01-01T00:00:00Z', decision_approvals: []
  }, {
    id: 'synthetic-decision-2', key: 'SYN-002', title: 'No-authority fixture check', status: 'open',
    rationale: '', decided_at: null, evidence: [], created_at: '2026-01-02T00:00:00Z', decision_approvals: []
  }],
  opportunities: [{
    id: 'synthetic-opportunity-1', title: 'Synthetic sponsor', type: 'sponsorship', stage: 'qualified',
    ask_amount: 1000, designated_outcome: 'Fixture only', next_action: 'Observe only', next_action_at: null,
    authorization_state: 'blocked', version: 1, updated_at: '2026-01-03T00:00:00Z'
  }, {
    id: 'synthetic-opportunity-2', title: 'Synthetic grant', type: 'grant', stage: 'proposal',
    ask_amount: 2500, designated_outcome: 'Fixture only', next_action: 'Observe only', next_action_at: null,
    authorization_state: 'blocked', version: 1, updated_at: '2026-01-04T00:00:00Z'
  }],
  constituents: [{ id: 'synthetic-constituent-1' }],
  import_exceptions: [{ id: 'synthetic-exception-1' }],
  claims: [{ id: 'synthetic-claim-1', claim: 'Synthetic evidence only', state: 'unverified', verified_at: null, created_at: '2026-01-01T00:00:00Z' }],
  audit_log: [{ id: 'synthetic-audit-1', action: 'fixture_loaded', entity_type: 'synthetic_fixture', entity_id: null, occurred_at: '2026-01-01T00:00:00Z' }],
  client_config_versions: [{
    id: 'synthetic-config-1', version: 1, state: 'published', created_at: '2026-01-01T00:00:00Z',
    config: { organization_name: 'Synthetic Test Tenant', product_name: 'Synthetic Campaign', modules: { sponsors: true, grants: true }, approvals: { decision_approvers: 2 }, theme: { primary: '#2e7d6b', accent: '#e6b23c', background: '#0e1116' }, assets: {} }
  }],
  client_assets: [],
  clients: [{ id: 'org_synthetic_fixture', slug: 'synthetic-fixture', display_name: 'Synthetic Test Tenant', state: 'active', reference_tenant: false, created_at: '2026-01-01T00:00:00Z' }],
  client_memberships: [{ user_id: '00000000-0000-4000-8000-000000000001', role: 'director', active: true, membership_version: 1, profiles: { display_name: 'Synthetic Test Operator' } }],
  infrastructure_delegations: [],
  client_delegate_invitations: [],
  profiles: [{ id: '00000000-0000-4000-8000-000000000001' }]
});

function trace(entry) {
  const log = globalThis.__AGI_TEST_MODE_TRACE || (globalThis.__AGI_TEST_MODE_TRACE = []);
  log.push({ ...entry, at: new Date().toISOString() });
}

function query(resource) {
  let rows = [...(datasets[resource] || [])];
  let head = false;
  const builder = {
    select(_columns, options = {}) { head = options.head === true; return builder; },
    eq(column, value) { rows = rows.filter(row => row[column] === value || row[column] === undefined); return builder; },
    in(column, values) { rows = rows.filter(row => values.includes(row[column])); return builder; },
    is(column, value) { rows = rows.filter(row => row[column] === value || row[column] === undefined); return builder; },
    order() { return builder; },
    limit(amount) { rows = rows.slice(0, amount); return builder; },
    async maybeSingle() {
      trace({ kind: 'read', resource });
      return { data: rows[0] || null, count: rows.length, error: null };
    },
    insert() {
      trace({ kind: 'mutation', resource, blocked: true });
      return Promise.resolve({ data: null, error: new Error('TEST MODE has no production authority.') });
    },
    then(resolve, reject) {
      trace({ kind: 'read', resource });
      return Promise.resolve({ data: head ? null : rows, count: rows.length, error: null }).then(resolve, reject);
    }
  };
  return builder;
}

export function createSyntheticWorkspaceClient(mode) {
  const fixtureSession = syntheticWorkspaceSession(mode);
  return {
    __synthetic: true,
    auth: {
      getSession: async () => ({ data: { session: fixtureSession.session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
      mfa: {}
    },
    from: query,
    rpc: async (resource) => {
      const isFixtureRead = READ_RPCS.has(resource);
      trace({ kind: isFixtureRead ? 'read' : 'mutation', resource, blocked: !isFixtureRead });
      if (resource === 'get_onboarding_pack') {
        return {
          data: {
            pack: { status: 'in_progress' },
            required_slots: ['org_legal_name_proof', 'tax_exempt_or_ein', 'governance', 'brand_logo', 'primary_contact'],
            optional_slots: [],
            slots: {},
            documents: []
          },
          error: null
        };
      }
      return isFixtureRead
        ? { data: null, error: null }
        : { data: null, error: new Error('TEST MODE has no production authority.') };
    },
    functions: {
      invoke: async (resource) => {
        trace({ kind: 'mutation', resource, blocked: true });
        return { data: null, error: new Error('TEST MODE has no production authority.') };
      }
    }
  };
}

const MUTATION_LABEL = /^(activate|approve|confirm|defer|execute|initialize|invite|new record|provision|publish|reject|revoke|rollback|save|send sign-in|persist|promote)/i;

function containMutationControls(root) {
  if (!root) return;
  for (const control of root.querySelectorAll('button, input[type="file"]')) {
    const label = (control.textContent || control.value || control.getAttribute('aria-label') || '').trim();
    if (control.type === 'submit' || MUTATION_LABEL.test(label)) {
      if (!control.disabled) control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
      control.title = TEST_BANNER;
    }
  }
  if (!root.querySelector('[data-synthetic-readonly-note]')) {
    const note = document.createElement('p');
    note.className = 'note test-mode-panel-note';
    note.dataset.syntheticReadonlyNote = 'true';
    note.textContent = 'Synthetic read-only fixture · controls cannot publish, activate, provision, contact, or move funds.';
    root.prepend(note);
  }
}

function containAuthorityLinks() {
  for (const link of document.querySelectorAll('a.button[href="finance-impact.html"], a.button[href="donor-impact.html"]')) {
    link.removeAttribute('href');
    link.setAttribute('aria-disabled', 'true');
    link.title = TEST_BANNER;
  }
  const signOut = document.getElementById('signOut');
  if (signOut) {
    signOut.disabled = true;
    signOut.setAttribute('aria-disabled', 'true');
    signOut.title = TEST_BANNER;
  }
  const status = document.querySelector('#workspace .status-pill');
  if (status) status.textContent = 'Synthetic · no authority';
}

export function activateTestModeUi(mode) {
  if (!mode?.synthetic) return;
  document.documentElement.dataset.testMode = 'synthetic-readonly';
  const banner = document.getElementById('testModeBanner');
  if (banner) {
    banner.hidden = false;
    banner.textContent = TEST_BANNER;
    const syncBannerHeight = () => {
      document.documentElement.style.setProperty('--test-mode-banner-height', `${banner.getBoundingClientRect().height}px`);
    };
    syncBannerHeight();
    new ResizeObserver(syncBannerHeight).observe(banner);
  }
  const content = document.getElementById('workspaceContent');
  containAuthorityLinks();
  containMutationControls(content);
  new MutationObserver(() => {
    containAuthorityLinks();
    containMutationControls(content);
  }).observe(content, { attributes: true, attributeFilter: ['disabled'], childList: true, subtree: true });
}

export { FIXTURE as TEST_FIXTURE_NAME, TEST_BANNER };
