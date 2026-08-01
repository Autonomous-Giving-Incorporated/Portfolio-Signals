import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import XLSX from '@e965/xlsx';

const CLI = path.resolve('src/cli.js');
const scratchDirectories = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function scratch() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hacker-dojo-parser-'));
  scratchDirectories.push(directory);
  return directory;
}

function run(...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: path.resolve('.'),
    encoding: 'utf8'
  });
}

function writeWorkbook(file) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['name', 'priority', 'approved'],
      ['Synthetic Sponsor', 1, false]
    ]),
    'Sponsors'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([['Synthetic Grant', null, true]]),
    'Grants'
  );
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(file, buffer);
}

test('emits provenance-bound, quarantine-only NDJSON for every worksheet row', () => {
  const directory = scratch();
  const input = path.join(directory, 'synthetic.xlsx');
  const output = path.join(directory, 'receipt.ndjson');
  writeWorkbook(input);

  const result = run(input, output);

  assert.equal(result.status, 0, result.stderr);
  const digest = crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');
  const rows = fs.readFileSync(output, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => [row.sheet_name, row.source_row_number]), [
    ['Sponsors', 1],
    ['Sponsors', 2],
    ['Grants', 1]
  ]);
  for (const row of rows) {
    assert.equal(row.source_sha256, digest);
    assert.equal(row.state, 'staged');
    assert.equal(row.promotion_authority, false);
    assert.ok(Array.isArray(row.raw_cells));
  }
  assert.deepEqual(JSON.parse(result.stderr), {
    source_sha256: digest,
    sheets: 2,
    rows: 3
  });
});

test('rejects non-xlsx inputs before creating an output receipt', () => {
  const directory = scratch();
  const input = path.join(directory, 'synthetic.csv');
  const output = path.join(directory, 'receipt.ndjson');
  fs.writeFileSync(input, 'name\nSynthetic Sponsor\n');

  const result = run(input, output);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only native \.xlsx files are accepted/);
  assert.equal(fs.existsSync(output), false);
});

test('fails closed on an invalid workbook before creating an output receipt', () => {
  const directory = scratch();
  const input = path.join(directory, 'invalid.xlsx');
  const output = path.join(directory, 'receipt.ndjson');
  fs.writeFileSync(input, 'not an xlsx archive');

  const result = run(input, output);

  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(output), false);
});

test('never overwrites an existing quarantine receipt', () => {
  const directory = scratch();
  const input = path.join(directory, 'synthetic.xlsx');
  const output = path.join(directory, 'receipt.ndjson');
  writeWorkbook(input);
  fs.writeFileSync(output, 'operator-owned-existing-receipt\n');

  const result = run(input, output);

  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(output, 'utf8'), 'operator-owned-existing-receipt\n');
});
