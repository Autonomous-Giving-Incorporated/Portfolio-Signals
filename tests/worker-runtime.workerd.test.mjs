import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
const dir = mkdtempSync(join(tmpdir(), 'fi-workerd-'));
const bundle = join(dir, 'bootstrap.js');
before(() => {
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run', '--outdir', dir], { stdio: 'pipe', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
});
after(() => rmSync(dir, { recursive: true, force: true }));
async function runtime(bindings = {}, upstream = () => { throw new Error('unexpected outbound'); }) {
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, modulesRoot: dir, scriptPath: bundle,
    compatibilityDate: '2026-08-13', cf: false,
    bindings: { PLATFORM_SUPABASE_URL: 'https://utdioxwiskzatwoejgiu.supabase.co', ...bindings },
    outboundService: upstream,
    serviceBindings: { ASSETS: () => new Response('static fixture') },
  }));
  try { await mf.ready; return mf; }
  catch (error) { await mf.dispose(); throw error; }
}
test('configured entrypoint boots and bootstrap denies writes despite old privileged bindings', async () => {
  const mf = await runtime({ SUPABASE_SERVICE_ROLE_KEY: 'synthetic-private-fixture', WEBHOOK_TOKEN: 'synthetic-webhook-fixture' });
  try {
    for (const path of ['/api/ir/provisioning/org_test', '/api/ir/workspaces/org_test', '/allocations', '/webhooks/every-org', '/import/csv', '/seed']) {
      const response = await mf.dispatchFetch(`https://fi.test${path}`, { method: 'POST' });
      assert.equal(response.status, 503, path);
      assert.deepEqual(await response.json(), { error: 'bootstrap_read_only' });
    }
    assert.equal((await mf.dispatchFetch('https://fi.test/healthz')).status, 200);
    assert.equal((await mf.dispatchFetch('https://fi.test/readyz')).status, 503);
    assert.equal(await (await mf.dispatchFetch('https://fi.test/workspace')).text(), 'static fixture');
  } finally { await mf.dispose(); }
});


for (const route of ['provisioning', 'workspaces']) {
  test(`${route}: missing public key never falls back to service role`, async () => {
    const mf = await runtime({ SUPABASE_SERVICE_ROLE_KEY: 'synthetic-private-fixture' });
    try {
      const response = await mf.dispatchFetch(`https://fi.test/api/ir/${route}/org_test`, { headers: { authorization: 'Bearer synthetic-human' } });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'provisioning_unavailable' });
    } finally { await mf.dispose(); }
  });
  for (const scenario of [
    { name: 'missing auth', token: false, status: 401, error: 'authentication_required', calls: 0 },
    { name: 'invalid auth', auth: 401, status: 401, error: 'authentication_failed', calls: 1 },
    { name: 'auth redirect', auth: 302, status: 503, error: 'authentication_failed', calls: 1 },
    { name: 'auth outage', auth: 500, status: 503, error: 'authentication_failed', calls: 1 },
    { name: 'malformed auth', authBody: 'not-json', status: 503, calls: 1 },
    { name: 'missing RPC/schema', rpc: 404, status: 503 },
    { name: 'RPC bad request', rpc: 400, status: 400 },
    { name: 'RPC unauthenticated', rpc: 401, status: 401 },
    { name: 'RPC forbidden', rpc: 403, status: 403 },
    { name: 'RPC conflict', rpc: 409, status: 409 },
    { name: 'RPC outage', rpc: 500, status: 503 },
    { name: 'RPC network failure', rpcNetwork: true, status: 503 },
    { name: 'malformed RPC', rpcBody: 'not-json', status: 503 },
    { name: 'invalid readback', rpcBody: '{"runtime_ready":true}', status: 503 },
    { name: 'redirect RPC', rpc: 302, status: 503 },
    { name: 'empty readback', rpcBody: 'null', status: 200 },
  ]) {
    test(`${route}: ${scenario.name} in workerd`, async () => {
      const calls = [];
      const mf = await runtime({ PLATFORM_SUPABASE_ANON_KEY: 'sb_publishable_synthetic' }, async request => {
        calls.push({ url: request.url, method: request.method, auth: request.headers.get('authorization'), key: request.headers.get('apikey'), body: await request.text() });
        if (request.url.endsWith('/auth/v1/user')) {
          return new Response(scenario.authBody ?? '{"id":"synthetic-human"}', { status: scenario.auth ?? 200 });
        }
        if (scenario.rpcNetwork) throw new Error('synthetic outbound failure');
        return new Response(scenario.rpcBody ?? '{"private":"must-not-leak"}', { status: scenario.rpc ?? 200, headers: scenario.rpc === 302 ? { location: 'https://must-not-follow.invalid/' } : {} });
      });
      try {
        const response = await mf.dispatchFetch(`https://fi.test/api/ir/${route}/org_test`, { headers: scenario.token === false ? {} : { authorization: 'Bearer synthetic-human' } });
        assert.equal(response.status, scenario.status);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), scenario.status === 200 ? { [route === 'workspaces' ? 'workspace' : 'scaffold']: null } : { error: scenario.error ?? 'provisioning_failed' });
        assert.equal(calls.length, scenario.calls ?? 2);
        for (const call of calls) {
          assert.equal(new URL(call.url).origin, 'https://utdioxwiskzatwoejgiu.supabase.co');
          assert.equal(call.auth, 'Bearer synthetic-human');
          assert.equal(call.key, 'sb_publishable_synthetic');
        }
        if (calls.length === 2) {
          assert.ok(calls[1].url.endsWith(`/rest/v1/rpc/${route === 'workspaces' ? 'open_ir_workspace' : 'get_ir_workspace_scaffold'}`));
          assert.equal(calls[1].method, 'POST');
          assert.deepEqual(JSON.parse(calls[1].body), { p_client_id: 'org_test' });
        }
      } finally { await mf.dispose(); }
    });
  }
}
