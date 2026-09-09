// Disposable PostgREST + real Supabase PostgreSQL integration. No hosted URLs.
// Auth /user is a transport fixture here; signed JWT verification is real PostgREST.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHmac } from 'node:crypto';
import { handleWorkerRequest } from '../../workers/portfolio-signals/src/index.js';
import { readFileSync } from 'node:fs';
import { toPortableScaffold } from './ir-portable-contract.mjs';
import { toPortableInitializedWorkspace } from '../../workspace/ir-workspace-contract.mjs';
const golden = JSON.parse(readFileSync(new URL('../../fixtures/ir-portable/fi-empty-v1.json', import.meta.url), 'utf8'));
const db = process.env.FI_IR_TEST_CONTAINER;
if (!/^fi-ir-test-[a-f0-9]{12}$/.test(db || '')) throw new Error('dedicated disposable container required');
const name = `${db}-rest`;
const network = `${db}-network`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const sql = text => execFileSync('docker', ['exec','-i','-e','PGPASSWORD=local-test-only',db,'psql','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'], { input: text, encoding: 'utf8' });
const secret = randomUUID()+randomUUID();
const actor = '00000000-0000-0000-0000-000000000106';
function jwt(claims, signingSecret = secret) {
 const prefix = [ {alg:'HS256',typ:'JWT'}, { role:'authenticated',sub:actor,aal:'aal2',exp:Math.floor(Date.now()/1000)+3600,...claims } ]
  .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
 return `${prefix}.${createHmac('sha256',signingSecret).update(prefix).digest('base64url')}`;
}
try {
 assert.equal(JSON.parse(docker('network','inspect',network))[0].Internal,false);
 // Restore the production-compatible auth helper: SQL-only harness uses individual claims.
 sql(`create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),auth.jwt()->>'sub')::uuid $$;
  alter role authenticator password 'local-http-only';
  insert into public.clients(id,slug,display_name,state) values('org_ir_http','ir-http','HTTP test','provisioning');`);
 docker('run','-d','--name',name,'--network',network,'-p','127.0.0.1::3000',
  '-e',`PGRST_DB_URI=postgres://authenticator:local-http-only@${db}:5432/postgres`,
  '-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e',`PGRST_JWT_SECRET=${secret}`,
  'public.ecr.aws/supabase/postgrest:v12.2.12');
 const port = JSON.parse(docker('inspect',name))[0].NetworkSettings.Ports['3000/tcp'][0].HostPort;
 const base = `http://127.0.0.1:${port}`;
 let ready=false;
 for(let i=0;i<50;i++) {
  try { if((await fetch(base)).ok){ready=true;break;} } catch {}
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 assert.ok(ready,'disposable PostgREST did not start');
 const token=jwt({});
 const rpc=async(name,args,bearer=token)=>fetch(`${base}/rpc/${name}`,{method:'POST',headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},body:JSON.stringify(args)});
 const recorded=await rpc('request_ir_provisioning',{p_client_id:'org_ir_http',p_idempotency_key:golden.record.idempotency_key,p_rationale:'Real PostgREST scaffold test'});
 assert.equal(recorded.status,200,await recorded.clone().text());
 const operation=(await recorded.json()).operation_id;
 const env={PLATFORM_SUPABASE_URL:base,PLATFORM_SUPABASE_ANON_KEY:'public-test-key'};
 const fetchImpl=async(url,init)=>url.endsWith('/auth/v1/user') ? Response.json({id:actor}) : fetch(url.replace('/rest/v1/','/'),init);
 const request=(method='GET',bearer=token)=>new Request('http://worker.test/api/ir/provisioning/org_ir_http',{
  method,headers:{authorization:`Bearer ${bearer}`},...(method==='POST'?{body:JSON.stringify({operation_id:operation})}:{})
 });
 const response=await handleWorkerRequest(request('POST'),env,{fetchImpl});
 assert.equal(response.status,200,await response.clone().text());
 const persisted=await response.json();
 assert.equal(persisted.scaffold.runtime_ready,false);
 assert.equal(JSON.parse(persisted.scaffold.policy_json).policy.tenant_id,'org_ir_http');
 const read=await handleWorkerRequest(request(),env,{fetchImpl});
 const readback = await read.json();
 assert.deepEqual(readback,persisted);
 const portable = toPortableScaffold(readback.scaffold);
 assert.equal(portable,golden.portable_json,'SQL/Worker output must match actual IR portable/reopen vector');
 assert.equal(readback.scaffold.policy_json,golden.record.policy_json);
 console.log('PASS: real PostgREST readback -> FI portable adapter -> pinned actual IR golden bytes/hash');
 // Explicit opt-in: CI has no sibling dependency; local reconciliation exercises
 // the real IR implementation against the actual HTTP readback, not just a fixture.
 if (process.env.FI_IR_ORACLE_SOURCE) {
  console.log(execFileSync('python3',[new URL('./check-ir-portable-oracle.py',import.meta.url).pathname], {
   input: JSON.stringify({record:readback.scaffold,portable_json:portable}), encoding:'utf8',
   env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONPATH:process.env.FI_IR_ORACLE_SOURCE}
  }).trim());
 }
 const workspaceRequest=(method='GET',bearer=token)=>new Request('http://worker.test/api/ir/workspaces/org_ir_http',{
  method,headers:{authorization:`Bearer ${bearer}`},...(method==='POST'?{body:JSON.stringify({operation_id:operation})}:{})
 });
 const absent=await handleWorkerRequest(workspaceRequest(),env,{fetchImpl});
 assert.equal(absent.status,200,await absent.clone().text());
 assert.deepEqual(await absent.json(),{workspace:null});
 if (process.env.FI_IR_BROWSER === '1') {
  console.log(execFileSync('npx',['playwright','test','tests/browser/ir-initialized-workspace.spec.js','--retries=0'], {
   cwd: new URL('../../',import.meta.url), encoding:'utf8',
   env: {...process.env,FI_IR_BROWSER_REST:base,FI_IR_BROWSER_TOKEN:token,FI_IR_BROWSER_OPERATION:operation}
  }));
 }
 const initialized=await handleWorkerRequest(workspaceRequest('POST'),env,{fetchImpl});
 assert.equal(initialized.status,200,await initialized.clone().text());
 const initializedBody=await initialized.json();
 assert.equal(initializedBody.workspace.state,'initialized');
 assert.equal(initializedBody.workspace.portable_json,portable);
 assert.deepEqual(initializedBody.workspace.empty_state,{entities:[],ledger_commands:[],outbox_events:[]});
 assert.equal(initializedBody.workspace.runtime_ready,false);
 assert.equal(initializedBody.workspace.operational,false);
 // A fresh handler import has no cached workspace or service to hide missing persistence.
 const freshHandler=(await import('../../workers/portfolio-signals/src/index.js?fresh=initialized')).handleWorkerRequest;
 const reopenedBody=await (await freshHandler(workspaceRequest(),env,{fetchImpl})).json();
 assert.deepEqual(reopenedBody,initializedBody);
 const initializedJson=await toPortableInitializedWorkspace(reopenedBody.workspace,{
  client:'org_ir_http',operation,idempotencyKey:golden.record.idempotency_key,
 });
 const initializedGolden=JSON.parse(readFileSync(new URL('../../fixtures/ir-portable/fi-initialized-v1.json',import.meta.url),'utf8'));
 assert.equal(initializedJson,initializedGolden.initialized_json);
 console.log('PASS: actual post-initialization fresh Worker/SQL readback -> initialized adapter -> standalone IR golden');
 if(process.env.FI_IR_ORACLE_SOURCE) {
  console.log(execFileSync('python3',[new URL('./check-ir-portable-oracle.py',import.meta.url).pathname],{
   input:JSON.stringify({record:readback.scaffold,portable_json:portable,
    workspace:reopenedBody.workspace,initialized_json:initializedJson,operation_id:operation}),encoding:'utf8',
   env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',PYTHONPATH:process.env.FI_IR_ORACLE_SOURCE}
  }).trim());
 }

 const simultaneous=await Promise.all([0,1].map(()=>freshHandler(workspaceRequest('POST'),env,{fetchImpl})));
 for(const response of simultaneous) assert.deepEqual(await response.json(),initializedBody);
 assert.equal(sql("select count(*) from ir_private.workspaces where tenant_id='org_ir_http';").trim(),'1');
 assert.equal(sql("select count(*) from public.client_audit_log where action='ir_workspace_initialized' and client_id='org_ir_http';").trim(),'1');
 for(const badToken of [jwt({},'wrong-secret'),jwt({aal:'aal1'}),jwt({sub:'00000000-0000-0000-0000-000000000101'}),jwt({role:'service_role'}),jwt({exp:1})]) {
  for(const method of ['GET','POST']) assert.ok([401,403].includes((await freshHandler(workspaceRequest(method,badToken),env,{fetchImpl})).status));
 }
 console.log('PASS: persisted portable policy + empty IR state, fresh Worker opener, concurrent replay, restrictive JWT authority');
 const replay=await handleWorkerRequest(request('POST'),env,{fetchImpl});
 assert.deepEqual(await replay.json(),persisted);
 for(const badToken of [jwt({},'wrong-secret'),jwt({aal:'aal1'}),jwt({sub:'00000000-0000-0000-0000-000000000101'}),jwt({role:'service_role'}),jwt({exp:1})]) {
  for(const method of ['GET','POST']) {
   const denied=await handleWorkerRequest(request(method,badToken),env,{fetchImpl});
   assert.ok([401,403].includes(denied.status),`expected denial, got ${denied.status}`);
  }
 }
 sql(`update public.platform_administrators set revoked_at=now() where user_id='${actor}';`);
 assert.equal((await handleWorkerRequest(request(),env,{fetchImpl})).status,403);
 assert.equal(sql("select count(*) from public.ir_workspace_scaffolds where client_id='org_ir_http';").trim(),'1');
 console.log('PASS: Worker -> real PostgREST -> Supabase scaffold, replay/readback, JWT forgery/AAL1/expiry/tenant director/service-role/revocation denied');
 console.log('LIMIT: Auth /user response is a fixture, not GoTrue HTTP/MFA enrollment verification');
} finally {
 try { docker('rm','-f',name); } catch {}
 // Parent harness owns the database and private network cleanup.
}
