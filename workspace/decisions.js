import { requireWorkspaceSession } from './session.js';

const TERMINAL = ['approved','rejected','deferred'];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

export async function mountDecisionQueue(root) {
  const { supabase, profile } = await requireWorkspaceSession();
  const canDecide = ['director','campaign_lead'].includes(profile.role);
  const { data, error } = await supabase
    .from('decisions')
    .select('id,key,title,status,rationale,decided_at,evidence')
    .order('created_at');
  if (error) throw error;

  root.innerHTML = `<div class="decision-workspace">${data.map(item => `
    <article class="decision-card">
      <div><span class="decision-key">${escapeHtml(item.key)}</span><h3>${escapeHtml(item.title)}</h3></div>
      <span class="decision-state state-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
      <label>Rationale<textarea ${canDecide && item.status === 'open' ? '' : 'disabled'}>${escapeHtml(item.rationale || '')}</textarea></label>
      <div class="decision-actions">${TERMINAL.map(status => `<button data-status="${status}" ${canDecide && item.status === 'open' ? '' : 'disabled'}>${status}</button>`).join('')}</div>
    </article>`).join('')}</div>`;

  root.querySelectorAll('.decision-actions button').forEach(button => button.addEventListener('click', async () => {
    const card = button.closest('.decision-card');
    const id = data[[...root.querySelectorAll('.decision-card')].indexOf(card)].id;
    const rationale = card.querySelector('textarea').value.trim();
    if (!rationale) return alert('A rationale is required for every decision.');
    button.disabled = true;
    const { error: decisionError } = await supabase.rpc('decide', {
      p_decision_id: id,
      p_status: button.dataset.status,
      p_rationale: rationale
    });
    if (decisionError) return alert(decisionError.message);
    await mountDecisionQueue(root);
  }));
}
