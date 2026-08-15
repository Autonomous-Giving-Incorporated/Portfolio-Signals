/**
 * Supabase-backed director auth for allocation middleware.
 * Pattern aligned with services/import-api (Bearer → auth/v1/user → membership).
 */

const WRITE_ROLES = new Set(['director', 'campaign_lead']);

export function decodeJwtPayload(token) {
  try {
    const encoded = String(token).split('.')[1];
    if (!encoded) return {};
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    return JSON.parse(atob(padded + pad));
  } catch {
    return {};
  }
}

export function headerValue(req, name) {
  const headers = req?.headers;
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  return headers[name.toLowerCase()] || headers[name] || '';
}

export function bearerToken(req) {
  const authorization = headerValue(req, 'authorization');
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
   * Resolve membership role for the bound clientId.
   * Tenant membership is required. A leftover profiles.role must not authorize
   * another org. Membership rows are read with the service role so RLS cannot
   * hide an existing grant (user JWT identifies the actor only).
   */
  async function getAuthorization(_accessToken, userId) {
    const headers = {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: 'application/json',
    };

    // Profile lifecycle is authoritative even when a membership remains active.
    const profUrl =
      `${supabaseUrl}/rest/v1/profiles` +
      `?select=role,active,mfa_enforced,display_name` +
      `&id=eq.${encodeURIComponent(userId)}` +
      `&limit=1`;
    const profRes = await fetchImpl(profUrl, { headers });
    if (!profRes.ok) return null;
    const profiles = await profRes.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile?.active) return null;

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
      const membership = Array.isArray(rows) ? rows[0] : null;
      if (membership?.role && membership.client_id === clientId) {
        return {
          role: membership.role,
          source: 'client_memberships',
          displayName: profile.display_name,
          mfaEnforced: profile.mfa_enforced === true,
        };
      }
    }

    // Tenant membership is required. A leftover profiles.role must not
    // authorize writes against a different bound ORG_ID.
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
      const membership = await getAuthorization(token, user.id);
      if (!membership) return null;
      const role = membership.role;
      const aal = decodeJwtPayload(token).aal || 'aal1';
      return {
        user,
        role,
        canRead: true,
        canWrite: writeRoles.has(role) && membership.mfaEnforced && aal === 'aal2',
        aal,
        mfaEnforced: membership.mfaEnforced,
        email: user.email || '',
        displayName: membership.displayName || user.email || user.id,
        clientId,
        source: membership.source,
      };
    },
  };
}

export { WRITE_ROLES };
