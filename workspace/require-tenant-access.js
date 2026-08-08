/**
 * Gate canonical Hacker Dojo campaign data behind authenticated membership.
 * Public visitors see product shell + published multi-tenant chrome; HD pipeline
 * tables/metrics require membership on org_hacker_dojo (or master_admin).
 */
import {
  createWorkspaceClient,
  getRecoveredSession,
  getRuntimeConfig
} from './session.js';

export const HACKER_DOJO_CLIENT_ID = 'org_hacker_dojo';
export const HACKER_DOJO_SLUG = 'hacker-dojo';

function publicClientSlug() {
  const cfg = getRuntimeConfig();
  return (
    new URLSearchParams(location.search).get('client') ||
    cfg.defaultClientSlug ||
    HACKER_DOJO_SLUG
  );
}

/**
 * @param {object} [opts]
 * @param {string} [opts.clientId] default org_hacker_dojo
 * @param {string[]} [opts.revealSelectors] elements to show when authorized
 * @param {string} [opts.gateSelector] container for sign-in gate
 * @returns {Promise<{ authorized: boolean, reason?: string, session?: object, clientId: string }>}
 */
export async function requireTenantAccess(opts = {}) {
  const clientId = opts.clientId || HACKER_DOJO_CLIENT_ID;
  const revealSelectors = opts.revealSelectors || ['.tenant-data-root', '[data-tenant-data]'];
  const gateSelector = opts.gateSelector || '#tenantAuthGate';
  const slug = publicClientSlug();

  const hideTenantData = () => {
    for (const sel of revealSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
      });
    }
  };

  const hidePublicShell = () => {
    document.querySelectorAll('[data-public-shell]').forEach((el) => {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    });
  };

  const showPublicShell = () => {
    document.querySelectorAll('[data-public-shell]').forEach((el) => {
      el.hidden = false;
      el.removeAttribute('aria-hidden');
    });
  };

  const showTenantData = () => {
    for (const sel of revealSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        el.hidden = false;
        el.removeAttribute('aria-hidden');
      });
    }
    hidePublicShell();
    const gate = document.querySelector(gateSelector);
    if (gate) {
      gate.hidden = true;
      gate.setAttribute('aria-hidden', 'true');
    }
  };

  const showGate = (reason) => {
    hideTenantData();
    showPublicShell();
    const gate = document.querySelector(gateSelector);
    if (gate) {
      gate.hidden = false;
      gate.removeAttribute('aria-hidden');
      const reasonEl = gate.querySelector('[data-gate-reason]');
      if (reasonEl && reason) reasonEl.textContent = reason;
    }
  };

  const hideGateOnly = () => {
    hideTenantData();
    showPublicShell();
    const gate = document.querySelector(gateSelector);
    if (gate) {
      gate.hidden = true;
      gate.setAttribute('aria-hidden', 'true');
    }
  };

  // Always start with HD pipeline payloads hidden; keep public shell for a11y/main visibility.
  hideTenantData();
  showPublicShell();

  // Non-HD published tenants: product/module shell is public; do not force HD login gate.
  // Canonical HD tables stay hidden (no leak).
  if (
    clientId === HACKER_DOJO_CLIENT_ID &&
    slug !== HACKER_DOJO_SLUG &&
    slug !== HACKER_DOJO_CLIENT_ID
  ) {
    hideGateOnly();
    return { authorized: false, reason: 'non_hd_public_shell', clientId, publicSlug: slug };
  }

  const cfg = getRuntimeConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    showGate('Workspace authentication is not configured on this deploy.');
    return { authorized: false, reason: 'not_configured', clientId };
  }

  try {
    const client = createWorkspaceClient();
    const session = await getRecoveredSession(client);
    if (!session?.access_token) {
      showGate('Sign in with a Hacker Dojo operator account to view this tenant’s campaign data.');
      return { authorized: false, reason: 'unauthenticated', clientId };
    }

    const { data: context, error } = await client.rpc('get_workspace_context');
    if (error) throw error;

    const isMaster = Boolean(context?.is_master_admin);
    const clients = Array.isArray(context?.clients) ? context.clients : [];
    const member = clients.find((c) => c.id === clientId && c.active !== false);

    if (!isMaster && !member) {
      showGate('Your account is signed in but is not a member of this tenant. Contact a platform administrator.');
      return { authorized: false, reason: 'not_member', session, clientId };
    }

    showTenantData();
    document.documentElement.dataset.tenantAccess = clientId;
    try {
      const { loadPublicConfig } = await import('../public-client-config.js');
      if (typeof loadPublicConfig === 'function') await loadPublicConfig();
    } catch {
      /* optional */
    }
    return {
      authorized: true,
      session,
      clientId,
      role: member?.role || (isMaster ? 'master_admin' : null),
      isMasterAdmin: isMaster
    };
  } catch (err) {
    console.warn('requireTenantAccess failed', err);
    showGate('Unable to verify access. Try signing in again from the workspace.');
    return { authorized: false, reason: 'error', clientId };
  }
}

export function workspaceLoginHref() {
  const next = encodeURIComponent(location.pathname + location.search + location.hash);
  return `workspace.html?next=${next}`;
}
