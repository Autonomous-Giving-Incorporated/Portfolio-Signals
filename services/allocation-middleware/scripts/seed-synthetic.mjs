#!/usr/bin/env node
/**
 * Seed AutoGive Synthetic Dataset v1 into allocation middleware (file or memory).
 * Does not replace the Hacker Dojo reference tenant seed.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../src/app/service.mjs';
import { createFileStore, createMemoryStore } from '../src/app/store.mjs';
import { seedFromFixture } from '../src/app/seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '../../../fixtures/autogive-v1/middleware/pilot.json');
const orgId = process.env.ORG_ID || 'org_synthetic_civic_forge';
const dataFile = process.env.DATA_FILE || path.join(__dirname, '../data/synthetic-civic-forge.json');
const applySuggested = process.env.SEED_ALLOCATE !== '0';

const store = process.env.MEMORY_ONLY === '1' ? createMemoryStore() : createFileStore(dataFile);
const service = createService({ orgId, store });
const result = await seedFromFixture(service, fixture, {
  applySuggestedAllocation: applySuggested,
});

console.log(
  JSON.stringify(
    {
      msg: 'autogive synthetic v1 seeded',
      classification: 'SYNTHETIC_ONLY',
      dataFile: process.env.MEMORY_ONLY === '1' ? 'memory' : dataFile,
      ...result,
      totals: result.packet.totals,
    },
    null,
    2,
  ),
);
