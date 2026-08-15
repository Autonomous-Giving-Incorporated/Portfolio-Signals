/**
 * Versioned Mission Intelligence metric policies (SPEC-030 Proposed 0.1.0).
 *
 * SPEC-030 names seven families and intentionally defines no scoring
 * formula. This module therefore fails closed: every evaluate path
 * returns NOT_COMPUTABLE. It does not Accept SPEC-030, invent a
 * numeric score, mint Signals, write Fund Intel or allocation stores,
 * treat ImpactNotice as Impact, or move the consumer pin off v2.0.0.
 *
 * Learning Feedback remains NOT_COMPUTABLE (no verified Impact).
 */

export const MISSION_METRICS_SPEC = Object.freeze({
  id: 'SPEC-030',
  version: '0.1.0',
  status: 'proposed',
});

export const CONSUMER_PIN = Object.freeze({
  version: 'v2.0.0',
  commit: 'c089739',
});

export const METRIC_FAMILY_IDS = Object.freeze([
  'OFS',
  'NPI',
  'EC',
  'FIL',
  'MY',
  'ECONF',
  'ORR',
]);

const EPISTEMIC = Object.freeze(['OBSERVED', 'INFERRED', 'SPECULATIVE', 'NOT_COMPUTABLE']);

const DONOR_PII_KEYS = Object.freeze([
  'donorName',
  'donorEmail',
  'donorPhone',
  'email',
  'phone',
  'firstName',
  'lastName',
  'fullName',
]);

const ID_REF_KEYS = Object.freeze([
  'opportunityId',
  'needId',
  'signalId',
  'recommendationId',
  'allocationId',
  'evidenceId',
  'impactId',
  'chargeId',
  'campaignKey',
  'programKey',
]);

function policy({ familyId, name, requiredInputs, admissibleEvidence, notes }) {
  return Object.freeze({
    id: `${familyId.toLowerCase()}-calculation-policy`,
    familyId,
    name,
    version: '0.1.0',
    status: 'proposed',
    requiredInputs: Object.freeze([...requiredInputs]),
    admissibleEvidence: Object.freeze([...admissibleEvidence]),
    stalenessHandling: 'NOT_COMPUTABLE',
    classificationMapping: Object.freeze([...EPISTEMIC]),
    tenantProjectApplicability: 'declared-on-output-scope',
    failureConditions: Object.freeze([
      'MISSING_INPUTS',
      'EMPTY_INPUTS',
      'NO_FORMULA',
      'IMPACT_NOTICE_IS_NOT_IMPACT',
      'NO_VERIFIED_IMPACT',
    ]),
    formula: null,
    formulaStatus: 'UNSPECIFIED_BY_SPEC_030',
    notes,
  });
}

export const METRIC_POLICIES = Object.freeze({
  OFS: policy({
    familyId: 'OFS',
    name: 'Opportunity Fit Score',
    requiredInputs: ['opportunity', 'need'],
    admissibleEvidence: ['Need', 'Opportunity', 'Signal', 'source-confidence'],
    notes: 'SPEC-030 lists alignment factors but does not give a formula.',
  }),
  NPI: policy({
    familyId: 'NPI',
    name: 'Need Pressure Index',
    requiredInputs: ['need'],
    admissibleEvidence: ['Need', 'Signal'],
    notes: 'SPEC-030 lists pressure inputs but does not give a formula. Absent inputs MUST NOT be implied.',
  }),
  EC: policy({
    familyId: 'EC',
    name: 'Evidence Completeness',
    requiredInputs: ['allocation'],
    admissibleEvidence: ['Allocation', 'Execution', 'Evidence', 'Verification', 'provenance'],
    notes: 'SPEC-030 lists lineage components but does not give a completeness formula.',
  }),
  FIL: policy({
    familyId: 'FIL',
    name: 'Funding-to-Impact Latency',
    requiredInputs: ['startTimestamp', 'endTimestamp', 'startKind', 'verifiedImpact'],
    admissibleEvidence: ['Approval', 'Allocation', 'verified Impact'],
    notes: 'Start kind is approval or allocation only. Recommendation time is not mixed in. ImpactNotice is not Impact.',
  }),
  MY: policy({
    familyId: 'MY',
    name: 'Mission Yield',
    requiredInputs: ['verifiedImpact', 'resourceBasis', 'populationContext', 'comparabilityBoundary'],
    admissibleEvidence: ['verified Impact', 'constrained resource basis'],
    notes: 'SPEC-030 requires a named outcome, basis, context, and comparability boundary, and gives no yield formula.',
  }),
  ECONF: policy({
    familyId: 'ECONF',
    name: 'Evidence Confidence',
    requiredInputs: ['subject', 'evidence'],
    admissibleEvidence: ['Signal', 'Recommendation', 'Verification', 'Impact', 'Evidence'],
    notes: 'A model confidence score is not Evidence Confidence and MUST NOT be substituted. No formula is given.',
  }),
  ORR: policy({
    familyId: 'ORR',
    name: 'Opportunity Realization Rate',
    requiredInputs: ['cohort', 'denominator', 'cohortDefinition', 'stageDefinitions', 'policyVersion'],
    admissibleEvidence: ['Opportunity', 'Recommendation', 'Approval', 'Execution', 'verified Impact'],
    notes: 'SPEC-030 requires denominator, cohort, stages, and version, and gives no realization formula.',
  }),
});

function defaultNow() {
  return new Date().toISOString();
}

function isMissingOrEmpty(value) {
  if (value == null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return true;
  }
  return false;
}

function looksLikeImpactNotice(value) {
  if (value == null || typeof value !== 'object') return false;
  if (value.type === 'ImpactNotice') return true;
  if (value.impactNoticeId && !value.impactId) return true;
  return false;
}

