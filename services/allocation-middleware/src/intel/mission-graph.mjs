/**
 * Read-only Mission Graph projection over existing Fund Intel records and
 * existing allocation-trail objects.
 *
 * SPEC-029 remains Proposed 0.1.0. This module is not an Accept, not a
 * system of record, not a graph database, and does not mint Signals.
 * Learning Feedback is NOT_COMPUTABLE until a verified Impact record exists.
 */

export const MISSION_GRAPH_SPEC = Object.freeze({
  id: 'SPEC-029',
  version: '0.1.0',
  status: 'proposed',
});

export const CONSUMER_PIN = Object.freeze({
  version: 'v2.0.0',
  commit: 'c089739',
});

const FORBIDDEN_EDGE_TYPES = Object.freeze([
  'Impact→Recommendation',
  'Impact→Approval',
  'Impact→Allocation',
  'Impact→Execution',
]);

function potKey(orgId, campaignKey, programKey) {
  return `${orgId}|${campaignKey}|${programKey}`;
}

function asList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value.values()];
  if (typeof value === 'object') return Object.values(value);
  return [];
}

function proofsFromTrail(trail) {
  const raw = trail?.proofs;
  if (!raw) return [];
  if (raw instanceof Map) {
    return [...raw.values()].flat();
  }
  if (Array.isArray(raw)) return raw;
  return Object.values(raw).flat();
}

function hasOwn(object, key) {
  return object != null && Object.prototype.hasOwnProperty.call(object, key);
}

function emptyProjection(status, reason) {
  return {
    kind: 'MissionGraphProjection',
    status,
    reason: reason || null,
    spec: { ...MISSION_GRAPH_SPEC },
    consumerPin: { ...CONSUMER_PIN },
    sourceOfRecord: false,
    persisted: false,
    nodes: [],
    edges: [],
    notComputable: [
      {
        type: 'LearningFeedback',
        reason: 'NO_VERIFIED_IMPACT',
        epistemic: 'NOT_COMPUTABLE',
      },
    ],
    learningFeedback: {
      status: 'NOT_COMPUTABLE',
      epistemic: 'NOT_COMPUTABLE',
      mintsSignal: false,
      reason: 'NO_VERIFIED_IMPACT',
    },
    forbiddenPathsPresent: [],
  };
}

function node({ type, owner, canonicalId, refs, epistemic = 'OBSERVED' }) {
  return {
    id: `${type[0].toLowerCase()}${type.slice(1)}:${canonicalId}`,
    type,
    owner,
    canonicalId: String(canonicalId),
    epistemic,
    refs: refs || {},
  };
}

function edge({ type, from, to, epistemic = 'OBSERVED' }) {
  return {
    id: `${from}→${to}:${type}`,
    type,
    from,
    to,
    epistemic,
  };
}

function addNode(nodes, seen, record) {
  if (!record?.canonicalId) return;
  if (seen.has(record.id)) return;
  seen.add(record.id);
  nodes.push(record);
}

function addEdge(edges, seen, record, nodeIds) {
  if (!record?.from || !record?.to) return;
  if (!nodeIds.has(record.from) || !nodeIds.has(record.to)) return;
  if (seen.has(record.id)) return;
  seen.add(record.id);
  edges.push(record);
}

function normalizeIntel(intel) {
  if (intel == null) return null;
  return {
    needs: asList(intel.needs),
    signals: asList(intel.signals),
    opportunities: asList(intel.opportunities),
    recommendations: asList(intel.recommendations),
  };
}

function normalizeTrail(trail) {
  if (trail == null) return null;
  return {
    gifts: asList(trail.gifts),
    pots: asList(trail.pots),
    allocations: asList(trail.allocations),
    proofs: proofsFromTrail(trail),
    impactNotices: asList(trail.impactNotices),
    proofWaivers: asList(trail.proofWaivers),
  };
}

function recordCount(intel, trail) {
  let n = 0;
  if (intel) {
    n += intel.needs.length + intel.signals.length + intel.opportunities.length + intel.recommendations.length;
  }
  if (trail) {
    n += trail.gifts.length + trail.pots.length + trail.allocations.length + trail.proofs.length
      + trail.impactNotices.length + trail.proofWaivers.length;
  }
  return n;
}

