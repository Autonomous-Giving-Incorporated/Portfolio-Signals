#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import { z } from 'zod';

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log('Usage: node src/cli.js <input.xlsx> <output.ndjson>');
  process.exit(0);
}

const [input, output] = args;
if (!input || !output) throw new Error('input and output are required');
if (path.extname(input).toLowerCase() !== '.xlsx') throw new Error('only native .xlsx files are accepted');

const Cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const workbook = XLSX.readFile(input, { cellDates: true, raw: false });
const digest = crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');
const stream = fs.createWriteStream(output, { encoding: 'utf8', flags: 'wx' });

let rowCount = 0;
for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  rows.forEach((raw, index) => {
    const cells = z.array(Cell).parse(raw);
    stream.write(JSON.stringify({
      source_sha256: digest,
      sheet_name: sheetName,
      source_row_number: index + 1,
      raw_cells: cells,
      state: 'staged',
      promotion_authority: false
    }) + '\n');
    rowCount += 1;
  });
}
stream.end();
stream.on('finish', () => {
  console.error(JSON.stringify({ source_sha256: digest, sheets: workbook.SheetNames.length, rows: rowCount }));
});
