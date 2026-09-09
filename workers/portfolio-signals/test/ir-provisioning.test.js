import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWorkerRequest } from '../src/index.js';
const client = 'org_ir_test';
const operation = '20000000-0000-4000-8000-000000000001';
const env = { PLATFORM_SUPABASE_URL: 'https://supabase.example', PLATFORM_SUPABASE_ANON_KEY: 'public-key' };
const request = (method = 'GET', body, path = client, token = 'human-token') => new Request(`https://fi.example/api/ir/provisioning/${path}`, {
  method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
const scaffold = { client_id: client, tenant_id: client, operation_id: operation,
  idempotency_key: operation, state: 'scaffold_persisted', runtime_ready: false,
  policy_json: JSON.stringify({ format: 'ir-policy-v1', policy: { tenant_id: client, version: 'fi-empty-v1' } }),
  created_by: operation, created_at: '2026-09-08T00:00:00Z' };
test('authorized Worker executes with human token then reads exact persisted scaffold', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.headers.authorization, 'Bearer human-token');
    assert.equal(init.headers.apikey, 'public-key');
    return Response.json(url.endsWith('/auth/v1/user') ? { id: operation } : scaffold);
  };
  const res = await handleWorkerRequest(request('POST', { operation_id: operation }), env, { fetchImpl });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { scaffold });
  assert.deepEqual(calls.map(c => c.url.split('/').pop()), ['user', 'execute_ir_provisioning', 'get_ir_workspace_scaffold']);
  assert.deepEqual(JSON.parse(calls[1].init.body), { p_client_id: client, p_operation_id: operation });
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

for (const [label, req, expected] of [
 ['anonymous', request('GET', undefined, client, ''), 401],
 ['malformed literal', request('GET', undefined, '%20org_ir_test'), 400],
 ['query injection', request('GET', undefined, client+'?tenant=other'), 400],
 ['method', request('DELETE'), 405],
 ['extra payload field', request('POST', { operation_id: operation, tenant_id: 'org_foreign' }), 400],
 ['missing operation', request('POST', {}), 400],
 ['oversized', request('POST', { operation_id: 'x'.repeat(1100) }), 413]
]) test(`Worker rejects ${label} before upstream traffic`, async () => {
 const response = await handleWorkerRequest(req, env, { fetchImpl: () => { throw new Error('must not fetch'); } });
 assert.equal(response.status, expected);
});
test('service key alone is not a provisioning binding', async () => {
 const response = await handleWorkerRequest(request(), { PLATFORM_SUPABASE_URL: env.PLATFORM_SUPABASE_URL, PLATFORM_SUPABASE_SERVICE_ROLE_KEY: 'server-key' });
 assert.equal(response.status,503);
});
for (const status of [401,403,409,500]) test(`RPC denial ${status} is sanitized and no successful readback`, async () => {
 let calls=0;
 const response=await handleWorkerRequest(request('POST',{ operation_id: operation }),env,{ fetchImpl: async url => {
  calls++; return url.endsWith('/user') ? Response.json({id: operation}) : Response.json({ message: 'private SQL detail' },{status});
 }});
 assert.equal(response.status,status===500 ? 503 : status);
 assert.equal(calls,2); assert.deepEqual(await response.json(),{error:'provisioning_failed'});
});
for (const bad of [{...scaffold,tenant_id:'org_foreign'},{...scaffold,runtime_ready:true},{...scaffold,policy_json:'{}'},null])
 test('mismatched or missing readback cannot claim persistence',async()=>{
  const response=await handleWorkerRequest(request('POST',{operation_id:operation}),env,{fetchImpl:async url=>
   Response.json(url.endsWith('/user')?{id:operation}:url.endsWith('/execute_ir_provisioning')?scaffold:bad)});
  assert.equal(response.status,503);
 });
test('lost response can recover through read-only GET',async()=>{
 let persisted=null;
 const fetchImpl=async url=>{
  if(url.endsWith('/user')) return Response.json({id:operation});
  if(url.endsWith('/execute_ir_provisioning')){persisted=scaffold;throw new Error('lost response after commit');}
  return Response.json(persisted);
 };
 assert.equal((await handleWorkerRequest(request('POST',{operation_id:operation}),env,{fetchImpl})).status,503);
 const response=await handleWorkerRequest(request(),env,{fetchImpl});
 assert.deepEqual(await response.json(),{scaffold});
});
test('failed Auth token verification does not reach RPC',async()=>{
 let calls=0; const response=await handleWorkerRequest(request(),env,{fetchImpl:async()=>{calls++;return Response.json({}, {status:401});}});
 assert.equal(response.status,401);assert.equal(calls,1);
});
