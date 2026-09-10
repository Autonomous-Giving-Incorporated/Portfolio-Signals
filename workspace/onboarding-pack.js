import { createWorkspaceClient, getRuntimeConfig } from './session.js';
import { collectionMessages } from './onboarding-messages.js';
import { resolveLocalTestMode } from './test-mode.js';

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
  const testMode = resolveLocalTestMode(getRuntimeConfig(), globalThis.location);
  if (!workspaceSession?.session?.access_token && !testMode) throw new Error('Authentication required.');

  const supabase = workspaceSession.supabase || createWorkspaceClient();
  const accessToken = workspaceSession.session.access_token;
  const config = getRuntimeConfig();
  const t = collectionMessages(config.onboardingMessages);
  if ((!config.supabaseUrl || !config.supabaseAnonKey) && !testMode) {
    throw new Error('Workspace is not configured with public Supabase values.');
  }

  const functionsBase = testMode ? testMode.backendOrigin : `${config.supabaseUrl}/functions/v1`;
  let packView = null;
  let statusEl = null;
  let uploading = false;
  let uploadResults = [];
  const requireWriteAuthority = () => {
    if (testMode) throw new Error('TEST MODE has no production authority.');
  };

  function renderUploadResults() {
    const list = container.querySelector('#onboardingUploadResults');
    if (list) list.innerHTML = uploadResults.map(result =>
      `<li>${escapeHtml(result.name)}: ${escapeHtml(result.message)}</li>`
    ).join('');
  }

  function setUploading(value) {
    uploading = value;
    container.querySelector('#onboardingDropzone')?.setAttribute('aria-busy', String(value));
    container.querySelectorAll('#onboardingPickFiles, #onboardingFileInput, [data-confirm], [data-unconfirm]').forEach(el => { el.disabled = value; });
  }

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
    requireWriteAuthority();
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length || uploading) return;
    uploadResults = [];
    setUploading(true);
    const progress = container.querySelector('#onboardingUploadProgress');
    progress.hidden = false;
    progress.max = files.length;
    progress.value = 0;
    let uploaded = 0;
    const errors = [];
    for (const file of files) {
      setStatus(t('uploading', { current: progress.value + 1, total: files.length, name: file.name }));
      // Match the edge contract: allowed extension OR MIME, nonempty, <= 25 MiB.
      const extension = file.name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
      const accepted = ACCEPT.split(',');
      const invalid = file.size <= 0 ? t('emptyFile')
        : file.size > 26214400 ? t('largeFile')
        : !accepted.includes(extension) && !accepted.includes(file.type) ? t('unsupportedFile') : '';
      if (invalid) {
        errors.push(`${file.name}: ${invalid}`);
        uploadResults.push({ name: file.name, message: invalid });
        progress.value += 1;
        renderUploadResults();
        continue;
      }
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
        if (!response.ok) throw new Error(payload.reject_reason || payload.error || response.statusText);
        uploaded += 1;
        uploadResults.push({ name: file.name, message: payload.classification?.status === 'parked_crm' ? t('parked') : t('uploaded') });
      } catch (err) {
        const reason = err.message || t('uploadFailed');
        errors.push(`${file.name}: ${reason}`);
        uploadResults.push({ name: file.name, message: reason });
      }
      progress.value += 1;
      renderUploadResults();
    }
    let refreshError = '';
    try {
      await loadPack();
      render();
    } catch (err) {
      refreshError = t('refreshFailed', { reason: err.message });
    } finally {
      setUploading(false);
      renderUploadResults();
      const currentProgress = container.querySelector('#onboardingUploadProgress');
      currentProgress.hidden = false;
      currentProgress.max = files.length;
      currentProgress.value = files.length;
    }
    setStatus(t('summary', { uploaded, failed: errors.length, refreshError }), errors.length > 0 || Boolean(refreshError));
  }

  async function confirmDocument(documentId, type) {
    requireWriteAuthority();
    if (!type) throw new Error('Select a checklist slot before confirming.');
    const { error } = await supabase.rpc('confirm_onboarding_document', {
      p_document_id: documentId,
      p_type: type
    });
    if (error) throw error;
    await loadPack();
    render();
    setStatus(`Confirmed as ${slotLabel(type)}.`);
    statusEl.focus();
  }

  async function unconfirmDocument(documentId) {
    requireWriteAuthority();
    const { error } = await supabase.rpc('unconfirm_onboarding_document', {
      p_document_id: documentId
    });
    if (error) throw error;
    await loadPack();
    render();
    setStatus('Confirmation cleared.');
  }

  async function previewDocument(documentId) {
    requireWriteAuthority();
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
    const url = new URL(payload.signedUrl);
    const base = new URL(config.supabaseUrl);
    const localHttp = base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (url.origin !== base.origin || (url.protocol !== 'https:' && !localHttp) || url.username || url.password ||
        !url.pathname.startsWith(`/storage/v1/object/sign/campaign-private/onboarding/${encodeURIComponent(clientId)}/`)) {
      throw new Error(t('unsafePreview'));
    }
    // A deliberate link avoids popup blockers after async authorization. Never embed untrusted SVG/HTML.
    setStatus(t('previewReady'));
    const link = document.createElement('a');
    link.textContent = t('openPreview');
    link.href = url.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    statusEl.append(' ', link);
    link.focus();
    setTimeout(() => link.remove(), 60000);
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
    return `<section class="onboarding-dropzone" id="onboardingDropzone" tabindex="0" aria-label="${escapeHtml(t('uploadLabel'))}" aria-describedby="onboardingDropHint">
      <p id="onboardingDropHint">${escapeHtml(t('dropHint'))}</p>
      <p class="note">${escapeHtml(t('typesHint'))}</p>
      <input id="onboardingFileInput" type="file" multiple accept="${ACCEPT}" hidden />
      <button type="button" class="button secondary" id="onboardingPickFiles">${escapeHtml(t('chooseFiles'))}</button>
      <progress id="onboardingUploadProgress" aria-label="${escapeHtml(t('uploadProgress'))}" hidden></progress>
      <ul id="onboardingUploadResults" aria-label="${escapeHtml(t('uploadResults'))}"></ul>
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
      dropzone.addEventListener('keydown', event => {
        if (event.target === dropzone && ['Enter', ' '].includes(event.key)) {
          event.preventDefault();
          if (!uploading) fileInput?.click();
        }
      });
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
        <p id="onboardingPackStatus" class="note" role="status" aria-atomic="true" tabindex="-1"></p>
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
