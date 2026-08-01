import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const config = window.__HD_CONFIG__ || {};
const state = { client: null, batchId: new URLSearchParams(location.search).get('batch') };

function text(id, value) { const el = document.getElementById(id); if (el) el.textContent = String(value); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

async function load() {
  if (!config.supabaseUrl || !config.supabaseAnonKey || !state.batchId) return;
  state.client ||= createClient(config.supabaseUrl, config.supabaseAnonKey);

  const { data: sessionData } = await state.client.auth.getSession();
  if (!sessionData.session) return location.assign('workspace.html');

  const { data: batch, error: batchError } = await state.client.from('import_batches')
    .select('id,state,row_count,source_filename,source_sha256')
    .eq('id', state.batchId).single();
  if (batchError) throw batchError;

  const { data: rows, error: rowError } = await state.client.from('import_staging_rows')
    .select('id,row_number,identity_state,consent_status,suppression_match,promotion_state')
    .eq('batch_id', state.batchId).order('row_number').limit(250);
  if (rowError) throw rowError;

  const { data: exceptions, error: exError } = await state.client.from('import_exceptions')
    .select('staging_row_id,severity,resolved_at').eq('batch_id', state.batchId);
  if (exError) throw exError;

  const unresolved = new Map();
  for (const ex of exceptions || []) if (!ex.resolved_at) unresolved.set(ex.staging_row_id, (unresolved.get(ex.staging_row_id) || 0) + 1);
  const blocking = (exceptions || []).filter(x => x.severity === 'blocking' && !x.resolved_at).length;
  const promotable = (rows || []).filter(r => r.promotion_state === 'eligible' && !r.suppression_match && !unresolved.get(r.id)).length;

  text('batchState', batch.state);
  text('rowCount', batch.row_count ?? rows.length);
  text('blockingCount', blocking);
  text('promotableCount', promotable);

  document.getElementById('importRows').innerHTML = (rows || []).map(r => `
    <tr>
      <td>${escapeHtml(r.row_number)}</td>
      <td>${escapeHtml(r.identity_state)}</td>
      <td>${escapeHtml(r.consent_status)}</td>
      <td>${r.suppression_match ? 'Matched' : 'Clear'}</td>
      <td>${unresolved.get(r.id) || 0}</td>
      <td>${escapeHtml(r.promotion_state)}</td>
    </tr>`).join('') || '<tr><td colspan="6">No staging rows found.</td></tr>';
}

document.getElementById('refreshImport')?.addEventListener('click', () => load().catch(showError));
function showError(error) { console.error(error); text('batchState', 'Review error'); }
load().catch(showError);
