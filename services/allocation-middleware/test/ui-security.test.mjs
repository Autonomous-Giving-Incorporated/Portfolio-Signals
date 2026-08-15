import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('operator UI does not interpolate API values into innerHTML', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /tr\.innerHTML\s*=\s*`<td>\$\{c\}/);
  assert.doesNotMatch(html, /li\.innerHTML\s*=.*\$\{e\.(?:code|message)/);
  assert.match(html, /fetch\('\/available', \{ headers: opHeaders\(false\) \}\)/);
});

test('import review encodes HTML metacharacters before innerHTML rendering', async () => {
  const source = await readFile(new URL('../../../import-review.js', import.meta.url), 'utf8');
  assert.match(source, /'&':\s*'&amp;'/);
  assert.match(source, /'<':\s*'&lt;'/);
  assert.match(source, /'>':\s*'&gt;'/);
  assert.match(source, /'"':\s*'&quot;'/);
});

// Provenance: Notion Sprint 001 Hub + Loop 805 Slice 19 + Hash: e7d251cc1b4bbe26270060bae03a662e95363794
