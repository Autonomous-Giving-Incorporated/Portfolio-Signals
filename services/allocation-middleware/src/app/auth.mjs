/**
 * Supabase-backed director auth for allocation middleware.
 * Pattern aligned with services/import-api (Bearer → auth/v1/user → membership).
 */

const WRITE_ROLES = new Set(['director', 'campaign_lead']);

export function bearerToken(req) {
  const authorization = req.headers.authorization;
  const match = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(\S+)$/i) : null;
  return match?.[1] || null;
}

/**
 * @param {object} opts
 * @param {string} opts.supabaseUrl
 * @param {string} opts.serviceRoleKey
 * @param {string} opts.clientId  e.g. org_hacker_dojo
 * @param {typeof fetch} [opts.fetchImpl]
 */
export function createAuthVerifier({
  supabaseUrl,
  serviceRoleKey,
  clientId,
  fetchImpl = fetch,
  writeRoles = WRITE_ROLES,
}) {
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  async function getUser(accessToken) {
    const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) return null;
    const user = await response.json();
    if (!user?.id) return null;
    return user;
  }

  /**
   * Resolve membership role for clientId.
   * Prefer client_memberships; fall back to profiles.role for single-tenant legacy.
   */
  async function getMembership(accessToken, userId) {
    const headers = {
      apikey: serviceRoleKey,
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    };

    // Tenant membership (AGI multi-client)
    const memUrl =
      `${supabaseUrl}/rest/v1/client_memberships` +
      `?select=role,active,client_id` +
      `&client_id=eq.${encodeURIComponent(clientId)}` +
      `&user_id=eq.${encodeURIComponent(userId)}` +
      `&active=eq.true` +
      `&limit=1`;
    const memRes = await fetchImpl(memUrl, { headers });
    if (memRes.ok) {
      const rows = await memRes.json();
      if (Array.isArray(rows) && rows[0]?.role) {
        return { role: rows[0].role, source: 'client_memberships' };
      }
    }

    // Legacy profile role on same project
    const profUrl =
      `${supabaseUrl}/rest/v1/profiles` +
      `?select=role,active,display_name` +
      `&id=eq.${encodeURIComponent(userId)}` +
      `&limit=1`;
    const profRes = await fetchImpl(profUrl, { headers });
    if (profRes.ok) {
      const rows = await profRes.json();
      if (Array.isArray(rows) && rows[0]?.active && rows[0]?.role) {
        return {
          role: rows[0].role,
          displayName: rows[0].display_name,
          source: 'profiles',
        };
      }
    }
    return null;
  }

  return {
    /**
     * @returns {Promise<null | { user, role, canWrite, email, displayName }>}
     */
    async resolve(req) {
      const token = bearerToken(req);
      if (!token) return null;
      const user = await getUser(token);
      if (!user) return null;
      const membership = await getMembership(token, user.id);
      if (!membership) return null;
      const role = membership.role;
      return {
        user,
        role,
        canWrite: writeRoles.has(role),
        email: user.email || '',
        displayName: membership.displayName || user.email || user.id,
        clientId,
        source: membership.source,
      };
    },
  };
}

export { WRITE_ROLES };
