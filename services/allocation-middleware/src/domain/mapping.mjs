import { addCents } from './money.mjs';
import { normalizeKey } from './pots.mjs';

function potId(orgId, campaignKey, programKey) {
  return `${orgId}|${campaignKey}|${programKey}`;
}

/** Display labels: key `${kind}:${key}` -> label */
export function setLabel(state, { orgId, kind, key, label }) {
  const labels = new Map(state.labels || []);
  const k = `${orgId}|${kind}|${normalizeKey(key)}`;
  labels.set(k, String(label || '').trim() || normalizeKey(key));
  return { state: { ...state, labels } };
}

export function listLabels(state, orgId) {
  const out = [];
  for (const [k, label] of state.labels || []) {
    if (!k.startsWith(`${orgId}|`)) continue;
    const [, kind, key] = k.split('|');
    out.push({ kind, key, label });
  }
  return out;
}

/**
 * Merge source pot into target pot (same org). Moves balances, rewrites gifts/allocations keys.
 */
export function mergePots(state, { orgId, fromCampaign, fromProgram, toCampaign, toProgram }) {
  const fromC = normalizeKey(fromCampaign) || 'general';
  const fromP = normalizeKey(fromProgram) || 'undesignated';
  const toC = normalizeKey(toCampaign) || 'general';
  const toP = normalizeKey(toProgram) || 'undesignated';
  if (fromC === toC && fromP === toP) throw new Error('MERGE_SAME_POT');

  const fromId = potId(orgId, fromC, fromP);
  const toId = potId(orgId, toC, toP);
  const pots = new Map(state.pots);
  const from = pots.get(fromId);
  if (!from) throw new Error('SOURCE_POT_NOT_FOUND');

  const to = pots.get(toId) || {
    orgId,
    campaignKey: toC,
    programKey: toP,
    creditedCents: 0n,
    allocatedCents: 0n,
  };
  pots.set(toId, {
    ...to,
    creditedCents: addCents(to.creditedCents, from.creditedCents),
    allocatedCents: addCents(to.allocatedCents, from.allocatedCents),
  });
  pots.delete(fromId);

  const gifts = new Map(state.gifts);
  for (const [id, g] of gifts) {
    if (g.orgId === orgId && g.campaignKey === fromC && g.programKey === fromP) {
      gifts.set(id, { ...g, campaignKey: toC, programKey: toP });
    }
  }
  const allocations = new Map(state.allocations);
  for (const [id, a] of allocations) {
    if (a.orgId === orgId && a.campaignKey === fromC && a.programKey === fromP) {
      allocations.set(id, { ...a, campaignKey: toC, programKey: toP });
    }
  }

  // alias so future raw keys map
  const aliases = new Map(state.aliases || []);
  aliases.set(`${orgId}|campaign|${fromC}`, toC);
  aliases.set(`${orgId}|program|${fromC}|${fromP}`, `${toC}|${toP}`);

  return { state: { ...state, pots, gifts, allocations, aliases } };
}

export function applyAliases(orgId, campaignKey, programKey, state) {
  const aliases = state.aliases || new Map();
  let c = campaignKey;
  let p = programKey;
  const cAlias = aliases.get(`${orgId}|campaign|${c}`);
  if (cAlias) c = cAlias;
  const pAlias = aliases.get(`${orgId}|program|${c}|${p}`) || aliases.get(`${orgId}|program|${campaignKey}|${programKey}`);
  if (pAlias && pAlias.includes('|')) {
    const [nc, np] = pAlias.split('|');
    c = nc;
    p = np;
  }
  return { campaignKey: c, programKey: p };
}
