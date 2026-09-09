import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const project = 'utdioxwiskzatwoejgiu';
for (const [name, env] of Object.entries({
  missing: {},
  serviceFallback: { SUPABASE_SERVICE_ROLE_KEY: 'private-fixture' },
  secret: { PLATFORM_SUPABASE_ANON_KEY: 'sb_secret_fixture' },
  serviceJwt: { PLATFORM_SUPABASE_ANON_KEY: `e30.${Buffer.from(JSON.stringify({ role: 'service_role', ref: project })).toString('base64url')}.fixture` },
  wrongProject: { PLATFORM_SUPABASE_URL: 'https://other.supabase.co', PLATFORM_SUPABASE_ANON_KEY: 'sb_publishable_fixture' },
  wrongRef: { PLATFORM_SUPABASE_ANON_KEY: `e30.${Buffer.from(JSON.stringify({ role: 'anon', ref: 'other' })).toString('base64url')}.fixture` },
  malformed: { PLATFORM_SUPABASE_ANON_KEY: 'invalid' },
  missingUrl: { PLATFORM_SUPABASE_URL: '', PLATFORM_SUPABASE_ANON_KEY: 'sb_publishable_fixture' },
})) {
  test(`rejects ${name} without creating output or logging input`, () => {
    const { dir, file, result } = run({ PLATFORM_SUPABASE_URL: `https://${project}.supabase.co`, ...env });
    try {
      assert.notEqual(result.status, 0);
      assert.equal(existsSync(file), false);
      if (env.PLATFORM_SUPABASE_ANON_KEY) assert.ok(!`${result.stdout}${result.stderr}`.includes(env.PLATFORM_SUPABASE_ANON_KEY));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

const anon = `e30.${Buffer.from(JSON.stringify({ role: 'anon', ref: project })).toString('base64url')}.fixture`;
function run(env) {
  const dir = mkdtempSync(join(tmpdir(), 'fi-binding-test-'));
  const file = join(dir, 'bindings.json');
  const result = spawnSync(process.execPath, ['scripts/prepare-worker-public-bindings.mjs', file], {
    encoding: 'utf8', env: { PATH: process.env.PATH, ...env }
  });
  return { dir, file, result };
}
test('prepares only a public binding privately without logging its value', () => {
  const { dir, file, result } = run({ PLATFORM_SUPABASE_URL: `https://${project}.supabase.co`, PLATFORM_SUPABASE_ANON_KEY: anon });
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(file)), { PLATFORM_SUPABASE_ANON_KEY: anon });
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(anon));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


for (const prefix of ['PLATFORM', 'STAGING']) {
  test(`accepts existing ${prefix} public publishable configuration`, () => {
    const { dir, file, result } = run({ [`${prefix}_SUPABASE_URL`]: `https://${project}.supabase.co`, [`${prefix}_SUPABASE_ANON_KEY`]: 'sb_publishable_synthetic' });
    try {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(readFileSync(file)), { PLATFORM_SUPABASE_ANON_KEY: 'sb_publishable_synthetic' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
test('workflow gates deploy on approved manual main dispatch and validates binding before browser publication', () => {
  const workflow = readFileSync('.github/workflows/cloudflare-workers.yml', 'utf8');
  assert.match(workflow, /if: github.event_name == 'workflow_dispatch' && github.ref == 'refs\/heads\/main' && inputs.approved_bootstrap_release == true/);
  assert.ok(workflow.indexOf('node scripts/prepare-worker-public-bindings.mjs') < workflow.indexOf('bash scripts/vercel-build.sh'));
  assert.match(workflow, /wrangler deploy --secrets-file "\$private_dir\/bindings.json"/);
  assert.match(workflow, /tests\/worker-runtime.workerd.test.mjs/);
  assert.ok(!workflow.includes('SERVICE_ROLE'));
});


for (const [file, indent] of [['.github/workflows/local-security-contract.yml', 10], ['scripts/acceptance/run_security_contract.sh', 0]]) test(`${file}: credential scan ignores dependencies but rejects repository credentials`, () => {
  const workflow = readFileSync(file, 'utf8');
  const blocks = [...workflow.matchAll(/python3 - <<'PY'\n([\s\S]*?)\n\s*PY/g)];
  const block = blocks.find(match => match[1].includes('patterns = ['));
  assert.ok(block, 'must exercise the actual CI scanner');
  const script = block[1].split('\n').map(line => line.slice(indent)).join('\n');
  const dir = mkdtempSync(join(tmpdir(), 'fi-scan-test-'));
  try {
    mkdirSync(join(dir, 'node_modules', 'dependency'), { recursive: true });
    const marker = ['BEGIN', 'PRIVATE', 'KEY'].join(' ');
    writeFileSync(join(dir, 'node_modules', 'dependency', 'fixture.js'), marker);
    let result = spawnSync('python3', ['-c', script], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(join(dir, 'source.js'), marker);
    result = spawnSync('python3', ['-c', script], { cwd: dir, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /source.js/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
