/**
 * Gate canonical tenant campaign data behind authenticated membership.
 * Public visitors see product shell only; Hacker Dojo (and other client) data
 * requires an active session with membership on that client or master_admin.
 */
import {
  createWorkspaceClient,
  getRecoveredSession,
  getRuntimeConfig
} from './session.js';

export const HACKER_DOJO_CLIENT_ID = 'org_hacker_dojo';
export const HACKER_DOJO_SLUG = 'hacker-dojo';

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

  const hideTenantData = () => {
    for (const sel of revealSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
      });
    }
  };

  const showTenantData = () => {
    for (const sel of revealSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        el.hidden = false;
        el.removeAttribute('aria-hidden');
      });
    }
    const gate = document.querySelector(gateSelector);
    if (gate) {
      gate.hidden = true;
      gate.setAttribute('aria-hidden', 'true');
    }
  };

  const showGate = (reason) => {
    hideTenantData();
    const gate = document.querySelector(gateSelector);
    if (gate) {
      gate.hidden = false;
      gate.removeAttribute('aria-hidden');
      const reasonEl = gate.querySelector('[data-gate-reason]');
      if (reasonEl && reason) reasonEl.textContent = reason;
    }
  };

  hideTenantData();

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
    // Re-apply published client config now that tenant data may be revealed.
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