/**
 * Pure reader. Never writes intel or allocation state. Never mints a Signal.
 *
 * @param {{ intel?: object, trail?: object } | null | undefined} input
 */
export function projectMissionGraph(input) {
  if (input == null) {
    return emptyProjection('NOT_COMPUTABLE', 'MISSING_INPUTS');
  }

  const intelProvided = hasOwn(input, 'intel');
  const trailProvided = hasOwn(input, 'trail');
  if (!intelProvided && !trailProvided) {
    return emptyProjection('NOT_COMPUTABLE', 'MISSING_INPUTS');
  }

  const intel = intelProvided ? normalizeIntel(input.intel) : null;
  const trail = trailProvided ? normalizeTrail(input.trail) : null;

  if ((intelProvided && input.intel == null) && (trailProvided && input.trail == null)) {
    return emptyProjection('NOT_COMPUTABLE', 'MISSING_RECORDS');
  }

  if (recordCount(intel, trail) === 0) {
    return emptyProjection('EMPTY', 'NO_PROJECTABLE_RECORDS');
  }

  const nodes = [];
  const edges = [];
  const seenNodes = new Set();
  const seenEdges = new Set();
  const notComputable = [];

  if (intel) {
    for (const need of intel.needs) {
      const needId = need.needId || need.id;
      if (!needId) continue;
      addNode(nodes, seenNodes, node({
        type: 'Need',
        owner: 'fund-intel',
        canonicalId: needId,
        refs: { needId },
      }));
    }
    for (const signal of intel.signals) {
      if (!signal?.signalId) continue;
      if (signal.needId) {
        addNode(nodes, seenNodes, node({
          type: 'Need',
          owner: 'fund-intel',
          canonicalId: signal.needId,
          refs: { needId: signal.needId },
        }));
      }
      addNode(nodes, seenNodes, node({
        type: 'Signal',
        owner: 'fund-intel',
        canonicalId: signal.signalId,
        refs: {
          signalId: signal.signalId,
          needId: signal.needId || null,
          source: signal.source || null,
          subject: signal.subject || null,
          observedAt: signal.observedAt || null,
          capturedAt: signal.capturedAt || null,
          confidence: signal.confidence,
        },
      }));
    }
    for (const opportunity of intel.opportunities) {
      if (!opportunity?.opportunityId) continue;
      if (opportunity.needId) {
        addNode(nodes, seenNodes, node({
          type: 'Need',
          owner: 'fund-intel',
          canonicalId: opportunity.needId,
          refs: { needId: opportunity.needId },
        }));
      }
      addNode(nodes, seenNodes, node({
        type: 'Opportunity',
        owner: 'fund-intel',
        canonicalId: opportunity.opportunityId,
        refs: {
          opportunityId: opportunity.opportunityId,
          needId: opportunity.needId || null,
          status: opportunity.status || null,
          signalIds: [...(opportunity.signalIds || [])],
        },
      }));
    }
    for (const recommendation of intel.recommendations) {
      if (!recommendation?.recommendationId) continue;
      addNode(nodes, seenNodes, node({
        type: 'Recommendation',
        owner: 'fund-intel',
        canonicalId: recommendation.recommendationId,
        refs: {
          recommendationId: recommendation.recommendationId,
          opportunityId: recommendation.opportunityId || null,
          proposedAmount: recommendation.proposedAmount,
          currency: recommendation.currency || null,
        },
      }));
    }
  }

  if (trail) {
    for (const pot of trail.pots) {
      if (!pot || pot.campaignKey == null || pot.programKey == null) continue;
      const canonicalId = potKey(pot.orgId || '', pot.campaignKey, pot.programKey);
      addNode(nodes, seenNodes, node({
        type: 'Pot',
        owner: 'allocation-middleware',
        canonicalId,
        refs: {
          orgId: pot.orgId || null,
          campaignKey: pot.campaignKey,
          programKey: pot.programKey,
          creditedCents: pot.creditedCents == null ? null : String(pot.creditedCents),
          allocatedCents: pot.allocatedCents == null ? null : String(pot.allocatedCents),
        },
      }));
    }
    for (const gift of trail.gifts) {
      if (!gift?.chargeId) continue;
      addNode(nodes, seenNodes, node({
        type: 'GiftCredit',
        owner: 'allocation-middleware',
        canonicalId: gift.chargeId,
        refs: {
          chargeId: gift.chargeId,
          campaignKey: gift.campaignKey || null,
          programKey: gift.programKey || null,
          netCents: gift.netCents == null ? null : String(gift.netCents),
          donatedAt: gift.donatedAt || null,
          source: gift.source || null,
        },
      }));
    }
    for (const allocation of trail.allocations) {
      if (!allocation?.id) continue;
      addNode(nodes, seenNodes, node({
        type: 'Approval',
        owner: 'allocation-middleware',
        canonicalId: allocation.id,
        refs: {
          allocationId: allocation.id,
          approvedAt: allocation.approvedAt || null,
          approvedBy: allocation.approvedBy || null,
          status: allocation.status || null,
        },
      }));
      addNode(nodes, seenNodes, node({
        type: 'Allocation',
        owner: 'allocation-middleware',
        canonicalId: allocation.id,
        refs: {
          allocationId: allocation.id,
          campaignKey: allocation.campaignKey || null,
          programKey: allocation.programKey || null,
          amountCents: allocation.amountCents == null ? null : String(allocation.amountCents),
          purpose: allocation.purpose || null,
          status: allocation.status || null,
        },
      }));
    }
    for (const proof of trail.proofs) {
      if (!proof?.id) continue;
      addNode(nodes, seenNodes, node({
        type: 'Evidence',
        owner: 'allocation-middleware',
        canonicalId: proof.id,
        refs: {
          evidenceId: proof.id,
          allocationId: proof.allocationId || null,
          attachedAt: proof.attachedAt || null,
        },
      }));
    }
    for (const notice of trail.impactNotices) {
      if (!notice?.impactNoticeId) continue;
      addNode(nodes, seenNodes, node({
        type: 'ImpactNotice',
        owner: 'allocation-middleware',
        canonicalId: notice.impactNoticeId,
        refs: {
          impactNoticeId: notice.impactNoticeId,
          allocationId: notice.allocationId || null,
          evidenceId: notice.evidenceId || null,
          proofWaived: notice.proofWaived === true,
        },
      }));
    }
  }

  const nodeIds = new Set(nodes.map((n) => n.id));

  if (intel) {
    for (const signal of intel.signals) {
      if (!signal?.signalId || !signal.needId) continue;
      addEdge(edges, seenEdges, edge({
        type: 'OBSERVED_ABOUT',
        from: `signal:${signal.signalId}`,
        to: `need:${signal.needId}`,
      }), nodeIds);
    }
    for (const opportunity of intel.opportunities) {
      if (!opportunity?.opportunityId) continue;
      if (opportunity.needId) {
        addEdge(edges, seenEdges, edge({
          type: 'GROUPS',
          from: `opportunity:${opportunity.opportunityId}`,
          to: `need:${opportunity.needId}`,
        }), nodeIds);
      }
      for (const signalId of opportunity.signalIds || []) {
        if (nodeIds.has(`signal:${signalId}`)) {
          addEdge(edges, seenEdges, edge({
            type: 'SUPPORTED_BY',
            from: `opportunity:${opportunity.opportunityId}`,
            to: `signal:${signalId}`,
          }), nodeIds);
        } else {
          notComputable.push({
            type: 'OpportunitySupportingSignal',
            reason: 'SUPPORTING_SIGNAL_MISSING',
            epistemic: 'NOT_COMPUTABLE',
            refs: { opportunityId: opportunity.opportunityId, signalId },
          });
        }
      }
    }
    for (const recommendation of intel.recommendations) {
      if (!recommendation?.recommendationId || !recommendation.opportunityId) continue;
      if (nodeIds.has(`opportunity:${recommendation.opportunityId}`)) {
        addEdge(edges, seenEdges, edge({
          type: 'ADVISES',
          from: `recommendation:${recommendation.recommendationId}`,
          to: `opportunity:${recommendation.opportunityId}`,
        }), nodeIds);
      } else {
        notComputable.push({
          type: 'RecommendationOpportunity',
          reason: 'OPPORTUNITY_MISSING',
          epistemic: 'NOT_COMPUTABLE',
          refs: {
            recommendationId: recommendation.recommendationId,
            opportunityId: recommendation.opportunityId,
          },
        });
      }
      notComputable.push({
        type: 'RecommendationToApproval',
        reason: 'NO_STORED_LINK',
        epistemic: 'NOT_COMPUTABLE',
        refs: { recommendationId: recommendation.recommendationId },
      });
    }
  }

  if (trail) {
    for (const gift of trail.gifts) {
      if (!gift?.chargeId || gift.campaignKey == null || gift.programKey == null) continue;
      addEdge(edges, seenEdges, edge({
        type: 'CREDITS',
        from: `giftCredit:${gift.chargeId}`,
        to: `pot:${potKey(gift.orgId || '', gift.campaignKey, gift.programKey)}`,
      }), nodeIds);
    }
    for (const allocation of trail.allocations) {
      if (!allocation?.id) continue;
      addEdge(edges, seenEdges, edge({
        type: 'AUTHORIZES',
        from: `approval:${allocation.id}`,
        to: `allocation:${allocation.id}`,
      }), nodeIds);
      if (allocation.campaignKey != null && allocation.programKey != null) {
        addEdge(edges, seenEdges, edge({
          type: 'DRAWS',
          from: `allocation:${allocation.id}`,
          to: `pot:${potKey(allocation.orgId || '', allocation.campaignKey, allocation.programKey)}`,
        }), nodeIds);
      }
    }
    for (const proof of trail.proofs) {
      if (!proof?.id || !proof.allocationId) continue;
      addEdge(edges, seenEdges, edge({
        type: 'ATTESTS',
        from: `evidence:${proof.id}`,
        to: `allocation:${proof.allocationId}`,
      }), nodeIds);
    }
    for (const notice of trail.impactNotices) {
      if (!notice?.impactNoticeId) continue;
      if (notice.allocationId) {
        addEdge(edges, seenEdges, edge({
          type: 'NOTIFIES',
          from: `impactNotice:${notice.impactNoticeId}`,
          to: `allocation:${notice.allocationId}`,
        }), nodeIds);
      }
      if (notice.evidenceId) {
        addEdge(edges, seenEdges, edge({
          type: 'FOLLOWS',
          from: `impactNotice:${notice.impactNoticeId}`,
          to: `evidence:${notice.evidenceId}`,
        }), nodeIds);
      }
    }
  }

  const lifecycleGaps = [
    { type: 'Execution', reason: 'NO_EXECUTION_RECORD' },
    { type: 'Receipt', reason: 'GIFT_SUMMARY_IS_NOT_RECEIPT' },
    { type: 'Verification', reason: 'NO_VERIFICATION_RECORD' },
    { type: 'Impact', reason: 'NO_VERIFIED_IMPACT' },
    { type: 'LearningFeedback', reason: 'NO_VERIFIED_IMPACT' },
  ];
  for (const gap of lifecycleGaps) {
    if (nodes.some((n) => n.type === gap.type)) continue;
    if (notComputable.some((item) => item.type === gap.type)) continue;
    notComputable.push({
      ...gap,
      epistemic: 'NOT_COMPUTABLE',
    });
  }

  const forbiddenPathsPresent = edges
    .filter((item) => {
      const fromType = item.from.split(':')[0];
      const toType = item.to.split(':')[0];
      return fromType === 'impact' && (
        toType === 'recommendation'
        || toType === 'approval'
        || toType === 'allocation'
        || toType === 'execution'
      );
    })
    .map((item) => item.type);

  return {
    kind: 'MissionGraphProjection',
    status: 'PROJECTED',
    reason: null,
    spec: { ...MISSION_GRAPH_SPEC },
    consumerPin: { ...CONSUMER_PIN },
    sourceOfRecord: false,
    persisted: false,
    nodes,
    edges,
    notComputable,
    learningFeedback: {
      status: 'NOT_COMPUTABLE',
      epistemic: 'NOT_COMPUTABLE',
      mintsSignal: false,
      reason: 'NO_VERIFIED_IMPACT',
    },
    forbiddenPathsPresent,
    forbiddenEdgeTypes: [...FORBIDDEN_EDGE_TYPES],
  };
}

/**
 * Read-only helper: list existing intel records and an existing trail snapshot.
 * Calls only load/list methods. Does not publish, credit, allocate, or save.
 */
export async function projectMissionGraphFromRecords({ intel, trail } = {}) {
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
  if (!intel && trail === undefined) return projectMissionGraph(null);
  return projectMissionGraph(input);
}
