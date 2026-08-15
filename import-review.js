import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const config = window.AGI_PORTFOLIO_SIGNALS_CONFIG || window.AGI_FUND_INTEL_CONFIG || window.HACKER_DOJO_CONFIG || window.__HD_CONFIG__ || {};
const state = {
  client: null,
  session: null,
  profile: null,
  batchId: new URLSearchParams(location.search).get('batch'),
  rows: [],
  unresolved: new Map(),
  canAct: false
};

function text(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

function isSuppressed(row) {
  return row.consent_candidate === 'suppressed'
    || (row.exception_codes || []).includes('suppression_match');
}

function isPromotable(row, unresolvedCount) {
  return row.state === 'approved'
    && row.consent_candidate === 'confirmed'
    && unresolvedCount === 0
    && !isSuppressed(row);
}

function isApprovable(row, unresolvedCount) {
  return !['approved', 'promoted', 'rejected'].includes(row.state)
    && row.consent_candidate === 'confirmed'
    && unresolvedCount === 0
    && !isSuppressed(row);
}

function setActionMessage(message, isError = false) {
  const el = document.getElementById('actionMessage');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', Boolean(isError));
}

async function ensureClient() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Configure public Supabase values before using import review.');
  }
  state.client ||= createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, detectSessionInUrl: true }
  });
  return state.client;
}

async function loadProfile(client) {
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) {
    location.assign('workspace.html');
    return null;
  }
  state.session = sessionData.session;

  const { data: profile, error } = await client
    .from('profiles')
    .select('display_name,role,mfa_enforced,active')
    .eq('id', sessionData.session.user.id)
    .single();
  if (error || !profile?.active) throw error || new Error('active_profile_required');

  state.profile = profile;
  const { data: assurance, error: assuranceError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel(state.session.access_token);
  if (assuranceError) throw assuranceError;
  state.canAct = assurance?.currentLevel === 'aal2'
    && ['director', 'data_steward'].includes(profile.role);
  text('reviewerLine', `${profile.display_name || sessionData.session.user.email} · ${profile.role}`);
  return profile;
}

async function load() {
  setActionMessage('');
  if (!state.batchId) {
    text('batchState', 'Provide ?batch=<import_batch_id>');
    return;
  }

  const client = await ensureClient();
  await loadProfile(client);

  const { data: batch, error: batchError } = await client
    .from('import_batches')
    .select('id,state,row_count,source_name,source_sha256')
    .eq('id', state.batchId)
    .single();
  if (batchError) throw batchError;

  const { data: rows, error: rowError } = await client
    .from('import_staging_rows')
    .select('id,source_row_number,external_id,state,consent_candidate,exception_codes,row_fingerprint')
    .eq('batch_id', state.batchId)
    .order('source_row_number')
    .limit(250);
  if (rowError) throw rowError;
  state.rows = rows || [];

  const rowIds = state.rows.map(r => r.id);
  let exceptions = [];
  if (rowIds.length) {
    const { data: exceptionRows, error: exError } = await client
      .from('import_exceptions')
      .select('id,staging_row_id,severity,resolved_at,code')
      .in('staging_row_id', rowIds);
    if (exError) throw exError;
    exceptions = exceptionRows || [];
  }

  state.unresolved = new Map();
  for (const ex of exceptions) {
    if (!ex.resolved_at) {
      state.unresolved.set(ex.staging_row_id, (state.unresolved.get(ex.staging_row_id) || 0) + 1);
    }
  }

  const blocking = exceptions.filter(x =>
    ['error', 'critical'].includes(x.severity) && !x.resolved_at
  ).length;
  const promotable = state.rows.filter(r =>
    isPromotable(r, state.unresolved.get(r.id) || 0)
  ).length;

  text('batchState', batch.state);
  text('rowCount', batch.row_count ?? state.rows.length);
  text('blockingCount', blocking);
  text('actionAuthority', state.canAct
    ? 'Approve / reject / promote enabled for this role'
    : 'Read-only for this role');

  const gates = {
    gateSource: Boolean(batch.source_name),
    gateHash: Boolean(batch.source_sha256 && batch.source_sha256.length === 64),
    gateDuplicates: blocking === 0 || state.rows.every(r => r.state !== 'duplicate' || (state.unresolved.get(r.id) || 0) === 0),
    gateSuppression: state.rows.every(r => !isSuppressed(r) || r.state === 'suppressed' || r.state === 'rejected'),
    gateConsent: state.rows.every(r => r.consent_candidate),
    gateHuman: state.canAct
  };
  for (const [id, ok] of Object.entries(gates)) {
    const el = document.getElementById(id);
    if (el) el.checked = Boolean(ok);
  }

  const tbody = document.getElementById('importRows');
  tbody.innerHTML = state.rows.map(r => {
    const unresolvedCount = state.unresolved.get(r.id) || 0;
    const identity = r.external_id
      ? `ext:${escapeHtml(r.external_id)}`
      : `fp:${escapeHtml(String(r.row_fingerprint || '').slice(0, 8))}`;
    const canApprove = state.canAct && isApprovable(r, unresolvedCount);
    const canReject = state.canAct && !['promoted', 'rejected'].includes(r.state);
    const canPromote = state.canAct && isPromotable(r, unresolvedCount);
    return `
    <tr data-row-id="${r.id}">
      <td>${escapeHtml(r.source_row_number)}</td>
      <td>${identity}</td>
      <td>${escapeHtml(r.consent_candidate)}</td>
      <td>${isSuppressed(r) ? 'Matched' : 'Clear'}</td>
      <td>${unresolvedCount}</td>
      <td>${escapeHtml(r.state)}</td>
      <td class="row-actions">
        <button type="button" class="button secondary action-approve" data-action="approve" ${canApprove ? '' : 'disabled'}>Approve</button>
        <button type="button" class="button secondary action-reject" data-action="reject" ${canReject ? '' : 'disabled'}>Reject</button>
        <button type="button" class="button action-promote" data-action="promote" ${canPromote ? '' : 'disabled'}>Promote</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7">No staging rows found.</td></tr>';

  tbody.querySelectorAll('button[data-action]').forEach(button => {
    button.addEventListener('click', () => handleRowAction(button).catch(showError));
  });
}

async function handleRowAction(button) {
  const action = button.dataset.action;
  const rowId = Number(button.closest('tr')?.dataset.rowId);
  if (!rowId || !state.canAct) return;

  button.disabled = true;
  setActionMessage(`Running ${action}…`);

  let result;
  if (action === 'approve') {
    result = await state.client.rpc('approve_import_row', { p_row_id: rowId });
  } else if (action === 'reject') {
    const reason = window.prompt('Rejection reason', 'rejected_in_review') || '';
    if (!reason.trim()) {
      button.disabled = false;
      setActionMessage('Rejection cancelled: reason required.', true);
      return;
    }
    result = await state.client.rpc('reject_import_row', {
      p_row_id: rowId,
      p_reason: reason.trim()
    });
  } else if (action === 'promote') {
    result = await state.client.rpc('promote_import_row', { p_row_id: rowId });
  } else {
    return;
  }

  if (result.error) {
    setActionMessage('The requested review action failed.', true);
    button.disabled = false;
    return;
  }

  setActionMessage(`${action} completed for row ${rowId}.`);
  await load();
}

function showError() {
  console.error({ event: 'import_review_load_failed' });
  text('batchState', 'Review error');
  setActionMessage('Import review data could not be loaded.', true);
}

document.getElementById('refreshImport')?.addEventListener('click', () => {
  load().catch(showError);
});

load().catch(showError);
