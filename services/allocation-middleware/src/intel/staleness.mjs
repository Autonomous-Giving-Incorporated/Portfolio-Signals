/**
 * Fund Intel staleness policy (implementation, not a SPEC-003 TTL).
 *
 * SPEC-003 v2.1.0 §25–26: a Signal is stale when observedAt (or capturedAt
 * if observedAt is absent) is older than the configured horizon for that
 * source class. The specification does not invent a numeric TTL.
 * Implementations MUST document their horizon in conformance evidence.
 *
 * This repo publishes P90D (90 days) as the default horizon for every
 * source class until an Accepted spec or operator policy replaces it.
 * Stale Signals MUST NOT be the sole support for a new Recommendation.
 * They MAY remain historical context on an Opportunity when at least one
 * non-stale supporting Signal remains.
 */

export const STALENESS_POLICY = Object.freeze({
  id: 'fund-intel-staleness-v1',
  spec: 'SPEC-003',
  specVersion: '2.1.0',
  specSetsNumericTtl: false,
  defaultHorizon: 'P90D',
  defaultHorizonDays: 90,
  basis: 'observedAt, else capturedAt',
  sourceClasses: Object.freeze({
    'every.org': 'P90D',
    csv: 'P90D',
    'operator-note': 'P90D',
    survey: 'P90D',
    default: 'P90D',
  }),
  rule: 'Sole remaining support older than the horizon → MUST NOT publish Recommendation. Opportunity MAY stay open or be dismissed.',
});

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function horizonDaysForSource(_source, policy = STALENESS_POLICY) {
  return policy.defaultHorizonDays;
}

export function signalReferenceTime(signal) {
  return signal?.observedAt || signal?.capturedAt || null;
}

export function isSignalStale(signal, nowIso, policy = STALENESS_POLICY) {
  const ref = signalReferenceTime(signal);
  const refMs = Date.parse(ref);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(refMs) || !Number.isFinite(nowMs)) return true;
  const horizonMs = horizonDaysForSource(signal?.source, policy) * MS_PER_DAY;
  return nowMs - refMs > horizonMs;
}

export function nonStaleSignals(signals, nowIso, policy = STALENESS_POLICY) {
  return (signals || []).filter((s) => !isSignalStale(s, nowIso, policy));
}
