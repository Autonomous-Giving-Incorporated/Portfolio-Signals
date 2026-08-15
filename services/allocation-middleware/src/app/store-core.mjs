/**
 * Workers-safe allocation state helpers. No node:fs.
 * File persistence stays in store.mjs (Node pilot only).
 */
import { emptyState } from '../domain/pots.mjs';

export function ensureExtras(state) {
  if (!state.proofs) state.proofs = new Map();
  if (!state.labels) state.labels = new Map();
  if (!state.aliases) state.aliases = new Map();
  return state;
}

export function serializeState(state) {
  return {
    gifts: [...state.gifts.entries()].map(([k, v]) => [
      k,
      {
        ...v,
        netCents: v.netCents.toString(),
        grossCents: v.grossCents.toString(),
      },
    ]),
    pots: [...state.pots.entries()].map(([k, v]) => [
      k,
      {
        ...v,
        creditedCents: v.creditedCents.toString(),
        allocatedCents: v.allocatedCents.toString(),
      },
    ]),
    allocations: [...state.allocations.entries()].map(([k, v]) => [
      k,
      { ...v, amountCents: v.amountCents.toString() },
    ]),
    exceptions: state.exceptions,
    proofs: state.proofs ? [...state.proofs.entries()] : [],
    labels: state.labels ? [...state.labels.entries()] : [],
    aliases: state.aliases ? [...state.aliases.entries()] : [],
  };
}

export function deserializeState(raw) {
  const state = ensureExtras(emptyState());
  if (!raw) return state;
  for (const [k, v] of raw.gifts || []) {
    state.gifts.set(k, {
      ...v,
      netCents: BigInt(v.netCents),
      grossCents: BigInt(v.grossCents),
    });
  }
  for (const [k, v] of raw.pots || []) {
    state.pots.set(k, {
      ...v,
      creditedCents: BigInt(v.creditedCents),
      allocatedCents: BigInt(v.allocatedCents),
    });
  }
  for (const [k, v] of raw.allocations || []) {
    state.allocations.set(k, {
      ...v,
      amountCents: BigInt(v.amountCents),
    });
  }
  state.exceptions = raw.exceptions || [];
  for (const [k, v] of raw.proofs || []) state.proofs.set(k, v);
  for (const [k, v] of raw.labels || []) state.labels.set(k, v);
  for (const [k, v] of raw.aliases || []) state.aliases.set(k, v);
  return state;
}

export function createMemoryStore(initial) {
  let state = ensureExtras(initial || emptyState());
  return {
    async load() {
      return state;
    },
    async save(next) {
      state = ensureExtras(next);
    },
  };
}
