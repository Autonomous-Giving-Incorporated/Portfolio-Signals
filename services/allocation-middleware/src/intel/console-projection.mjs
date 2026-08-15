/**
 * Read-only AGI operator/console projection.
 *
 * Composes the existing Mission Graph projection and fail-closed Mission
 * Intelligence metric evaluation. This is a view, not a source of record,
 * not a live product console, and not READY.
 *
 * SPEC-029 and SPEC-030 stay Proposed 0.1.0. This module does not Accept
 * them, invent scores / learning / Impact, mint Signals, write stores,
 * mutate pots, or move the consumer pin off v2.0.0.
 */

import {
  CONSUMER_PIN,
  MISSION_GRAPH_SPEC,
  projectMissionGraph,
} from './mission-graph.mjs';
import {
  evaluateMissionMetrics,
  METRIC_FAMILY_IDS,
  MISSION_METRICS_SPEC,
} from './metrics.mjs';

export { CONSUMER_PIN };

function asList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value.values()];
  if (typeof value === 'object') return Object.values(value);
  return [];
}

function collectRecordIds(intel) {
  return {
    signalIds: asList(intel?.signals).map((row) => row?.signalId).filter(Boolean),
    opportunityIds: asList(intel?.opportunities).map((row) => row?.opportunityId).filter(Boolean),
    recommendationIds: asList(intel?.recommendations).map((row) => row?.recommendationId).filter(Boolean),
  };
}

function metricFamiliesView(evaluation) {
  const families = {};
  for (const familyId of METRIC_FAMILY_IDS) {
    const result = evaluation.families[familyId];
    families[familyId] = {
      metricId: familyId,
      status: result.status,
      epistemic: result.epistemic,
      value: null,
      reason: result.reason,
    };
  }
  return families;
}

function learningFeedbackView(graph, metrics) {
  return {
    status: 'NOT_COMPUTABLE',
    epistemic: 'NOT_COMPUTABLE',
    mintsSignal: false,
    reason: graph.learningFeedback?.reason
      || metrics.learningFeedback?.reason
      || 'NO_VERIFIED_IMPACT',
  };
}

/**
 * Pure reader. Never writes intel or allocation state. Never mints a Signal.
 *
 * @param {{ intel?: object, trail?: object } | null | undefined} input
 * @param {{ now?: () => string }} [options]
 */
export function projectAgiConsole(input, options = {}) {
  const graph = projectMissionGraph(input);
  const metrics = evaluateMissionMetrics(input, options);
  const records = collectRecordIds(input?.intel);

  return {
    kind: 'AgiConsoleProjection',
    status: graph.status,
    reason: graph.reason,
    live: false,
    ready: false,
    sourceOfRecord: false,
    persisted: false,
    consumerPin: { ...CONSUMER_PIN },
    specs: {
      'SPEC-029': { ...MISSION_GRAPH_SPEC },
      'SPEC-030': { ...MISSION_METRICS_SPEC },
    },
    records,
    graph: {
      status: graph.status,
      reason: graph.reason,
    },
    metrics: {
      status: metrics.status,
      reason: metrics.reason,
      families: metricFamiliesView(metrics),
    },
    learningFeedback: learningFeedbackView(graph, metrics),
    notComputable: (graph.notComputable || []).filter((item) => (
      item.type === 'Impact' || item.type === 'LearningFeedback'
    )),
    forbiddenPathsPresent: [...(graph.forbiddenPathsPresent || [])],
  };
}

/**
 * Read-only helper: list existing intel records and an existing trail snapshot.
 * Calls only load/list methods. Does not publish, credit, allocate, or save.
 */
export async function projectAgiConsoleFromRecords({ intel, trail } = {}, options = {}) {
  const input = {};
  if (intel) {
    input.intel = {
      needs: typeof intel.listNeeds === 'function' ? await intel.listNeeds() : [],
      signals: typeof intel.listSignals === 'function' ? await intel.listSignals() : [],
      opportunities: typeof intel.listOpportunities === 'function' ? await intel.listOpportunities() : [],
      recommendations: typeof intel.listRecommendations === 'function' ? await intel.listRecommendations() : [],
    };
  }
  if (trail !== undefined) {
    input.trail = typeof trail === 'function' ? await trail() : trail;
  }
  if (!intel && trail === undefined) return projectAgiConsole(undefined, options);
  return projectAgiConsole(input, options);
}
