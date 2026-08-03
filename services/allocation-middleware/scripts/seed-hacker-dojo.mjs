#!/usr/bin/env node
/**
 * Seed Hacker Dojo pilot data into allocation middleware (file or memory store).
 *
 *   ORG_ID=org_hacker_dojo DATA_FILE=./data/hacker-dojo.json node scripts/seed-hacker-dojo.mjs
 *   npm run seed:hacker-dojo
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createService } from '../src/app/service.mjs';
import { createFileStore, createMemoryStore } from '../src/app/store.mjs';
import { seedFromFixture } from '../src/app/seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(__dirname, '../fixtures/hacker-dojo-pilot.json');
const orgId = process.env.ORG_ID || 'org_hacker_dojo';
const dataFile = process.env.DATA_FILE || path.join(__dirname, '../data/hacker-dojo.json');
const applySuggested = process.env.SEED_ALLOCATE !== '0';

const store = process.env.MEMORY_ONLY === '1' ? createMemoryStore() : createFileStore(dataFile);
const service = createService({ orgId, store });
const result = await seedFromFixture(service, fixture, {
  applySuggestedAllocation: applySuggested,
});

console.log(
  JSON.stringify(
    {
      msg: 'hacker-dojo pilot seeded',
      dataFile: process.env.MEMORY_ONLY === '1' ? 'memory' : dataFile,
      ...result,
      totals: result.packet.totals,
    },
    null,
    2,
  ),
);
