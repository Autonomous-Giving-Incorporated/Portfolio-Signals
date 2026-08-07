import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

/** Static fallback = reference tenant (Hacker Dojo), not product identity. */
const FALLBACK = {
  organization_name: 'Hacker Dojo',
  product_name: 'Portfolio Signals',
  campaign_title: 'Keep the room where builders become possible.',
  campaign_tagline: 'Come home. Build something. Fund the next builder.',
  modules: { sponsors: true, grants: true },
  theme: { primary: '#C9141C', accent: '#A9003A', background: '#303030' },
  assets: { logo_path: null, icon_path: null, hero_path: null },
  tenant_label: 'Tenant',
};
const BUCKET = 'agi-public-assets';
const escapeHtml = (value = '') =>
  String(value).replace(/[&<>'"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])
  );
const validColor = (value, fallback) =>
  /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;

/** Prefer AGI platform config; keep legacy aliases for older deploys. */
function getConfig() {
  return window.AGI_PORTFOLIO_SIGNALS_CONFIG || window.AGI_FUND_INTEL_CONFIG || window.HACKER_DOJO_CONFIG || window.__HD_CONFIG__ || {};
}

function clientSlug() {
  return (
    new URLSearchParams(location.search).get('client') ||
    getConfig().defaultClientSlug ||
    'hacker-dojo'
  );
}

/** Static tenant pack under assets/tenants/<slug>/ (icon + theme.css). */
function tenantAssetBase(slug) {
  return `assets/tenants/${encodeURIComponent(slug)}`;
}

function ensureTenantTheme(slug) {
  const id = 'agi-tenant-theme';
  let link = document.getElementById(id);
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = `${tenantAssetBase(slug)}/theme.css?v=1`;
}

function assetUrl(path) {
  const { supabaseUrl } = getConfig();
  return path && supabaseUrl
    ? `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(path).replaceAll('%2F', '/')}`
    : '';
}

function safeConfig(raw = {}) {
  return {
    organization_name: String(raw.organization_name || FALLBACK.organization_name).slice(0, 100),
    product_name: String(raw.product_name || FALLBACK.product_name).slice(0, 100),
    campaign_title: String(raw.campaign_title || FALLBACK.campaign_title).slice(0, 160),
    campaign_tagline: String(raw.campaign_tagline || FALLBACK.campaign_tagline).slice(0, 280),
    modules: {
      sponsors: raw.modules?.sponsors !== false,
      grants: raw.modules?.grants !== false,
    },
    theme: {
      primary: validColor(raw.theme?.primary, FALLBACK.theme.primary),
      accent: validColor(raw.theme?.accent, FALLBACK.theme.accent),
      background: validColor(raw.theme?.background, FALLBACK.theme.background),
    },
    assets: {
      logo_path: raw.assets?.logo_path || null,
      icon_path: raw.assets?.icon_path || null,
      hero_path: raw.assets?.hero_path || null,
    },
  };
}

function applyPublicConfig(config) {
  const safe = safeConfig(config);
  const slug = clientSlug();

  // Tenant identity is data-tenant + tenant asset pack — never product chrome.
  document.documentElement.dataset.tenant = slug;
  ensureTenantTheme(slug);

  document.documentElement.style.setProperty('--brand-red', safe.theme.primary);
  document.documentElement.style.setProperty('--brand-teal', safe.theme.accent);
  document.documentElement.style.setProperty('--brand-navy', safe.theme.background);

  // Product identity stays AGI Portfolio Signals; organization is the tenant.
  document.querySelectorAll('title').forEach((node) => {
    node.textContent = `AGI Portfolio Signals · ${safe.organization_name}`;
  });
  document.querySelectorAll('.tenant-product').forEach((node) => {
    node.textContent = safe.product_name;
  });
  document.querySelectorAll('.tenant-chip').forEach((node) => {
    node.setAttribute('aria-label', `Tenant: ${safe.organization_name}`);
    const mark = node.querySelector('.tenant-mark');
    const label = `Tenant · ${safe.organization_name}`;
    if (mark) {
      node.replaceChildren(mark, document.createTextNode(` ${label}`));
    } else {
      node.textContent = label;
    }
  });
  document.querySelectorAll('[data-tenant-name]').forEach((node) => {
    // Footer may include "Tenant ·" prefix already in parent; set org name only.
    node.textContent = node.dataset.tenantPrefix
      ? `${node.dataset.tenantPrefix}${safe.organization_name}`
      : safe.organization_name;
  });
  document.querySelectorAll('h1').forEach((node, index) => {
    if (index === 0 && safe.campaign_title) node.textContent = safe.campaign_title;
  });
  document.querySelectorAll('.lede, .cta-line').forEach((node, index) => {
    if (index === 0 && safe.campaign_tagline) node.textContent = safe.campaign_tagline;
  });

  // Prefer published storage assets; else static tenant pack icon.
  const remoteMark = assetUrl(safe.assets.logo_path || safe.assets.icon_path);
  const localMark = `${tenantAssetBase(slug)}/icon.svg`;
  const markSrc = remoteMark || localMark;
  document.querySelectorAll('.tenant-mark').forEach((img) => {
    img.src = markSrc;
    img.alt = safe.organization_name;
  });

  const icon = assetUrl(safe.assets.icon_path) || localMark;
  document.querySelectorAll('link[rel="icon"]').forEach((link) => {
    // Keep AGI product favicon on suite chrome; only override when tenant publishes icon.
    if (safe.assets.icon_path) link.href = icon;
  });

  const hero = assetUrl(safe.assets.hero_path);
  if (hero) {
    document.querySelector('.site-header')?.style.setProperty('--client-hero-image', `url("${hero}")`);
  }

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
    console.warn('Using static reference-tenant config fallback', error);
    applyPublicConfig(FALLBACK);
  }
}

loadPublicConfig();