function isVerifiedImpact(value) {
  if (value == null || typeof value !== 'object') return false;
  if (looksLikeImpactNotice(value)) return false;
  return Boolean(value.impactId) && value.verified === true;
}

function inputHasImpactNotice(input) {
  if (input == null || typeof input !== 'object') return false;
  if (looksLikeImpactNotice(input.impactNotice) || looksLikeImpactNotice(input.verifiedImpact)) {
    return true;
  }
  if (Array.isArray(input.trail?.impactNotices) && input.trail.impactNotices.length > 0) {
    return true;
  }
  return false;
}

function requiredInputMissing(key, value) {
  if (key === 'verifiedImpact') return !isVerifiedImpact(value);
  if (key === 'startKind') {
    const kind = value == null ? '' : String(value).trim().toLowerCase();
    return kind !== 'approval' && kind !== 'allocation';
  }
  return isMissingOrEmpty(value);
}

function collectInputRefs(input) {
  const refs = [];
  const seen = new Set();

  function walk(value) {
    if (value == null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    for (const key of ID_REF_KEYS) {
      if (value[key] == null) continue;
      const text = String(value[key]).trim();
      if (!text) continue;
      const token = `${key}:${text}`;
      if (seen.has(token)) continue;
      seen.add(token);
      refs.push({ key, value: text });
    }
    for (const [key, child] of Object.entries(value)) {
      if (DONOR_PII_KEYS.includes(key)) continue;
      if (child && typeof child === 'object') walk(child);
    }
  }

  walk(input);
  return refs;
}

function scopeFrom(input) {
  const tenantId = input?.scope?.tenantId ?? input?.tenantId ?? input?.orgId ?? null;
  const projectId = input?.scope?.projectId ?? input?.projectId ?? null;
  return {
    tenantId: tenantId == null ? null : String(tenantId),
    projectId: projectId == null ? null : String(projectId),
  };
}

function notComputableResult({ familyId, policy, input, reason, now, notes }) {
  const reproducibilityReason = reason === 'NO_FORMULA'
    ? 'SPEC_030_DEFINES_NO_FORMULA'
    : reason;
  return {
    kind: 'MissionIntelligenceMetric',
    metricId: familyId,
    policy: policy
      ? {
        id: policy.id,
        familyId: policy.familyId,
        name: policy.name,
        version: policy.version,
        status: policy.status,
        formula: null,
      }
      : null,
    producedAt: now(),
    scope: scopeFrom(input),
    inputRefs: collectInputRefs(input),
    provenance: {
      source: input?.provenance?.source ?? input?.source ?? null,
      retained: true,
    },
    epistemic: 'NOT_COMPUTABLE',
    status: 'NOT_COMPUTABLE',
    reason,
    value: null,
    formula: null,
    reproducibility: {
      reproducible: false,
      reason: reproducibilityReason,
    },
    notes: [...notes],
    spec: { ...MISSION_METRICS_SPEC },
    consumerPin: { ...CONSUMER_PIN },
    persisted: false,
    sourceOfRecord: false,
  };
}

/**
 * Evaluate one SPEC-030 family. Always fail closed: SPEC-030 gives no formula.
 *
 * @param {string} familyId
 * @param {object | null | undefined} input
 * @param {{ now?: () => string }} [options]
 */
export function evaluateMetric(familyId, input, options = {}) {
  const now = options.now || defaultNow;
  const policy = METRIC_POLICIES[familyId];
  const notes = [];

  if (!policy) {
    return notComputableResult({
      familyId,
      policy: null,
      input,
      reason: 'UNKNOWN_FAMILY',
      now,
      notes,
    });
  }

  if (inputHasImpactNotice(input)) {
    notes.push('IMPACT_NOTICE_IS_NOT_IMPACT');
  }

  if (input == null) {
    return notComputableResult({
      familyId,
      policy,
      input,
      reason: 'MISSING_INPUTS',
      now,
      notes,
    });
  }

  const missing = policy.requiredInputs.filter((key) => requiredInputMissing(key, input[key]));
  if (missing.length > 0) {
    return notComputableResult({
      familyId,
      policy,
      input,
      reason: 'MISSING_INPUTS',
      now,
      notes,
    });
  }

  // SPEC-030 names the family and does not accept a formula by naming it.
  return notComputableResult({
    familyId,
    policy,
    input,
    reason: 'NO_FORMULA',
    now,
    notes,
  });
}

/**
 * Evaluate every SPEC-030 family. Never writes stores, never mints a Signal,
 * never mutates pots, never treats ImpactNotice as Impact.
 *
 * @param {object | null | undefined} input
 * @param {{ now?: () => string }} [options]
 */
export function evaluateMissionMetrics(input, options = {}) {
  const now = options.now || defaultNow;
  const families = {};
  for (const familyId of METRIC_FAMILY_IDS) {
    const familyInput = input != null && Object.prototype.hasOwnProperty.call(input, familyId)
      ? input[familyId]
      : input;
    families[familyId] = evaluateMetric(familyId, familyInput, { now });
  }
  return {
    kind: 'MissionIntelligenceEvaluation',
    spec: { ...MISSION_METRICS_SPEC },
    consumerPin: { ...CONSUMER_PIN },
    status: 'NOT_COMPUTABLE',
    reason: 'SPEC_030_DEFINES_NO_FORMULA',
    families,
    learningFeedback: {
      status: 'NOT_COMPUTABLE',
      epistemic: 'NOT_COMPUTABLE',
      mintsSignal: false,
      reason: 'NO_VERIFIED_IMPACT',
    },
    persisted: false,
    sourceOfRecord: false,
    producedAt: now(),
  };
}
