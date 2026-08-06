import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

/** Static fallback = reference tenant (Hacker Dojo), not product identity. */
const FALLBACK = {
  organization_name: 'Hacker Dojo',
  product_name: 'Fund Intel',
  campaign_title: 'Keep the room where builders become possible.',
  campaign_tagline: 'Come home. Build something. Fund the next builder.',
  modules: { sponsors: true, grants: true },
  theme: { primary: '#ED1C24', accent: '#33D6C5', background: '#071725' },
  assets: { logo_path: null, icon_path: null, hero_path: null },
  tenant_label: 'Tenant',
};
const BUCKET = 'agi-public-assets';
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({ '&': '&', '<': '<', '>': '>', "'": '&#39;', '"': '"' }[c]));
const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
/** Prefer AGI platform config; keep HD aliases for older deploys. */
function getConfig() {
  return window.AGI_FUND_INTEL_CONFIG || window.HACKER_DOJO_CONFIG || window.__HD_CONFIG__ || {};
}
function clientSlug() {
  return new URLSearchParams(location.search).get('client') || getConfig().defaultClientSlug || 'hacker-dojo';
}
function assetUrl(path) { const { supabaseUrl } = getConfig(); return path && supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path).replaceAll('%2F', '/')}` : ''; }
function safeConfig(raw = {}) {
  return { organization_name: String(raw.organization_name || FALLBACK.organization_name).slice(0, 100), product_name: String(raw.product_name || FALLBACK.product_name).slice(0, 100), campaign_title: String(raw.campaign_title || FALLBACK.campaign_title).slice(0, 160), campaign_tagline: String(raw.campaign_tagline || FALLBACK.campaign_tagline).slice(0, 280), modules: { sponsors: raw.modules?.sponsors !== false, grants: raw.modules?.grants !== false }, theme: { primary: validColor(raw.theme?.primary, FALLBACK.theme.primary), accent: validColor(raw.theme?.accent, FALLBACK.theme.accent), background: validColor(raw.theme?.background, FALLBACK.theme.background) }, assets: { logo_path: raw.assets?.logo_path || null, icon_path: raw.assets?.icon_path || null, hero_path: raw.assets?.hero_path || null } };
}
function applyPublicConfig(config) {
  const safe = safeConfig(config);
  const slug = clientSlug();
  document.documentElement.style.setProperty('--brand-red', safe.theme.primary);
  document.documentElement.style.setProperty('--brand-teal', safe.theme.accent);
  document.documentElement.style.setProperty('--brand-navy', safe.theme.background);
  // Product identity stays AGI Fund Intel; organization is the tenant.
  document.querySelectorAll('title').forEach((node) => {
    node.textContent = `AGI Fund Intel · ${safe.organization_name}`;
  });
  document.querySelectorAll('.tenant-product').forEach((node) => {
    node.textContent = safe.product_name;
  });
  document.querySelectorAll('.tenant-chip').forEach((node) => {
    node.setAttribute('aria-label', `Tenant: ${safe.organization_name}`);
    const mark = node.querySelector('.tenant-mark');
    const label = `Tenant · ${safe.organization_name}`;
    if (mark) {
      node.replaceChildren(mark, document.createTextNode(label));
    } else {
      node.textContent = label;
    }
  });
  document.querySelectorAll('[data-tenant-name]').forEach((node) => {
    node.textContent = safe.organization_name;
  });
  document.querySelectorAll('h1').forEach((node, index) => {
    if (index === 0 && safe.campaign_title) node.textContent = safe.campaign_title;
  });
  document.querySelectorAll('.lede, .cta-line').forEach((node, index) => {
    if (index === 0 && safe.campaign_tagline) node.textContent = safe.campaign_tagline;
  });
  const logo = assetUrl(safe.assets.logo_path || safe.assets.icon_path);
  if (logo) {
    document.querySelectorAll('.tenant-mark').forEach((img) => {
      img.src = logo;
      img.alt = safe.organization_name;
    });
  }
  const icon = assetUrl(safe.assets.icon_path);
  if (icon) document.querySelectorAll('link[rel="icon"]').forEach((link) => { link.href = icon; });
  const hero = assetUrl(safe.assets.hero_path);
  if (hero) document.querySelector('.site-header')?.style.setProperty('--client-hero-image', `url("${hero}")`);
  for (const module of ['sponsors', 'grants']) {
    document.querySelectorAll(`[data-agi-module="${module}"]`).forEach((node) => {
      node.hidden = !safe.modules[module];
    });
  }
  document.querySelectorAll('a[href$=".html"]').forEach((link) => {
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin) {
      url.searchParams.set('client', slug);
      link.href = url.href;
    }
  });
  const required = document.body.dataset.requiredModule;
  if (required && safe.modules[required] === false) {
    document.querySelector('main').innerHTML = `<section class="panel"><p class="eyebrow">Module not enabled</p><h1>${escapeHtml(safe.organization_name)}</h1><p>This fundraising module has not been enabled during client onboarding for this tenant.</p><a class="button" href="index.html?client=${encodeURIComponent(slug)}">Return to overview</a></section>`;
  }
}
async function loadPublicConfig() {
  const runtime = getConfig();
  if (!runtime.supabaseUrl || !runtime.supabaseAnonKey) {
    applyPublicConfig(FALLBACK);
    return;
  }
  try {
    const supabase = createClient(runtime.supabaseUrl, runtime.supabaseAnonKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.rpc('get_public_client_config', {
      p_slug: clientSlug(),
    });
    if (error || !data?.config) throw error || new Error('No published client config');
    applyPublicConfig(data.config);
  } catch (error) {
    console.warn('Using static reference-tenant (Hacker Dojo) config fallback', error);
    applyPublicConfig(FALLBACK);
  }
}
loadPublicConfig();
