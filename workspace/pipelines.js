import { requireWorkspaceSession } from './session.js';

const STAGES = ['identified','qualified','meeting','proposal','verbal','committed','received','declined','nurture','no_route'];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

export async function mountPipelineWorkspace(root, type) {
  const { supabase, profile } = await requireWorkspaceSession();
  const editable = ['director','campaign_lead','development'].includes(profile.role);
  root.innerHTML = '<p class="workspace-loading">Loading controlled pipeline…</p>';

  const { data, error } = await supabase
    .from('opportunities')
    .select('id,title,type,stage,ask_amount,designated_outcome,next_action,next_action_at,authorization_state,version,updated_at')
    .eq('type', type)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  root.innerHTML = `
    <div class="workspace-toolbar">
      <div><strong>${type === 'grant' ? 'Grant' : 'Sponsor'} pipeline</strong><span>${data.length} controlled records</span></div>
      <button id="newOpportunity" ${editable ? '' : 'disabled'}>New record</button>
    </div>
    <div class="table-wrap"><table class="workspace-table">
      <thead><tr><th>Opportunity</th><th>Stage</th><th>Ask</th><th>Authorization</th><th>Next action</th><th></th></tr></thead>
      <tbody>${data.map(row => `
        <tr data-id="${row.id}" data-version="${row.version}">
          <td><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.designated_outcome || '')}</small></td>
          <td><select class="stage" ${editable ? '' : 'disabled'}>${STAGES.map(stage => `<option ${row.stage === stage ? 'selected' : ''}>${stage}</option>`).join('')}</select></td>
          <td>${row.ask_amount == null ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(row.ask_amount)}</td>
          <td><span class="authorization authorization-${escapeHtml(row.authorization_state)}">${escapeHtml(row.authorization_state)}</span></td>
          <td><input class="next-action" value="${escapeHtml(row.next_action || '')}" ${editable ? '' : 'disabled'} /></td>
          <td><button class="save-row" ${editable ? '' : 'disabled'}>Save</button></td>
        </tr>`).join('')}</tbody>
    </table></div>`;

  root.querySelectorAll('.save-row').forEach(button => button.addEventListener('click', async () => {
    const row = button.closest('tr');
    button.disabled = true;
    const { error: updateError } = await supabase.rpc('advance_opportunity_stage', {
      p_opportunity_id: row.dataset.id,
      p_expected_version: Number(row.dataset.version),
      p_stage: row.querySelector('.stage').value,
      p_next_action: row.querySelector('.next-action').value || null,
      p_next_action_at: null
    });
    if (updateError) {
      button.disabled = false;
      alert(updateError.message.includes('version conflict') ? 'This record changed elsewhere. Reload before saving.' : updateError.message);
      return;
    }
    await mountPipelineWorkspace(root, type);
  }));
}
