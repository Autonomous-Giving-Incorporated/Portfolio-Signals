import { assertNoDonorIdentityFields, assertNoDonorPii, extractKnownDonorTokens } from './pii.mjs';
import { STALENESS_POLICY, isSignalStale, nonStaleSignals } from './staleness.mjs';
import { createIntelMemoryStore, emptyIntelState } from './store.mjs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONNECTOR_SOURCES = new Set(['every.org', 'csv']);
const FORBIDDEN_SOURCES = new Set(['stripe', 'stripe_billing', 'stripe-webhook']);

function codedError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

function requireNonEmpty(value, code) {
  if (value == null || String(value).trim() === '') throw codedError(code);
  return String(value).trim();
}

function requireRfc3339(value, code) {
  const text = requireNonEmpty(value, code);
  if (!Number.isFinite(Date.parse(text))) throw codedError(code);
  return text;
}

function requireUuid(value, code) {
  const text = requireNonEmpty(value, code);
  if (!UUID_RE.test(text)) throw codedError(code);
  return text;
}

function requireConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw codedError('INVALID_CONFIDENCE');
  return n;
}

function requireAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw codedError('INVALID_PROPOSED_AMOUNT');
  return n;
}

function requireCurrency(value) {
  const text = requireNonEmpty(value, 'INVALID_CURRENCY');
  if (!/^[A-Z]{3}$/.test(text)) throw codedError('INVALID_CURRENCY');
  return text;
}

function publicOpportunity(record) {
  return {
    opportunityId: record.opportunityId,
    needId: record.needId,
    title: record.title,
    status: record.status,
    createdAt: record.createdAt,
    signalIds: [...record.signalIds],
  };
}

function publicRecommendation(record) {
  return {
    recommendationId: record.recommendationId,
    opportunityId: record.opportunityId,
    proposedAmount: record.proposedAmount,
    currency: record.currency,
    rationale: record.rationale,
    createdAt: record.createdAt,
  };
}

function publicSignal(record) {
  return {
    signalId: record.signalId,
    needId: record.needId,
    source: record.source,
    subject: record.subject,
    observedAt: record.observedAt,
    capturedAt: record.capturedAt,
    confidence: record.confidence,
  };
}

function appendEvent(state, eventType, payload, { idgen, now }) {
  return {
    ...state,
    events: [
      ...state.events,
      {
        eventType,
        eventId: idgen(),
        payload,
        recordedAt: now(),
      },
    ],
  };
}

/**
 * In-process Fund Intel (SPEC-003 v2.1.0). Not a microservice, not a graph DB,
 * not Approval/Allocation/Evidence. Recommendations never touch pots.
 */
