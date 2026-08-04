import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedFromFixture } from './seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Optional seed-on-boot for Hacker Dojo pilot.
 * SEED_ON_BOOT=1|true enables. Idempotent on gift chargeIds.
 */
export async function maybeSeedOnBoot(service, env = process.env) {
  const flag = env.SEED_ON_BOOT;
  if (flag !== '1' && flag !== 'true') {
    return { skipped: true };
  }
  const fixture =
    env.SEED_FIXTURE ||
    path.join(__dirname, '../../fixtures/hacker-dojo-pilot.json');
  const applySuggested = env.SEED_ALLOCATE !== '0';
  try {
    const result = await seedFromFixture(service, fixture, {
      applySuggestedAllocation: applySuggested,
    });
    console.log(
      JSON.stringify({
        msg: 'seed_on_boot',
        fixture,
        giftsCreated: result.giftsCreated,
        allocationId: result.allocationId,
        proofAttached: result.proofAttached,
        totals: result.packet?.totals,
      }),
    );
    return { skipped: false, ...result };
  } catch (err) {
    console.error(
      JSON.stringify({
        msg: 'seed_on_boot_failed',
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    if (env.SEED_ON_BOOT_STRICT === '1' || env.SEED_ON_BOOT_STRICT === 'true') {
      throw err;
    }
    return { skipped: false, error: true };
  }
}
