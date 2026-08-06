import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createImportApi } from '../server.mjs';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BATCH_ID = '22222222-2222-4222-8222-222222222222';
const SHA256 = 'a'.repeat(64);
const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function start(fetchImpl, logger = { error() {} }) {
  const server = createImportApi({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'test-service-role',
    fetchImpl,
    logger
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

test('rejects spoofed identity headers without a bearer session', async () => {
  let calls = 0;
  const base = await start(async () => {
    calls += 1;
    throw new Error('fetch should not be called');
  });

  const response = await fetch(`${base}/v1/import-batches`, {
    method: 'POST',
    headers: { 'x-authenticated-user': USER_ID },
    body: JSON.stringify({ source_sha256: SHA256, rows: [] })
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'valid_bearer_session_required' });
  assert.equal(calls, 0);
});

test('rejects bearer tokens Supabase does not recognize', async () => {
  const base = await start(async (url) => {
    assert.match(url, /\/auth\/v1\/user$/);
    return new Response(JSON.stringify({ message: 'invalid JWT' }), { status: 401 });
  });

  const response = await fetch(`${base}/v1/import-batches`, {
    method: 'POST',
    headers: { authorization: 'Bearer invalid-token' },
    body: JSON.stringify({ source_sha256: SHA256, rows: [] })
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'valid_bearer_session_required' });
});

test('rejects authenticated users without an MFA-enabled import role', async () => {
  const base = await start(async (url) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: USER_ID });
    if (url.endsWith('/rest/v1/rpc/require_privileged_mfa')) {
      return Response.json({ id: USER_ID, active: true, mfa_enforced: true, role: 'development' });
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  const response = await fetch(`${base}/v1/import-batches`, {
    method: 'POST',
    headers: { authorization: 'Bearer valid-user-token' },
    body: JSON.stringify({ source_sha256: SHA256, rows: [] })
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'import_role_and_mfa_required' });
});

test('uses the verified Supabase user id and preserves quarantine-only writes', async () => {
  const requests = [];
  const base = await start(async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/auth/v1/user')) {
      assert.equal(options.headers.authorization, 'Bearer valid-user-token');
      return Response.json({ id: USER_ID });
    }
    if (url.endsWith('/rest/v1/rpc/require_privileged_mfa')) {
      assert.equal(options.headers.authorization, 'Bearer valid-user-token');
      return Response.json({
        id: USER_ID,
        active: true,
        mfa_enforced: true,
        role: 'data_steward'
      });
    }
    if (url.endsWith('/rest/v1/rpc/create_import_batch')) {
      assert.equal(options.headers.authorization, 'Bearer valid-user-token');
      const { p_batch: batch, p_rows: rows } = JSON.parse(options.body);
      assert.equal('submitted_by' in batch, false);
      assert.equal(batch.client_id, 'org_hacker_dojo');
      assert.equal(
        batch.storage_object_path,
        `org_hacker_dojo/quarantine/${SHA256}/synthetic.xlsx`
      );
      assert.equal(batch.state, 'received');
      assert.equal(batch.receipt.promotion_authorized, false);
      assert.equal(rows.length, 1);
      assert.equal('batch_id' in rows[0], false);
      assert.equal(rows[0].state, 'staged');
      return Response.json({
        batch: { id: BATCH_ID, submitted_by: USER_ID, ...batch },
        staged_row_count: rows.length,
        promotion_authorized: false
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  const response = await fetch(`${base}/v1/import-batches`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-user-token',
      'content-type': 'application/json',
      'x-authenticated-user': '33333333-3333-4333-8333-333333333333'
    },
    body: JSON.stringify({
      source_sha256: SHA256,
      source_filename: 'synthetic.xlsx',
      parser_version: 'test-v1',
      rows: [{ source_row_number: 7, normalized_record: { synthetic: true } }]
    })
  });

  assert.equal(response.status, 201);
  const responseBody = await response.json();
  assert.equal(responseBody.batch.id, BATCH_ID);
  assert.equal(responseBody.batch.submitted_by, USER_ID);
  assert.equal(responseBody.staged_row_count, 1);
  assert.equal(responseBody.promotion_authorized, false);
  assert.equal(requests.length, 3);
});

test('does not leak persistence error details to callers', async () => {
  const logs = [];
  const base = await start(async (url) => {
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: USER_ID });
    if (url.endsWith('/rest/v1/rpc/require_privileged_mfa')) {
      return Response.json({ id: USER_ID, active: true, mfa_enforced: true, role: 'director' });
    }
    return new Response('private database detail bearer-secret@example.com', { status: 500 });
  }, { error(...args) { logs.push(args); } });

  const response = await fetch(`${base}/v1/import-batches`, {
    method: 'POST',
    headers: { authorization: 'Bearer valid-user-token' },
    body: JSON.stringify({ source_sha256: SHA256, rows: [] })
  });

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'import_persistence_failed' });
  assert.deepEqual(logs, [[{
    event: 'import_batch_creation_failed',
    code: 'import_persistence_failed'
  }]]);
  assert.equal(JSON.stringify(logs).includes('private database detail'), false);
  assert.equal(JSON.stringify(logs).includes('bearer-secret@example.com'), false);
});
