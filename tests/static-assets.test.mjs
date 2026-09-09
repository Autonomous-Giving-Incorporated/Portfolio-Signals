import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const wrangler = join(root, 'node_modules/wrangler/bin/wrangler.js');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const hidden = [
  '.mcp.json', '.claude/settings.json', '.claude/helpers/graft-hooks.cjs',
  '.claude/helpers/graft-statusline.cjs', '.gitattributes', '.ignore',
  '.codex/config.toml', '.agents/settings.json', '.npmrc', '.dev.vars',
  'workspace/.mcp.json', 'workspace/.claude/settings.json',
  'assets/.cache/tool.json', '.well-known/.private/config.json',
];
const publicFiles = [
  'index.html', 'workspace.html', 'workspace.js', 'workspace/session.js',
  'allocation.html', 'styles.css', 'assets/brand/agi-mark.png',
  'assets/tenants/hacker-dojo/icon.svg', 'data/public-campaign.json',
  'runtime-config.js', '.well-known/security.txt',
];

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'fi-assets-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // Copy the tracked deployment tree, never local credentials or node_modules.
  for (const file of tracked) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    copyFileSync(join(root, file), join(directory, file));
  }
  for (const file of [...hidden, 'runtime-config.js', '.well-known/security.txt']) {
    mkdirSync(dirname(join(directory, file)), { recursive: true });
    writeFileSync(join(directory, file), '/* synthetic asset discovery fixture */\n');
  }
  return directory;
}

function dryRun(directory, outdir) {
  // No inherited provider credentials, database URLs, or remote operations.
  return spawnSync(process.execPath, [wrangler, 'deploy', '--dry-run', `--outdir=${outdir}`], {
    cwd: directory,
    env: { PATH: process.env.PATH, HOME: directory, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG: 'debug', CI: 'true' },
    encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
}

function ignoredAssets(result) {
  // Pinned Wrangler's real buildAssetManifest logs each ignored relative path.
  return new Set(`${result.stdout}\n${result.stderr}`.split('\n')
    .flatMap(line => line.includes('Ignoring asset: ') ? [line.split('Ignoring asset: ')[1].trim()] : []));
}

test('Wrangler deployment discovery excludes hidden tooling and keeps public assets', t => {
  const directory = fixture(t);
  const result = dryRun(directory, join(directory, 'out'));
  assert.equal(result.status, 0, `Wrangler dry-run failed (status ${result.status}, ${result.error?.code ?? 'no process error'})`);
  const ignored = ignoredAssets(result);
  assert.ok(ignored.size > 0, 'Wrangler ignore diagnostics must be present');
  const hiddenTracked = tracked.filter(file => !publicFiles.includes(file)
    && file.split('/').some(part => part.startsWith('.')));
  for (const file of new Set([...hidden, ...hiddenTracked])) {
    assert.ok(ignored.has(file), `internal asset published: ${file}`);
  }
  for (const file of publicFiles) {
    assert.ok(readFileSync(join(directory, file)).length > 0, `missing public fixture: ${file}`);
    assert.ok(!ignored.has(file), `public asset excluded: ${file}`);
  }
});

for (const file of publicFiles) {
  test(`Wrangler actually processes retained public asset ${file}`, t => {
    const directory = fixture(t);
    // Each oversized public file must hit the real manifest size validator.
    // This fails if discovery is bypassed or that public path is excluded.
    truncateSync(join(directory, file), 26 * 1024 * 1024);
    const result = dryRun(directory, join(directory, 'out'));
    assert.notEqual(result.status, 0);
    const output = `${result.stdout}\n${result.stderr}`;
    assert.ok(output.includes('Asset too large'), 'Wrangler did not report its asset size validator');
    assert.ok(output.includes(join(directory, file)), `size validator did not process ${file}`);
  });
}
