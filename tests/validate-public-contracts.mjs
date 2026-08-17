/**
 * Fail-closed checks matching AGI integration/validate-public.ts and the
 * published public-campaign / public-impact shapes. Not a new schema.
 */

const CAMPAIGN_EXECUTION_STATES = [
  'blocked',
  'review',
  'authorized',
  'active',
  'sealed',
];
const GATE_STATES = ['pending', 'approved', 'blocked', 'not_applicable'];
const ALLOCATION_STATUSES = ['proposed', 'approved', 'active', 'closed'];
const ALLOCATION_ID = /^alloc_[a-z0-9_]+$/;
const IMPACT_EVENT_TYPES = new Set([
  'purchase_approved',
  'receipt_attached',
  'equipment_delivered',
  'program_held',
  'attendance_verified',
  'notification_delivered',
]);
const VERIFICATION_STATUSES = new Set(['pending', 'verified', 'rejected']);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSemver(value) {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
}

function isDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function isNonNegInt(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function malformed(reason) {
  return { kind: 'malformed', reason };
}

function rejected(reason) {
  return { kind: 'policy_rejected', reason };
}

export function isAllocationId(value) {
  return typeof value === 'string' && ALLOCATION_ID.test(value);
}

export function validatePublicCampaign(value) {
  if (!isRecord(value)) return malformed('campaign.schema.root');
  if (value.authority !== 'advisory_only') return rejected('campaign.authority_rejected');
  if (!isSemver(value.version)) return malformed('campaign.schema.version');
  if (!isDateOnly(value.updatedAt)) return malformed('campaign.schema.updatedAt');

  if (!isRecord(value.campaign)) return malformed('campaign.schema.campaign');
  if (!isNonNegInt(value.campaign.minimumTarget) || !isNonNegInt(value.campaign.stretchTarget)) {
    return malformed('campaign.schema.campaign.targets');
  }
  if (value.campaign.currency !== 'USD') return malformed('campaign.schema.campaign.currency');
  if (
    !isNonEmptyString(value.campaign.minimumCaseState) ||
    !isNonEmptyString(value.campaign.stretchCaseState)
  ) {
    return malformed('campaign.schema.campaign.caseState');
  }

  if (!isRecord(value.registry)) return malformed('campaign.schema.registry');
  for (const key of [
    'normalizedMemberIds',
    'bayAreaRecords',
    'organizerLabels',
    'privateRelayOccurrences',
    'highEngagementRecords',
    'outreachReadyRecords',
  ]) {
    if (!isNonNegInt(value.registry[key])) {
      return malformed(`campaign.schema.registry.${key}`);
    }
  }
  if (!isNonEmptyString(value.registry.qualification)) {
    return malformed('campaign.schema.registry.qualification');
  }

  if (!isRecord(value.execution)) return malformed('campaign.schema.execution');
  if (!CAMPAIGN_EXECUTION_STATES.includes(value.execution.state)) {
    return malformed('campaign.schema.execution.state');
  }
  if (!isNonEmptyString(value.execution.reason)) {
    return malformed('campaign.schema.execution.reason');
  }

  if (!Array.isArray(value.gates) || value.gates.length < 1) {
    return malformed('campaign.schema.gates');
  }
  for (const item of value.gates) {
    if (!isRecord(item) || !/^[a-z0-9_]+$/.test(item.id) || !isNonEmptyString(item.label)) {
      return malformed('campaign.schema.gates.entry');
    }
    if (!GATE_STATES.includes(item.state)) return malformed('campaign.schema.gates.state');
  }

  if (!isRecord(value.privacy)) return malformed('campaign.schema.privacy');
  if (value.privacy.classification !== 'public_aggregate_only') {
    return rejected('campaign.privacy_policy_rejected');
  }
  if (
    value.privacy.piiAllowed !== false ||
    value.privacy.rawRegistryAllowed !== false ||
    value.privacy.donorHistoryAllowed !== false ||
    value.privacy.privateNotesAllowed !== false
  ) {
    return rejected('campaign.privacy_policy_rejected');
  }

  const allocations = [];
  if (value.allocations !== undefined) {
    if (!Array.isArray(value.allocations)) return malformed('campaign.schema.allocations');
    for (const item of value.allocations) {
      if (!isRecord(item)) return malformed('campaign.schema.allocations.entry');
      if (!isAllocationId(item.allocationId)) {
        return malformed('campaign.schema.allocations.allocationId');
      }
      if (!isNonEmptyString(item.fundName)) {
        return malformed('campaign.schema.allocations.fundName');
      }
      if (!ALLOCATION_STATUSES.includes(item.status)) {
        return malformed('campaign.schema.allocations.status');
      }
      allocations.push({
        allocationId: item.allocationId,
        fundName: item.fundName,
        status: item.status,
      });
    }
  }

  return {
    updatedAt: value.updatedAt,
    authority: 'advisory_only',
    execution: { state: value.execution.state, reason: value.execution.reason },
    allocations,
  };
}

export function validatePublicImpact(value) {
  if (!isRecord(value)) return malformed('impact.schema.root');
  if (value.authority !== 'public_aggregate_only') return rejected('impact.authority_rejected');
  if (!isSemver(value.version)) return malformed('impact.schema.version');
  if (!isDateOnly(value.updatedAt)) return malformed('impact.schema.updatedAt');
  if (!isNonEmptyString(value.source)) return malformed('impact.schema.source');

  if (!isRecord(value.privacy)) return malformed('impact.schema.privacy');
  if (value.privacy.classification !== 'public_aggregate_only') {
    return rejected('impact.privacy_policy_rejected');
  }
  if (
    value.privacy.piiAllowed !== false ||
    value.privacy.donorNamesAllowed !== false ||
    value.privacy.individualDonorAttributionAllowed !== false ||
    value.privacy.operatorIdentityAllowed !== false
  ) {
    return rejected('impact.privacy_policy_rejected');
  }

  if (!isRecord(value.summary)) return malformed('impact.schema.summary');
  if (!isNonNegInt(value.summary.outcomeCount) || !isNonNegInt(value.summary.totalParticipantsPublic)) {
    return malformed('impact.schema.summary');
  }
  if (!Array.isArray(value.outcomes)) return malformed('impact.schema.outcomes');

  const verified = value.outcomes.find((item) => isRecord(item) && item.evidenceState === 'VERIFIED');
  if (!verified) return rejected('impact.missing_verified_outcome');

  for (const key of [
    'publicId',
    'impactEventId',
    'organizationName',
    'programName',
    'allocationName',
    'eventType',
    'eventDate',
    'attributionMethod',
    'receiptHash',
    'createdAt',
  ]) {
    if (!isNonEmptyString(verified[key])) return malformed(`impact.schema.outcome.${key}`);
  }
  if (!isNonNegInt(verified.participantsPublic)) {
    return malformed('impact.schema.outcome.participantsPublic');
  }
  if (verified.allocationId !== undefined && !isAllocationId(verified.allocationId)) {
    return malformed('impact.schema.outcome.allocationId');
  }

  return {
    updatedAt: value.updatedAt,
    authority: 'public_aggregate_only',
    outcome: {
      organizationName: verified.organizationName,
      programName: verified.programName,
      allocationName: verified.allocationName,
      allocationId: isAllocationId(verified.allocationId) ? verified.allocationId : null,
      participantsPublic: verified.participantsPublic,
      evidenceState: 'VERIFIED',
      eventDate: verified.eventDate,
    },
  };
}

export function validatePublicImpactNarrative(value) {
  if (!isRecord(value) || !isRecord(value.decision) || !Array.isArray(value.events)) {
    return malformed('narrative.schema.root');
  }
  const decision = value.decision;
  if (decision.schemaVersion !== '2026-08-02') return malformed('decision.schema.schemaVersion');
  if (!isAllocationId(decision.allocationId)) return malformed('decision.schema.allocationId');
  if (!isNonEmptyString(decision.fundName)) return malformed('decision.schema.fundName');
  if (!isNonEmptyString(decision.rationale)) return malformed('decision.schema.rationale');
  if (decision.status !== 'approved') return malformed('decision.schema.status');
  if (!isNonEmptyString(decision.publishedAt)) return malformed('decision.schema.publishedAt');
  if ('donorId' in decision || 'donor' in decision || 'donorName' in decision) {
    return rejected('decision.donor_level_data');
  }

  for (const event of value.events) {
    if (!isRecord(event)) return malformed('event.schema.root');
    if (event.schemaVersion !== '2026-08-02') return malformed('event.schema.schemaVersion');
    if (!isAllocationId(event.allocationId)) return malformed('event.schema.allocationId');
    if (event.allocationId !== decision.allocationId) return malformed('narrative.join.allocationId');
    if (!isNonEmptyString(event.eventId)) return malformed('event.schema.eventId');
    if (!IMPACT_EVENT_TYPES.has(event.type)) return malformed('event.schema.type');
    if (!isNonEmptyString(event.occurredAt)) return malformed('event.schema.occurredAt');
    if (!VERIFICATION_STATUSES.has(event.verificationStatus)) {
      return malformed('event.schema.verificationStatus');
    }
    if (event.evidenceReference !== undefined) {
      if (!isNonEmptyString(event.evidenceReference)) {
        return malformed('event.schema.evidenceReference');
      }
      if (/https?:\/\//i.test(event.evidenceReference) || event.evidenceReference.includes('://')) {
        return rejected('event.evidence_reference_not_public_safe');
      }
    }
  }

  return { decision, events: value.events };
}
