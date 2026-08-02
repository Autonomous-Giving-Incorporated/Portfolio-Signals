import { getRuntimeConfig, requireWorkspaceSession, roleCan } from './session.js';

const BUCKET = 'agi-public-assets';
const FALLBACK_CONFIG = {
  organization_name: 'Hacker Dojo',
  product_name: 'Campaign Control Center',
  campaign_title: 'Keep the room where builders become possible.',
  campaign_tagline: 'Come home. Build something. Fund the next builder.',
  modules: { sponsors: true, grants: true },
  theme: { primary: '#ED1C24', accent: '#33D6C5', background: '#071725' },
  assets: { logo_path: null, icon_path: null, hero_path: null }
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
function storageUrl(path) {
  const { supabaseUrl } = getRuntimeConfig();
  return path && supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path).replaceAll('%2F', '/')}` : '';
}
function safeConfig(config = {}) {
  return {
    organization_name: String(config.organization_name || FALLBACK_CONFIG.organization_name).slice(0, 100),
    product_name: String(config.product_name || FALLBACK_CONFIG.product_name).slice(0, 100),
    campaign_title: String(config.campaign_title || '').slice(0, 160),
    campaign_tagline: String(config.campaign_tagline || '').slice(0, 280),
    modules: { sponsors: config.modules?.sponsors !== false, grants: config.modules?.grants !== false },
    theme: {
      primary: /^#[0-9a-f]{6}$/i.test(config.theme?.primary) ? config.theme.primary : FALLBACK_CONFIG.theme.primary,
      accent: /^#[0-9a-f]{6}$/i.test(config.theme?.accent) ? config.theme.accent : FALLBACK_CONFIG.theme.accent,
      background: /^#[0-9a-f]{6}$/i.test(config.theme?.background) ? config.theme.background : FALLBACK_CONFIG.theme.background
    },
    assets: { logo_path: config.assets?.logo_path || null, icon_path: config.assets?.icon_path || null, hero_path: config.assets?.hero_path || null }
  };
}

export async function mountBrandConfiguration(root) {
  const { supabase, selectedClient, profile, session } = await requireWorkspaceSession();
  if (!selectedClient?.id || !roleCan(profile.role, 'brand_configuration')) throw new Error('Director role required for Brand & content configuration.');
  root.innerHTML = '<p>Loading brand configuration…</p>';
  const [versionsResult, assetsResult] = await Promise.all([
    supabase.from('client_config_versions').select('*').eq('client_id', selectedClient.id).order('version', { ascending: false }),
    supabase.from('client_assets').select('*').eq('client_id', selectedClient.id).is('deleted_at', null).order('created_at', { ascending: false })
  ]);
  if (versionsResult.error) throw versionsResult.error;
  if (assetsResult.error) throw assetsResult.error;
  let versions = versionsResult.data || [];
  const assets = assetsResult.data || [];
  let current = safeConfig((versions.find(v => v.state === 'draft') || versions.find(v => v.state === 'published') || {}).config);
  root.innerHTML = `<div class="config-workspace"><div class="panel-heading"><div><p class="eyebrow">Director only</p><h2>Brand, content & onboarding</h2></div><span class="tag">MFA governed</span></div><p class="note">Draft, publish, rollback, select fundraising modules, and upload governed public assets for ${escapeHtml(selectedClient.display_name)}. Use non-sensitive public copy only.</p><form id="clientConfigForm" class="config-form"><label>Organization name <input name="organization_name" maxlength="100" required></label><label>Product name <input name="product_name" maxlength="100" required></label><label>Campaign title <input name="campaign_title" maxlength="160"></label><label>Campaign tagline <textarea name="campaign_tagline" maxlength="280" rows="3"></textarea></label><fieldset><legend>Enabled fundraising modules</legend><label><input name="module_sponsors" type="checkbox"> Sponsor pipeline</label><label><input name="module_grants" type="checkbox"> Grant pipeline</label></fieldset><div class="control-grid"><label>Primary <input name="primary" type="color"></label><label>Accent <input name="accent" type="color"></label><label>Background <input name="background" type="color"></label></div><div class="control-grid">${['logo_path', 'icon_path', 'hero_path'].map(name => `<label>${name.replace('_path', '')} asset <select name="${name}"><option value="">Static fallback</option>${assets.map(asset => `<option value="${escapeHtml(asset.storage_path)}">${escapeHtml(asset.asset_kind)} · ${escapeHtml(asset.alt_text || asset.storage_path)}</option>`).join('')}</select></label>`).join('')}</div><label>Required rationale <textarea name="rationale" minlength="12" required rows="3" placeholder="Explain why this change is safe and approved."></textarea></label><div class="config-actions"><button class="button" data-action="save" type="button">Save draft</button><button class="button secondary" data-action="publish" type="button">Publish selected draft</button></div></form><aside class="config-preview" id="configPreview"></aside><section><h3>Asset upload</h3><form id="assetUploadForm" class="config-form"><label>Kind <select name="asset_kind"><option>logo</option><option>icon</option><option>hero</option><option>background</option><option>document</option></select></label><label>Alt text <input name="alt_text" maxlength="160"></label><label>File <input name="asset" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,application/pdf" required></label><button class="button secondary">Upload asset</button></form></section><section><h3>Version history</h3><div id="versionHistory" class="version-list"></div></section><p id="configMessage" class="note" role="status"></p></div>`;
  const form = root.querySelector('#clientConfigForm');
  const msg = root.querySelector('#configMessage');
  const readForm = () => safeConfig({ organization_name: form.elements.organization_name.value.trim(), product_name: form.elements.product_name.value.trim(), campaign_title: form.elements.campaign_title.value.trim(), campaign_tagline: form.elements.campaign_tagline.value.trim(), modules: { sponsors: form.elements.module_sponsors.checked, grants: form.elements.module_grants.checked }, theme: { primary: form.elements.primary.value, accent: form.elements.accent.value, background: form.elements.background.value }, assets: { logo_path: form.elements.logo_path.value || null, icon_path: form.elements.icon_path.value || null, hero_path: form.elements.hero_path.value || null } });
  const renderPreview = () => { current = readForm(); root.querySelector('#configPreview').innerHTML = `<div style="--preview-bg:${current.theme.background};--preview-primary:${current.theme.primary};--preview-accent:${current.theme.accent}" class="brand-preview">${current.assets.logo_path ? `<img src="${escapeHtml(storageUrl(current.assets.logo_path))}" alt="">` : ''}<p>${escapeHtml(current.organization_name)}</p><h3>${escapeHtml(current.campaign_title || current.product_name)}</h3><span>${escapeHtml(current.campaign_tagline)}</span></div>`; };
  const setForm = (config) => { current = safeConfig(config); for (const key of ['organization_name', 'product_name', 'campaign_title', 'campaign_tagline']) form.elements[key].value = current[key]; form.elements.module_sponsors.checked = current.modules.sponsors; form.elements.module_grants.checked = current.modules.grants; form.elements.primary.value = current.theme.primary; form.elements.accent.value = current.theme.accent; form.elements.background.value = current.theme.background; form.elements.logo_path.value = current.assets.logo_path || ''; form.elements.icon_path.value = current.assets.icon_path || ''; form.elements.hero_path.value = current.assets.hero_path || ''; renderPreview(); };
  const renderVersions = () => { root.querySelector('#versionHistory').innerHTML = versions.map(v => `<article><button class="button secondary" data-load-version="${v.version}" type="button">Load v${v.version}</button> <strong>${escapeHtml(v.state)}</strong> <small>${escapeHtml(v.created_at || '')}</small> ${v.state !== 'draft' ? `<button class="button secondary" data-rollback-version="${v.version}" type="button">Rollback to v${v.version}</button>` : ''}</article>`).join('') || '<p class="note">No versions yet.</p>'; };
  form.addEventListener('input', renderPreview);
  root.addEventListener('click', async (event) => {
    const load = event.target.closest('[data-load-version]');
    const rollback = event.target.closest('[data-rollback-version]');
    const action = event.target.closest('[data-action]')?.dataset.action;
    try {
      if (load) setForm(versions.find(v => String(v.version) === load.dataset.loadVersion)?.config || current);
      if (action === 'save') { const { data, error } = await supabase.rpc('save_client_config_draft', { p_client_id: selectedClient.id, p_config: readForm(), p_rationale: form.elements.rationale.value.trim() }); if (error) throw error; versions.unshift(data); msg.textContent = `Draft v${data.version} saved.`; renderVersions(); }
      if (action === 'publish') { const draft = versions.find(v => v.state === 'draft'); if (!draft) throw new Error('Save a draft before publishing.'); const { data, error } = await supabase.rpc('publish_client_config', { p_version_id: draft.id, p_rationale: form.elements.rationale.value.trim() }); if (error) throw error; versions = versions.map(v => v.id === data.id ? data : (v.state === 'published' ? { ...v, state: 'archived' } : v)); msg.textContent = `Published v${data.version}.`; renderVersions(); }
      if (rollback) { const { data, error } = await supabase.rpc('rollback_client_config', { p_client_id: selectedClient.id, p_source_version: Number(rollback.dataset.rollbackVersion), p_rationale: form.elements.rationale.value.trim() }); if (error) throw error; versions.unshift(data); msg.textContent = `Rolled back as v${data.version}.`; renderVersions(); }
    } catch (error) { msg.textContent = error.message; }
  });
  root.querySelector('#assetUploadForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try { const body = new FormData(event.currentTarget); body.set('client_id', selectedClient.id); const response = await fetch(`${getRuntimeConfig().supabaseUrl}/functions/v1/upload-client-asset`, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Upload failed'); msg.textContent = `Uploaded ${payload.asset.storage_path}. Reload to use it.`; } catch (error) { msg.textContent = error.message; }
  });
  setForm(current);
  renderVersions();
}
