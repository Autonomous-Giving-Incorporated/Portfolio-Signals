#!/usr/bin/env node
import { loadCorpus, validateCorpus } from './lib.mjs';

const result = validateCorpus(loadCorpus());
if (!result.ok) {
  console.error(JSON.stringify({ ok: false, errors: result.errors }, null, 2));
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      ok: true,
      dataset: 'autogive-synthetic-dataset',
      version: '1.0.0',
      classification: 'SYNTHETIC_ONLY',
      counts: result.counts,
    },
    null,
    2,
  ),
);
