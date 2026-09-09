import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { handleWorkerRequest } from '../src/index.js';
const golden=JSON.parse(readFileSync(new URL('../../../fixtures/ir-portable/fi-empty-v1.json',import.meta.url)));
const artifact=JSON.parse(golden.portable_json);
const actor='00000000-0000-0000-0000-000000000106';
const operation='00000000-0000-4000-8000-000000000888';
const initialized={...golden.record,operation_id:operation,state:'initialized',storage_version:'fi-ir-readonly-v1',
  operational:false,ledger_revision:0,empty_state:artifact.empty_state,
  organization:{id:'org_ir_http',name:'org_ir_http',policy_version:'fi-empty-v1'},
  initialized_by:actor,policy_created_by:actor,initialized_at:'2026-09-08T00:00:00Z',policy_created_at:'2026-09-08T00:00:00Z',
  provenance:'fi-empty-v1:202609080003',policy_json:JSON.stringify(artifact.policy),policy_sha256:artifact.policy_sha256,
  portable_json:golden.portable_json,artifact_sha256:createHash('sha256').update(golden.portable_json).digest('hex')};
test('initialized export uses IR named empty maps without changing stored scaffold arrays',async()=>{
 const { toPortableInitializedWorkspace } = await import('../../../workspace/ir-workspace-contract.mjs');
 assert.equal(typeof toPortableInitializedWorkspace,'function');
 const before=JSON.stringify(initialized);
 const wire=await toPortableInitializedWorkspace(initialized,{client:'org_ir_http',operation,idempotencyKey:initialized.idempotency_key});
 const expected=JSON.parse(readFileSync(new URL('../../../fixtures/ir-portable/fi-initialized-v1.json',import.meta.url)));
 assert.equal(wire,expected.initialized_json);
 assert.equal(JSON.stringify(initialized),before);
});
test('initialized export rejects malformed, cross-tenant, request, policy and hash mismatches',async()=>{
 const { toPortableInitializedWorkspace } = await import('../../../workspace/ir-workspace-contract.mjs');
 const binding={client:'org_ir_http',operation,idempotencyKey:initialized.idempotency_key};
 for(const drift of [
  {state:'scaffold_persisted'},{storage_version:'other'},{tenant_id:'org_other'},{client_id:'org_other'},
  {operation_id:actor},{idempotency_key:actor},{policy_sha256:'0'.repeat(64)},{artifact_sha256:'0'.repeat(64)},
  {policy_json:initialized.policy_json+' '},{portable_json:golden.portable_json+' '},
  {empty_state:{entities:{},ledger_commands:[],outbox_events:[]}},
  {empty_state:{entities:[],ledger_commands:[{}],outbox_events:[]}},
  {empty_state:{entities:[],ledger_commands:[],outbox_events:[{}]}},
  {organization:{...initialized.organization,name:'other'}},
  {organization:{...initialized.organization,policy_version:'other'}},
  {organization:{...initialized.organization,id:'org_other'}},
  {runtime_ready:true},{operational:true},{ledger_revision:1},
 ]) await assert.rejects(toPortableInitializedWorkspace({...initialized,...drift},binding),/invalid_fi_initialized_workspace/);
 for(const bad of [undefined,{}, {...binding,client:'org_other'},{...binding,client:'ORG_ir_http'},
  {...binding,operation:actor},{...binding,idempotencyKey:actor}])
  await assert.rejects(toPortableInitializedWorkspace(initialized,bad),/invalid_fi_initialized_workspace/);
 for(const value of [null,[],{},'initialized']) await assert.rejects(toPortableInitializedWorkspace(value,binding));
});
const env={PLATFORM_SUPABASE_URL:'https://supabase.test',PLATFORM_SUPABASE_ANON_KEY:'public-key'};
const request=(method='GET',body={operation_id:operation},path='org_ir_http')=>new Request(`https://worker.test/api/ir/workspaces/${path}`,{
  method,headers:{authorization:'Bearer human-jwt'},...(method==='POST'?{body:JSON.stringify(body)}:{})
});
function transport(readback=initialized) {
 const calls=[];
 return {calls,fetchImpl:async(url,init)=>{
  calls.push(url.split('/').pop());
  assert.equal(init.headers.authorization,'Bearer human-jwt');
  assert.equal(init.headers.apikey,'public-key');
  if(url.endsWith('/user')) return Response.json({id:actor});
  return Response.json(url.endsWith('/initialize_ir_workspace')?initialized:readback);
 }};
}
test('Worker initializes then verifies exact persisted workspace; GET does not write',async()=>{
 const options=transport();
 const response=await handleWorkerRequest(request('POST'),env,options);
 assert.equal(response.status,200); assert.deepEqual(await response.json(),{workspace:initialized});
 assert.deepEqual(options.calls,['user','initialize_ir_workspace','open_ir_workspace']);
 const reopened=transport();
 assert.equal((await handleWorkerRequest(request(),env,reopened)).status,200);
 assert.deepEqual(reopened.calls,['user','open_ir_workspace']);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('Worker rejects hash, provenance, tenant, ledger or policy drift rather than claiming initialized',async()=>{
 for(const drift of [
  {policy_sha256:'0'.repeat(64)}, {artifact_sha256:'0'.repeat(64)}, {provenance:'untrusted'},
  {tenant_id:'org_other'},{operation_id:actor},{operational:true},{runtime_ready:true},
  {empty_state:{entities:[{id:'foreign'}],ledger_commands:[],outbox_events:[]}},
  {ledger_revision:1},{policy_json:initialized.policy_json+' '},{portable_json:golden.portable_json+' '},
  {organization:{id:'org_other',name:'org_ir_http',policy_version:'fi-empty-v1'}},
  {policy_created_by:operation},{initialized_at:null}
 ]) {
  const response=await handleWorkerRequest(request('POST'),env,transport({...initialized,...drift}));
  assert.equal(response.status,503,JSON.stringify(drift));
  assert.deepEqual(await response.json(),{error:'provisioning_failed'});
 }
});
test('Worker rejects caller policy/extra fields, money routes, malformed identity and oversized body',async()=>{
 for(const [req,status] of [[request('POST',{operation_id:operation,policy:{}}),400],
  [request('POST',{operation_id:operation,content:'x'.repeat(1100)}),413],
  [request('GET',{},'org_other/commands'),400],[request('GET',{},'org_ir_http?policy=x'),400],
  [request('DELETE'),405]]) {
  const options=transport(); assert.equal((await handleWorkerRequest(req,env,options)).status,status); assert.equal(options.calls.length,0);
 }
 assert.equal((await handleWorkerRequest(request(),{SUPABASE_SERVICE_ROLE_KEY:'not-a-human'},transport())).status,503);
});
