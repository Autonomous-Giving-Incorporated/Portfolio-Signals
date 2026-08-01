import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const config = window.HACKER_DOJO_CONFIG || window.__HD_CONFIG__ || {};
const state = {
  client: null,
  batchId: new URLSearchParams(location.search).get('batch')
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

async function load() {
  if (!config.supabaseUrl || !config.supabaseAnonKey || !state.batchId) {
    text('batchState', 'Configure public Supabase values and provide ?batch=');
    return;
  }

  state.client ||= createClient(config.supabaseUrl, config.supabaseAnonKey);

  const { data: sessionData } = await state.client.auth.getSession();
  if (!sessionData.session) {
    location.assign('workspace.html');
    return;
  }

  const { data: batch, error: batchError } = await state.client
    .from('import_batches')
    .select('id,state,row_count,source_name,source_sha256')
    .eq('id', state.batchId)
    .single();
  if (batchError) throw batchError;

  const { data: rows, error: rowError } = await state.client
    .from('import_staging_rows')
    .select('id,source_row_number,external_id,state,consent_candidate,exception_codes,row_fingerprint')
    .eq('batch_id', state.batchId)
    .order('source_row_number')
    .limit(250);
  if (rowError) throw rowError;

  const rowIds = (rows || []).map(r => r.id);
  let exceptions = [];
  if (rowIds.length) {
    const { data: exceptionRows, error: exError } = await state.client
      .from('import_exceptions')
      .select('staging_row_id,severity,resolved_at')
      .in('staging_row_id', rowIds);
    if (exError) throw exError;
    exceptions = exceptionRows || [];
  }

  const unresolved = new Map();
  for (const ex of exceptions) {
    if (!ex.resolved_at) {
      unresolved.set(ex.staging_row_id, (unresolved.get(ex.staging_row_id) || 0) + 1);
    }
  }

  const blocking = exceptions.filter(x =>
    ['error', 'critical'].includes(x.severity) && !x.resolved_at
  ).length;

  const promotable = (rows || []).filter(r =>
    isPromotable(r, unresolved.get(r.id) || 0)
  ).length;

  text('batchState', batch.state);
  text('rowCount', batch.row_count ?? (rows || []).length);
  text('blockingCount', blocking);
  text('promotableCount', promotable);

  document.getElementById('importRows').innerHTML = (rows || []).map(r => {
    const unresolvedCount = unresolved.get(r.id) || 0;
    const identity = r.external_id
      ? `ext:${escapeHtml(r.external_id)}`
      : `fp:${escapeHtml(String(r.row_fingerprint || '').slice(0, 8))}`;
    return `
    <tr>
      <td>${escapeHtml(r.source_row_number)}</td>
      <td>${identity}</td>
      <td>${escapeHtml(r.consent_candidate)}</td>
      <td>${isSuppressed(r) ? 'Matched' : 'Clear'}</td>
      <td>${unresolvedCount}</td>
      <td>${escapeHtml(r.state)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6">No staging rows found.</td></tr>';
}

function showError(error) {
  console.error(error);
  text('batchState', 'Review error');
}

document.getElementById('refreshImport')?.addEventListener('click', () => {
  load().catch(showError);
});

load().catch(showError);