export function createFundIntel({
  now = () => new Date().toISOString(),
  idgen = () => crypto.randomUUID(),
  store = createIntelMemoryStore(),
  stalenessPolicy = STALENESS_POLICY,
} = {}) {
  let mutationQueue = Promise.resolve();

  async function withState(fn) {
    const run = mutationQueue.then(async () => {
      const state = (await store.load()) || emptyIntelState();
      const result = fn(state);
      if (result && result.state) await store.save(result.state);
      return result;
    });
    mutationQueue = run.catch(() => {});
    return run;
  }

  function supportingSignals(state, signalIds) {
    return signalIds.map((id) => {
      const signal = state.signals.get(id);
      if (!signal) throw codedError('SUPPORTING_SIGNAL_MISSING');
      return signal;
    });
  }

  return {
    stalenessPolicy,

    async registerNeed({ needId } = {}) {
      const id = requireNonEmpty(needId, 'NEED_REQUIRED');
      await withState((state) => {
        const needs = new Map(state.needs);
        if (!needs.has(id)) needs.set(id, { needId: id, registeredAt: now() });
        return { state: { ...state, needs } };
      });
      return { needId: id };
    },

    async publishSignal(input = {}) {
      assertNoDonorIdentityFields(input);
      const needId = requireNonEmpty(input.needId, 'NEED_REQUIRED');
      const source = requireNonEmpty(input.source, 'SOURCE_REQUIRED');
      if (FORBIDDEN_SOURCES.has(source)) throw codedError('STRIPE_FORBIDDEN');
      if (CONNECTOR_SOURCES.has(source) && input.verified !== true) {
        throw codedError('UNVERIFIED_CONNECTOR');
      }
      const subject = requireNonEmpty(input.subject, 'SUBJECT_REQUIRED');
      const extraTokens = extractKnownDonorTokens(input);
      assertNoDonorPii('subject', subject, extraTokens);
      const observedAt = requireRfc3339(input.observedAt, 'INVALID_OBSERVED_AT');
      const capturedAt = input.capturedAt
        ? requireRfc3339(input.capturedAt, 'INVALID_CAPTURED_AT')
        : observedAt;
      const confidence = requireConfidence(input.confidence);
      const signalId = input.signalId ? requireNonEmpty(input.signalId, 'SIGNAL_ID_REQUIRED') : idgen();

      return withState((state) => {
        if (!state.needs.has(needId)) throw codedError('NEED_NOT_REGISTERED');
        if (state.signals.has(signalId)) throw codedError('SIGNAL_IMMUTABLE');
        const signal = {
          signalId,
          needId,
          source,
          subject,
          observedAt,
          capturedAt,
          confidence,
        };
        const signals = new Map(state.signals);
        signals.set(signalId, signal);
        const next = appendEvent(
          { ...state, signals },
          'SignalDetected',
          publicSignal(signal),
          { idgen, now },
        );
        return { state: next, signal: publicSignal(signal) };
      }).then((r) => r.signal);
    },

    async createOpportunity(input = {}) {
      assertNoDonorIdentityFields(input);
      const needId = requireNonEmpty(input.needId, 'NEED_REQUIRED');
      const title = requireNonEmpty(input.title, 'TITLE_REQUIRED');
      assertNoDonorPii('title', title, extractKnownDonorTokens(input));
      const signalIds = [...new Set((input.signalIds || []).map((id) => String(id)))];
      if (signalIds.length < 1) throw codedError('INSUFFICIENT_EVIDENCE');
      const opportunityId = input.opportunityId
        ? requireUuid(input.opportunityId, 'INVALID_OPPORTUNITY_ID')
        : idgen();

      return withState((state) => {
        if (!state.needs.has(needId)) throw codedError('NEED_NOT_REGISTERED');
        if (state.opportunities.has(opportunityId)) throw codedError('OPPORTUNITY_EXISTS');
        const signals = supportingSignals(state, signalIds);
        if (signals.some((s) => s.needId !== needId)) throw codedError('NEED_MISMATCH');
        const at = now();
        if (nonStaleSignals(signals, at, stalenessPolicy).length < 1) {
          throw codedError('STALE_SUPPORT');
        }
        const record = {
          opportunityId,
          needId,
          title,
          status: 'open',
          createdAt: at,
          signalIds,
        };
        const opportunities = new Map(state.opportunities);
        opportunities.set(opportunityId, record);
        const next = appendEvent(
          { ...state, opportunities },
          'OpportunityCreated',
          publicOpportunity(record),
          { idgen, now },
        );
        return { state: next, opportunity: publicOpportunity(record) };
      }).then((r) => r.opportunity);
    },

    async dismissOpportunity({ opportunityId } = {}) {
      const id = requireUuid(opportunityId, 'INVALID_OPPORTUNITY_ID');
      return withState((state) => {
        const existing = state.opportunities.get(id);
        if (!existing) throw codedError('OPPORTUNITY_NOT_FOUND');
        if (existing.status === 'converted') throw codedError('OPPORTUNITY_ALREADY_CONVERTED');
        const record = { ...existing, status: 'dismissed' };
        const opportunities = new Map(state.opportunities);
        opportunities.set(id, record);
        return { state: { ...state, opportunities }, opportunity: publicOpportunity(record) };
      }).then((r) => r.opportunity);
    },

    async publishRecommendation(input = {}) {
      assertNoDonorIdentityFields(input);
      const opportunityId = requireUuid(input.opportunityId, 'INVALID_OPPORTUNITY_ID');
      const rationale = requireNonEmpty(input.rationale, 'RATIONALE_REQUIRED');
      assertNoDonorPii('rationale', rationale, extractKnownDonorTokens(input));
      const proposedAmount = requireAmount(input.proposedAmount);
      const currency = requireCurrency(input.currency || 'USD');
      const recommendationId = input.recommendationId
        ? requireUuid(input.recommendationId, 'INVALID_RECOMMENDATION_ID')
        : idgen();

      return withState((state) => {
        if (state.recommendations.has(recommendationId)) throw codedError('RECOMMENDATION_IMMUTABLE');
        const opportunity = state.opportunities.get(opportunityId);
        if (!opportunity) throw codedError('OPPORTUNITY_NOT_FOUND');
        if (opportunity.status === 'dismissed') throw codedError('OPPORTUNITY_DISMISSED');
        if (opportunity.status !== 'open' && opportunity.status !== 'converted') {
          throw codedError('OPPORTUNITY_NOT_OPEN');
        }
        const signals = supportingSignals(state, opportunity.signalIds);
        const at = now();
        if (nonStaleSignals(signals, at, stalenessPolicy).length < 1) {
          throw codedError('STALE_SUPPORT');
        }
        const record = {
          recommendationId,
          opportunityId,
          proposedAmount,
          currency,
          rationale,
          createdAt: at,
          supportingSignalIds: [...opportunity.signalIds],
        };
        const recommendations = new Map(state.recommendations);
        recommendations.set(recommendationId, record);
        const opportunities = new Map(state.opportunities);
        opportunities.set(opportunityId, { ...opportunity, status: 'converted' });
        const next = appendEvent(
          { ...state, recommendations, opportunities },
          'RecommendationGenerated',
          publicRecommendation(record),
          { idgen, now },
        );
        return {
          state: next,
          recommendation: publicRecommendation(record),
          opportunity: publicOpportunity(opportunities.get(opportunityId)),
        };
      }).then((r) => ({
        recommendation: r.recommendation,
        opportunity: r.opportunity,
      }));
    },

    async listNeeds() {
      const state = (await store.load()) || emptyIntelState();
      return [...state.needs.values()].map((need) => ({
        needId: need.needId,
        registeredAt: need.registeredAt,
      }));
    },

    async getSignal(signalId) {
      const state = (await store.load()) || emptyIntelState();
      const record = state.signals.get(signalId);
      return record ? publicSignal(record) : null;
    },

    async listSignals() {
      const state = (await store.load()) || emptyIntelState();
      return [...state.signals.values()].map(publicSignal);
    },

    async getOpportunity(opportunityId) {
      const state = (await store.load()) || emptyIntelState();
      const record = state.opportunities.get(opportunityId);
      return record ? publicOpportunity(record) : null;
    },

    async listOpportunities() {
      const state = (await store.load()) || emptyIntelState();
      return [...state.opportunities.values()].map(publicOpportunity);
    },

    async listRecommendations() {
      const state = (await store.load()) || emptyIntelState();
      return [...state.recommendations.values()].map(publicRecommendation);
    },

    async listEvents() {
      const state = (await store.load()) || emptyIntelState();
      return [...(state.events || [])];
    },

    isSignalStale(signal, at = now()) {
      return isSignalStale(signal, at, stalenessPolicy);
    },
  };
}
