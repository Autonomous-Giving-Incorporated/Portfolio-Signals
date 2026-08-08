import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

/** Static fallback = reference tenant (Hacker Dojo), not product identity. Only after tenant auth. */
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

/** Product-only shell when public visitor is on default/HD without auth and no published config. */
const PRODUCT_SHELL = {
  organization_name: 'Portfolio Signals',
  product_name: 'Portfolio Signals',
  campaign_title: 'Decision workspace',
  campaign_tagline: 'Sign in to access canonical data for your client tenant.',
  modules: { sponsors: false, grants: false },
  theme: { primary: '#112233', accent: '#2a5bd7', background: '#f6f7f9' },
  assets: {},
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

function isAuthenticatedWorkspace() {
  return (
    document.body.classList.contains('workspace-shell') &&
    Boolean(document.getElementById('workspace') && !document.getElementById('workspace')?.hidden)
  );
}

function isTenantDataAuthorized() {
  const access = document.documentElement.dataset.tenantAccess;
  const slug = clientSlug();
  return (
    access === 'org_hacker_dojo' ||
    access === slug ||
    isAuthenticatedWorkspace()
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
    organization_name: String(raw.organization_name || PRODUCT_SHELL.organization_name).slice(0, 100),
    product_name: String(raw.product_name || PRODUCT_SHELL.product_name).slice(0, 100),
    campaign_title: String(raw.campaign_title || PRODUCT_SHELL.campaign_title).slice(0, 160),
    campaign_tagline: String(raw.campaign_tagline || PRODUCT_SHELL.campaign_tagline).slice(0, 280),
    modules: {
      sponsors: raw.modules?.sponsors === true,
      grants: raw.modules?.grants === true,
    },
    theme: {
      primary: validColor(raw.theme?.primary, PRODUCT_SHELL.theme.primary),
      accent: validColor(raw.theme?.accent, PRODUCT_SHELL.theme.accent),
      background: validColor(raw.theme?.background, PRODUCT_SHELL.theme.background),
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
  const authenticatedWorkspace = isAuthenticatedWorkspace();

  document.documentElement.dataset.tenant = slug;
  ensureTenantTheme(slug);

  document.documentElement.style.setProperty('--brand-red', safe.theme.primary);
  document.documentElement.style.setProperty('--brand-teal', safe.theme.accent);
  document.documentElement.style.setProperty('--brand-navy', safe.theme.background);

  document.querySelectorAll('title').forEach((node) => {
    // Public titles include org when published config is applied; workspace always includes org.
    node.textContent = `AGI Portfolio Signals · ${safe.organization_name}`;
  });
  // Product chrome (.brand-product) stays Portfolio Signals; optional .tenant-product may show client product name.
  document.querySelectorAll('.tenant-product').forEach((node) => {
    node.textContent = safe.product_name;
  });

  // Tenant chrome chips: authenticated workspace only (not public product shell).
  document.querySelectorAll('.tenant-chip, [data-tenant-chip], .workspace-tenant-lockup').forEach((node) => {
    if (!authenticatedWorkspace) {
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
      return;
    }
    node.hidden = false;
    node.removeAttribute('aria-hidden');
    node.setAttribute('aria-label', `Tenant: ${safe.organization_name}`);
    const mark = node.querySelector('.tenant-mark');
    const label = `Tenant · ${safe.organization_name}`;
    if (node.classList.contains('tenant-chip') || node.hasAttribute('data-tenant-chip')) {
      if (mark) {
        node.replaceChildren(mark, document.createTextNode(` ${label}`));
      } else if (!node.querySelector('[data-tenant-name]')) {
        node.textContent = label;
      }
    }
  });

  if (authenticatedWorkspace) {
    document.querySelectorAll('[data-tenant-name]').forEach((node) => {
      node.textContent = node.dataset.tenantPrefix
        ? `${node.dataset.tenantPrefix}${safe.organization_name}`
        : safe.organization_name;
    });
  }

  // Published campaign copy is public projection (not pipeline rows / registry).
  document.querySelectorAll('h1').forEach((node, index) => {
    if (index === 0 && safe.campaign_title) node.textContent = safe.campaign_title;
  });
  document.querySelectorAll('.lede, .cta-line').forEach((node, index) => {
    if (index === 0 && safe.campaign_tagline) node.textContent = safe.campaign_tagline;
  });

  const remoteMark = assetUrl(safe.assets.logo_path || safe.assets.icon_path);
  const localMark = `${tenantAssetBase(slug)}/icon.svg`;
  const markSrc = remoteMark || localMark;
  document.querySelectorAll('.tenant-mark').forEach((img) => {
    img.src = markSrc;
    img.alt = safe.organization_name;
  });

  const icon = assetUrl(safe.assets.icon_path) || localMark;
  document.querySelectorAll('link[rel="icon"]').forEach((link) => {
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
    const main = document.querySelector('main');
    if (main) {
      main.hidden = false;
      main.removeAttribute('aria-hidden');
      main.innerHTML = `<section class="panel"><p class="eyebrow">Module not enabled</p><h1>${escapeHtml(safe.organization_name)}</h1><p>This fundraising module has not been enabled during client onboarding for this tenant.</p><a class="button" href="index.html?client=${encodeURIComponent(slug)}">Return to overview</a></section>`;
    }
  }
}

export async function loadPublicConfig() {
  const runtime = getConfig();
  const slug = clientSlug();
  const authorized = isTenantDataAuthorized();

  if (!runtime.supabaseUrl || !runtime.supabaseAnonKey) {
    // No platform: tests/mocks inject createClient via acceptance harness.
    // Without RPC, only apply HD FALLBACK when authorized; else product shell.
    applyPublicConfig(authorized ? FALLBACK : PRODUCT_SHELL);
    return;
  }
  try {
    const supabase = createClient(runtime.supabaseUrl, runtime.supabaseAnonKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.rpc('get_public_client_config', {
      p_slug: slug,
    });
    if (error || !data?.config) throw error || new Error('No published client config');
    applyPublicConfig(data.config);
  } catch (error) {
    console.warn('Public client config unavailable', error);
    // Never paint static HD identity onto an unauthenticated public shell.
    if (authorized) applyPublicConfig(FALLBACK);
    else applyPublicConfig(PRODUCT_SHELL);
  }
}

loadPublicConfig();
