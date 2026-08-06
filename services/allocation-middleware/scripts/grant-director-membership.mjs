#!/usr/bin/env node
/**
 * Grant director (or campaign_lead) membership on ORG_ID for allocation pilot.
 *
 * Env (required):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Env (optional):
 *   ORG_ID=org_hacker_dojo
 *   DIRECTOR_EMAIL=...
 *   DIRECTOR_PASSWORD=...   # only used if user is created
 *   DIRECTOR_ROLE=director  # or campaign_lead
 *   CREATE_USER=1           # create auth user if missing (default 1)
 *
 * Usage:
 *   DIRECTOR_EMAIL=you@example.com node scripts/grant-director-membership.mjs
 *   node scripts/grant-director-membership.mjs --email you@example.com --role director
 */
import { randomBytes } from 'node:crypto';

function arg(name, fallback = '') {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return fallback;
}

const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const orgId = process.env.ORG_ID || 'org_hacker_dojo';
const email = (arg('--email', process.env.DIRECTOR_EMAIL || '')).trim().toLowerCase();
const role = arg('--role', process.env.DIRECTOR_ROLE || 'director');
const createUser = (process.env.CREATE_USER || '1') !== '0';
const password =
  process.env.DIRECTOR_PASSWORD ||
  arg('--password', '') ||
  `Pilot-${randomBytes(9).toString('base64url')}`;

if (!supabaseUrl || !serviceKey) {
  console.error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!email || !email.includes('@')) {
  console.error('Need DIRECTOR_EMAIL or --email');
  process.exit(1);
}
if (!['director', 'campaign_lead'].includes(role)) {
  console.error('Role must be director or campaign_lead');
  process.exit(1);
}

const adminHeaders = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
  'content-type': 'application/json',
  prefer: 'return=representation',
};

async function rest(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: { ...adminHeaders, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function findUserByEmail(targetEmail) {
  // Admin list is paginated; prefer invite lookup via generate link response.
  // Walk first pages for small pilot projects.
  for (let page = 1; page <= 20; page += 1) {
    const data = await rest(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = data?.users || data || [];
    if (!Array.isArray(users) || users.length === 0) break;
    const hit = users.find((u) => (u.email || '').toLowerCase() === targetEmail);
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

async function ensureUser() {
  let user = await findUserByEmail(email);
  if (user) {
    console.log(JSON.stringify({ msg: 'user_exists', id: user.id, email: user.email }));
    return { user, created: false, password: null };
  }
  if (!createUser) {
    throw new Error(`No auth user for ${email}; set CREATE_USER=1 or create in Supabase dashboard`);
  }
  const created = await rest('/auth/v1/admin/users', {
    method: 'POST',
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { source: 'allocation_middleware_pilot' },
    },
  });
  const id = created?.id || created?.user?.id;
  if (!id) throw new Error(`create user failed: ${JSON.stringify(created).slice(0, 300)}`);
  console.log(JSON.stringify({ msg: 'user_created', id, email }));
  return { user: { id, email }, created: true, password };
}

async function ensureClient() {
  const rows = await rest(
    `/rest/v1/clients?id=eq.${encodeURIComponent(orgId)}&select=id,slug,state&limit=1`,
  );
  if (Array.isArray(rows) && rows[0]) {
    console.log(JSON.stringify({ msg: 'client_exists', id: orgId, state: rows[0].state }));
    return;
  }
  await rest('/rest/v1/clients', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: {
      id: orgId,
      slug: 'hacker-dojo',
      display_name: 'Hacker Dojo',
      state: 'active',
    },
  });
  console.log(JSON.stringify({ msg: 'client_created', id: orgId }));
}

async function ensureProfile(userId) {
  const rows = await rest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,role,active&limit=1`,
  );
  if (Array.isArray(rows) && rows[0]) {
    if (!rows[0].active) {
      await rest(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { prefer: 'return=minimal' },
        body: { active: true },
      });
      console.log(JSON.stringify({ msg: 'profile_activated', id: userId }));
    } else {
      console.log(JSON.stringify({ msg: 'profile_exists', id: userId, role: rows[0].role }));
    }
    return;
  }
  // Minimal profile — columns vary by migration; send common fields only.
  try {
    await rest('/rest/v1/profiles', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: {
        id: userId,
        role,
        active: true,
        display_name: email.split('@')[0],
      },
    });
    console.log(JSON.stringify({ msg: 'profile_created', id: userId }));
  } catch (err) {
    // Some schemas require more columns; surface and continue if membership still works.
    console.error(JSON.stringify({ msg: 'profile_create_warning', error: String(err.message || err) }));
  }
}

async function ensureMembership(userId) {
  // Upsert via Prefer resolution=merge-duplicates on unique (client_id, user_id)
  await rest('/rest/v1/client_memberships', {
    method: 'POST',
    headers: {
      prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: {
      client_id: orgId,
      user_id: userId,
      role,
      active: true,
    },
  });
  const rows = await rest(
    `/rest/v1/client_memberships?client_id=eq.${encodeURIComponent(orgId)}` +
      `&user_id=eq.${encodeURIComponent(userId)}&select=role,active&limit=1`,
  );
  console.log(
    JSON.stringify({
      msg: 'membership_set',
      orgId,
      userId,
      role: rows?.[0]?.role || role,
      active: rows?.[0]?.active ?? true,
    }),
  );
}

const { user, created, password: issuedPassword } = await ensureUser();
await ensureClient();
await ensureProfile(user.id);
await ensureMembership(user.id);

console.log(
  JSON.stringify({
    msg: 'grant_complete',
    orgId,
    email,
    userId: user.id,
    role,
    loginUrl: 'http://127.0.0.1:8787/login.html',
    next: [
      'Put SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.pilot',
      'Set ALLOW_OPERATOR_TOKEN_FALLBACK=0 for director-only writes (optional)',
      'docker compose --env-file .env.pilot up -d --build',
      'Sign in at /login.html and allocate',
    ],
    ...(created && issuedPassword
      ? { temporaryPassword: issuedPassword, note: 'Store offline; not committed' }
      : {}),
  }),
);
