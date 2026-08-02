import { requireWorkspaceSession, roleCan } from './session.js';

const TERMINAL = ['approved', 'rejected', 'deferred'];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

export async function mountDecisionQueue(root) {
  const { supabase, profile, selectedClient, session } = await requireWorkspaceSession();
  if (!selectedClient?.role) throw new Error('Select a client membership to view decisions.');
  const canDecide = roleCan(profile.role, 'decisions_write');

  root.innerHTML = '<p class="workspace-loading">Loading decision queue…</p>';

  const [decisionResult, configResult] = await Promise.all([
    supabase.from('decisions')
      .select('id,key,title,status,rationale,decided_at,evidence,created_at,decision_approvals(approver_id,requested_status,created_at)')
      .eq('client_id', selectedClient.id)
      .order('created_at'),
    supabase.from('client_config_versions').select('config').eq('client_id', selectedClient.id).eq('state', 'published').maybeSingle()
  ]);
  const { data, error } = decisionResult;
  if (error) throw error;
  if (configResult.error) throw configResult.error;
  const requiredApprovers = Number(configResult.data?.config?.approvals?.decision_approvers) === 2 ? 2 : 1;

  if (!data.length) {
    root.innerHTML = `
      <div class="workspace-empty">
        <h2>Decision queue</h2>
        <p>No decisions are currently visible for this role.</p>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="workspace-toolbar">
      <div>
        <strong>Decision queue</strong>
        <span>${data.length} record${data.length === 1 ? '' : 's'} · ${canDecide ? 'write enabled' : 'read only'}</span>
      </div>
    </div>
    <div class="decision-workspace">${data.map(item => `
      <article class="decision-card" data-id="${item.id}">
        <div>
          <span class="decision-key">${escapeHtml(item.key)}</span>
          <h3>${escapeHtml(item.title)}</h3>
        </div>
        <span class="decision-state state-${escapeHtml(item.status)}">${escapeHtml(item.status)}</span>
        <p class="note">Approvals: ${(item.decision_approvals || []).length}/${requiredApprovers}${item.status === 'open' && item.decision_approvals?.length ? ` · awaiting another ${escapeHtml(item.decision_approvals[0].requested_status)} approval` : ''}</p>
        <label>Rationale
          <textarea ${canDecide && item.status === 'open' ? '' : 'disabled'}>${escapeHtml(item.rationale || '')}</textarea>
        </label>
        <div class="decision-actions">
          ${TERMINAL.map(status => `
            <button type="button" class="button secondary" data-status="${status}"
              ${canDecide && item.status === 'open' && !(item.decision_approvals || []).some(approval => approval.approver_id === session.user.id) ? '' : 'disabled'}>
              ${status}
            </button>`).join('')}
        </div>
      </article>`).join('')}
    </div>`;

  root.querySelectorAll('.decision-actions button').forEach(button => {
    button.addEventListener('click', async () => {
      const card = button.closest('.decision-card');
      const id = card?.dataset.id;
      const rationale = card.querySelector('textarea').value.trim();
      if (!id) return;
      if (!rationale) {
        alert('A rationale is required for every decision.');
        return;
      }

      button.disabled = true;
      const { error: decisionError } = await supabase.rpc('decide', {
        p_decision_id: id,
        p_status: button.dataset.status,
        p_rationale: rationale
      });
      if (decisionError) {
        button.disabled = false;
        alert(decisionError.message);
        return;
      }
      await mountDecisionQueue(root);
    });
  });
}
