import { resolvePotPath } from '../domain/pots.mjs';

/**
 * Load a parsed fixture object into a service instance.
 * Idempotent: existing chargeIds are skipped. Workers-safe (no fs).
 */
export async function seedFromObject(service, raw, { applySuggestedAllocation = true } = {}) {
  const orgId = raw.orgId;
  let giftsCreated = 0;
  let labelsSet = 0;
  let allocation = null;
  let proof = null;

  for (const label of raw.labels || []) {
    await service.setLabel(label);
    labelsSet += 1;
  }

  for (const g of raw.gifts || []) {
    const { campaignKey, programKey } = resolvePotPath({
      fundraiserKey: g.campaignKey,
      designationKey: g.programKey,
    });
    // Use CSV path shape via import-like credit: build every.org-like payload
    const payload = {
      chargeId: g.chargeId,
      amount: g.amount || g.netAmount,
      netAmount: g.netAmount,
      currency: g.currency || 'USD',
      donationDate: g.donatedAt,
      designation: programKey === 'undesignated' ? undefined : g.programKey,
      fromFundraiser: {
        title: g.campaignKey,
        slug: campaignKey,
      },
      toNonprofit: {
        slug: 'hacker-dojo',
        name: 'Hacker Dojo',
      },
    };
    // Override normalized keys: force fixture keys after normalize by using campaign title
    // every.org normalizer lowercases title → campaign key
    const r = await service.ingestEveryOrg(payload);
    if (r.created) giftsCreated += 1;
  }

  // Re-apply labels after pots exist (keys from normalizer use lowercased titles)
  for (const label of raw.labels || []) {
    await service.setLabel(label);
  }

  if (applySuggestedAllocation && raw.suggestedAllocation) {
    const s = raw.suggestedAllocation;
    try {
      allocation = await service.allocate({
        campaignKey: s.campaignKey,
        programKey: s.programKey,
        amount: s.amount,
        purpose: s.purpose,
        approvedBy: s.approvedBy || 'director@hackerdojo.org',
      });
      // Force known id if different — allocate always generates id; patch via note in proof
      if (s.proof && allocation) {
        proof = await service.attachProof({
          allocationId: allocation.id,
          uri: s.proof.uri,
          note: `${s.proof.note || ''} (suite allocationId: ${s.id || ''})`.trim(),
          attachedBy: s.proof.attachedBy || 'fixture',
        });
      }
    } catch (err) {
      // Already allocated or insufficient — ignore for re-seed
      if (!(err instanceof Error && err.message === 'OVER_ALLOCATION')) {
        throw err;
      }
    }
  }

  return {
    orgId,
    giftsCreated,
    labelsSet,
    allocationId: allocation?.id || null,
    proofAttached: Boolean(proof),
    available: await service.listAvailable(),
    packet: await service.getPacket(),
  };
}

/**
 * Node helper: read a fixture file, then seedFromObject.
 */
export async function seedFromFixture(service, fixturePath, options = {}) {
  const { readFile } = await import('node:fs/promises');
  const raw = JSON.parse(await readFile(fixturePath, 'utf8'));
  return seedFromObject(service, raw, options);
}
