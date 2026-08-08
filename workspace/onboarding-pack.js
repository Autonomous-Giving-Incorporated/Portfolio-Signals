import { createWorkspaceClient, getRuntimeConfig } from './session.js';

const SLOT_LABELS = {
  org_legal_name_proof: 'Legal name / formation',
  tax_exempt_or_ein: 'Tax-exempt / EIN',
  governance: 'Governance',
  brand_logo: 'Logo',
  primary_contact: 'Primary contact card',
  w9: 'W-9',
  board_list: 'Board list',
  brand_kit: 'Brand kit / style',
  campaign_brief: 'Campaign / program brief',
  impact_sample: 'Sample impact / annual PDF',
  other: 'Other'
};

const ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.svg,.docx,.txt,.csv,.xls,.xlsx,application/pdf,image/png,image/jpeg,image/webp,image/svg+xml,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])
  );
}

function slotLabel(key) {
  return SLOT_LABELS[key] || key;
}

function statusBadge(status) {
  if (status === 'ready') return '<span class="tag" data-pack-status="ready">Ready</span>';
  if (status === 'archived') return '<span class="tag warning">Archived</span>';
  return '<span class="tag warning">In progress</span>';
}

/**
 * Mount client-scoped Onboarding Pack checklist UI.
 * @param {HTMLElement} container
 * @param {{ clientId: string, session: object, isMasterAdmin?: boolean }} opts
 *   session is the object returned by requireWorkspaceSession()
 */
