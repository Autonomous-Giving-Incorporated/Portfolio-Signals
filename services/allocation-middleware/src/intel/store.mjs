/**
 * Append-only in-process Fund Intel store.
 * Separate from pot/gift state so a Recommendation cannot credit, debit, or lock a pot.
 */

export function emptyIntelState() {
  return {
    needs: new Map(),
    signals: new Map(),
    opportunities: new Map(),
    recommendations: new Map(),
    events: [],
  };
}

export function createIntelMemoryStore(initial) {
  let state = initial || emptyIntelState();
  return {
    async load() {
      return state;
    },
    async save(next) {
      state = next;
    },
  };
}

export function serializeIntelState(state) {
  return {
    needs: [...(state.needs || new Map()).entries()],
    signals: [...(state.signals || new Map()).entries()],
    opportunities: [...(state.opportunities || new Map()).entries()],
    recommendations: [...(state.recommendations || new Map()).entries()],
    events: state.events || [],
  };
}

export function deserializeIntelState(raw) {
  const state = emptyIntelState();
  if (!raw) return state;
  for (const [k, v] of raw.needs || []) state.needs.set(k, v);
  for (const [k, v] of raw.signals || []) state.signals.set(k, v);
  for (const [k, v] of raw.opportunities || []) state.opportunities.set(k, v);
  for (const [k, v] of raw.recommendations || []) state.recommendations.set(k, v);
  state.events = raw.events || [];
  return state;
}