export async function mountOnboardingPack(container, { clientId, session: workspaceSession, isMasterAdmin = false } = {}) {
  if (!clientId) throw new Error('Client id required for onboarding pack.');
  if (!workspaceSession?.session?.access_token) throw new Error('Authentication required.');

  const supabase = workspaceSession.supabase || createWorkspaceClient();
  const accessToken = workspaceSession.session.access_token;
  const config = getRuntimeConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Workspace is not configured with public Supabase values.');
  }

  const functionsBase = `${config.supabaseUrl}/functions/v1`;
  let packView = null;
  let statusEl = null;

  const setStatus = (text, isError = false) => {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.classList.toggle('error', Boolean(isError));
  };

  async function loadPack() {
    const { data, error } = await supabase.rpc('get_onboarding_pack', { p_client_id: clientId });
    if (error) throw error;
    packView = data;
    return data;
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    setStatus(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
    const errors = [];
    for (const file of files) {
      try {
        const body = new FormData();
        body.set('client_id', clientId);
        body.set('document', file, file.name);
        const response = await fetch(`${functionsBase}/upload-onboarding-document`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: config.supabaseAnonKey
          },
          body
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const reason = payload.reject_reason || payload.error || response.statusText;
          errors.push(`${file.name}: ${reason}`);
        }
      } catch (err) {
        errors.push(`${file.name}: ${err.message || 'upload failed'}`);
      }
    }
    await loadPack();
    render();
    if (errors.length) {
      setStatus(errors.join(' · '), true);
    } else {
      setStatus(`Uploaded ${files.length} file${files.length === 1 ? '' : 's'}.`);
    }
  }

  async function confirmDocument(documentId, type) {
    if (!type) throw new Error('Select a checklist slot before confirming.');
    const { error } = await supabase.rpc('confirm_onboarding_document', {
      p_document_id: documentId,
      p_type: type
    });
    if (error) throw error;
    await loadPack();
    render();
    setStatus(`Confirmed as ${slotLabel(type)}.`);
  }

  async function unconfirmDocument(documentId) {
    const { error } = await supabase.rpc('unconfirm_onboarding_document', {
      p_document_id: documentId
    });
    if (error) throw error;
    await loadPack();
    render();
    setStatus('Confirmation cleared.');
  }

  async function previewDocument(documentId) {
    const response = await fetch(`${functionsBase}/onboarding-document-url`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: config.supabaseAnonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ documentId, expiresIn: 60 })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Could not open preview.');
    if (!payload.signedUrl) throw new Error('Preview URL missing.');
    window.open(payload.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function progressCounts(view) {
    const required = Array.isArray(view.required_slots) ? view.required_slots : [];
    const slots = view.slots || {};
    let confirmed = 0;
    for (const key of required) {
      if (slots[key]?.document) confirmed += 1;
    }
    return { requiredConfirmed: confirmed, requiredTotal: required.length || 5 };
  }

  function slotOptionsHtml(selected) {
    const required = packView?.required_slots || [];
    const optional = packView?.optional_slots || [];
    const groups = [
      ['Required', required],
      ['Optional', optional]
    ];
    return groups
      .map(
        ([label, keys]) =>
          `<optgroup label="${escapeHtml(label)}">${keys
            .map(
              (key) =>
                `<option value="${escapeHtml(key)}"${key === selected ? ' selected' : ''}>${escapeHtml(
                  slotLabel(key)
                )}</option>`
            )
            .join('')}</optgroup>`
      )
      .join('');
  }

  function renderChecklist() {
    const required = packView.required_slots || [];
    const optional = packView.optional_slots || [];
    const slots = packView.slots || {};

    const row = (key) => {
      const entry = slots[key] || {};
      const doc = entry.document;
      const filled = Boolean(doc);
      return `<li class="onboarding-slot${filled ? ' is-filled' : ''}" data-slot="${escapeHtml(key)}">
        <div>
          <strong>${escapeHtml(slotLabel(key))}</strong>
          ${entry.required ? '<span class="tag">Required</span>' : '<span class="tag">Optional</span>'}
        </div>
        <div class="onboarding-slot-doc">
          ${
            filled
              ? `<span>${escapeHtml(doc.original_filename || doc.id)}</span>
                 <button type="button" class="button secondary" data-preview="${escapeHtml(doc.id)}">Preview</button>
                 <button type="button" class="button secondary" data-unconfirm="${escapeHtml(doc.id)}">Unconfirm</button>`
              : '<span class="note">Not confirmed</span>'
          }
        </div>
      </li>`;
    };

    return `
      <section class="onboarding-checklist">
        <h3>Required checklist</h3>
        <ul class="onboarding-slot-list">${required.map(row).join('') || '<li class="note">No required slots.</li>'}</ul>
        <h3>Optional</h3>
        <ul class="onboarding-slot-list">${optional.map(row).join('') || '<li class="note">No optional slots.</li>'}</ul>
      </section>`;
  }

  function renderDocuments() {
    const docs = Array.isArray(packView.documents) ? packView.documents : [];
    if (!docs.length) {
      return `<section class="onboarding-uploads">
        <h3>Recent uploads</h3>
        <p class="note">No documents yet. Uploads stay private to this client — not public Pages, and never automatic CRM import or outreach.</p>
      </section>`;
    }

    return `<section class="onboarding-uploads">
      <h3>Recent uploads</h3>
      <ul class="onboarding-doc-list">
        ${docs
          .map((doc) => {
            const parked = doc.status === 'parked_crm';
            const confirmed = doc.status === 'confirmed';
            const suggestion =
              doc.suggested_type && doc.suggested_type !== 'uncategorized'
                ? slotLabel(doc.suggested_type)
                : 'Uncategorized';
            return `<li class="onboarding-doc${parked ? ' is-parked' : ''}" data-doc-id="${escapeHtml(doc.id)}">
              <div class="onboarding-doc-meta">
                <strong>${escapeHtml(doc.original_filename || doc.id)}</strong>
                <span class="tag${parked ? ' warning' : ''}">${escapeHtml(doc.status || 'stored')}</span>
                <span class="note">Suggested: ${escapeHtml(suggestion)}${
                  doc.suggested_confidence != null
                    ? ` (${Math.round(Number(doc.suggested_confidence) * 100)}%)`
                    : ''
                }</span>
                ${
                  confirmed && doc.confirmed_type
                    ? `<span class="note">Confirmed: ${escapeHtml(slotLabel(doc.confirmed_type))}</span>`
                    : ''
                }
              </div>
              ${
                parked
                  ? `<p class="note onboarding-parked-banner" role="status" style="background:color-mix(in srgb, var(--warning) 16%, transparent);border:1px solid color-mix(in srgb, var(--warning) 40%, transparent);padding:.65rem .85rem;border-radius:.5rem;color:var(--warning)">
                      Stored privately. List ingest is a separate step; not enabled from this pack.
                    </p>`
                  : ''
              }
              <div class="onboarding-doc-actions control-grid">
                <button type="button" class="button secondary" data-preview="${escapeHtml(doc.id)}">Preview</button>
                ${
                  doc.status === 'stored'
                    ? `<label class="onboarding-confirm-slot">Confirm as
                        <select data-confirm-type="${escapeHtml(doc.id)}">
                          <option value="">Select slot…</option>
                          ${slotOptionsHtml(doc.suggested_type)}
                        </select>
                      </label>
                      <button type="button" class="button" data-confirm="${escapeHtml(doc.id)}">Confirm</button>`
                    : ''
                }
                ${
                  confirmed
                    ? `<button type="button" class="button secondary" data-unconfirm="${escapeHtml(doc.id)}">Unconfirm</button>`
                    : ''
                }
              </div>
            </li>`;
          })
          .join('')}
      </ul>
    </section>`;
  }

  function renderDropzone() {
    return `<section class="onboarding-dropzone" id="onboardingDropzone" tabindex="0" aria-label="Upload onboarding documents">
      <p><strong>Drop files here</strong> or choose files to upload (max 25 MiB each).</p>
      <p class="note">PDF, images, DOCX, text — or CSV/XLSX (parked for list ingest, not org-proof).</p>
      <input id="onboardingFileInput" type="file" multiple accept="${ACCEPT}" hidden />
      <button type="button" class="button secondary" id="onboardingPickFiles">Choose files</button>
    </section>`;
  }

  function bindEvents() {
    statusEl = container.querySelector('#onboardingPackStatus');

    const dropzone = container.querySelector('#onboardingDropzone');
    const fileInput = container.querySelector('#onboardingFileInput');
    container.querySelector('#onboardingPickFiles')?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async () => {
      try {
        await uploadFiles(fileInput.files);
      } catch (err) {
        setStatus(err.message, true);
      } finally {
        fileInput.value = '';
      }
    });

    if (dropzone) {
      const prevent = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, prevent));
      dropzone.addEventListener('dragover', () => dropzone.classList.add('is-dragover'));
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
      dropzone.addEventListener('drop', async (e) => {
        dropzone.classList.remove('is-dragover');
        try {
          await uploadFiles(e.dataTransfer?.files);
        } catch (err) {
          setStatus(err.message, true);
        }
      });
    }

    container.querySelectorAll('[data-preview]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await previewDocument(btn.getAttribute('data-preview'));
        } catch (err) {
          setStatus(err.message, true);
        }
      });
    });

    container.querySelectorAll('[data-confirm]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-confirm');
        const select = container.querySelector(`select[data-confirm-type="${id}"]`);
        try {
          await confirmDocument(id, select?.value || '');
        } catch (err) {
          setStatus(err.message, true);
        }
      });
    });

    container.querySelectorAll('[data-unconfirm]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await unconfirmDocument(btn.getAttribute('data-unconfirm'));
        } catch (err) {
          setStatus(err.message, true);
        }
      });
    });
  }

  function render() {
    const pack = packView?.pack || {};
    const { requiredConfirmed, requiredTotal } = progressCounts(packView || {});
    const ready = pack.status === 'ready';
    const clientLabel =
      workspaceSession.selectedClient?.display_name ||
      workspaceSession.selectedClient?.id ||
      clientId;

    container.innerHTML = `
      <div class="onboarding-pack-workspace">
        <div class="workspace-toolbar">
          <div>
            <p class="eyebrow">Director / master admin · MFA governed</p>
            <strong>Onboarding pack</strong>
            <span>${escapeHtml(clientLabel)}${isMasterAdmin ? ' · platform view' : ''}</span>
          </div>
          <div class="onboarding-pack-progress">
            <span class="tag">Required ${requiredConfirmed}/${requiredTotal}</span>
            ${statusBadge(pack.status || 'in_progress')}
          </div>
        </div>
        <p class="note">
          Private document room for org-proof and ops files. Pack ready does not activate the client
          or authorize CRM import or outreach.
        </p>
        ${
          ready
            ? `<p class="note" role="status" style="background:color-mix(in srgb, var(--brand-2) 14%, transparent);border:1px solid color-mix(in srgb, var(--brand-2) 35%, transparent);padding:.75rem 1rem;border-radius:.5rem">
                <strong>Pack ready.</strong> Pack ready does not enable CRM import or outreach.
              </p>`
            : ''
        }
        <div class="onboarding-pack-layout" style="display:grid;gap:1.25rem;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr)">
          ${renderChecklist()}
          <div>
            ${renderDropzone()}
            ${renderDocuments()}
          </div>
        </div>
        <p id="onboardingPackStatus" class="note" role="status"></p>
      </div>
      <style>
        .onboarding-slot-list, .onboarding-doc-list { list-style: none; padding: 0; margin: 0 0 1rem; display: grid; gap: .65rem; }
        .onboarding-slot, .onboarding-doc { border: 1px solid color-mix(in srgb, var(--muted) 28%, transparent); border-radius: .65rem; padding: .75rem .9rem; display: grid; gap: .5rem; }
        .onboarding-slot.is-filled { border-color: color-mix(in srgb, var(--brand-2) 40%, transparent); }
        .onboarding-doc.is-parked { border-color: color-mix(in srgb, var(--warning) 45%, transparent); }
        .onboarding-slot-doc, .onboarding-doc-meta, .onboarding-doc-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
        .onboarding-dropzone { border: 1px dashed color-mix(in srgb, var(--brand-2) 45%, transparent); border-radius: .75rem; padding: 1.1rem; margin-bottom: 1rem; background: color-mix(in srgb, var(--brand-2) 6%, transparent); }
        .onboarding-dropzone.is-dragover { background: color-mix(in srgb, var(--brand-2) 14%, transparent); }
        .onboarding-confirm-slot select { min-width: 12rem; }
        .onboarding-pack-progress { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
        @media (max-width: 900px) {
          .onboarding-pack-layout { grid-template-columns: 1fr !important; }
        }
      </style>`;

    bindEvents();
  }

  container.innerHTML = '<p class="workspace-loading">Loading onboarding pack…</p>';
  try {
    await loadPack();
    render();
  } catch (error) {
    // Render the error here and return (do not rethrow): openSection's catch
    // would overwrite this message, and throwing would skip setBusy(false).
    const msg = error?.message || String(error);
    const denied = /onboarding_pack_forbidden|forbidden|permission|42501/i.test(msg);
    container.innerHTML = `<p class="note error">${escapeHtml(
      denied
        ? 'Access denied: director membership or master administrator with enforced MFA is required for this client pack.'
        : msg
    )}</p>`;
    return;
  }
}
