/**
 * Optional adapter: a verified gift summary MAY produce a Signal.
 * This is a separate write from creditGift / importCsv / webhook persist.
 * Gift without a Need credits a pot and MUST NOT invent a Recommendation.
 */

const CONNECTOR_SOURCES = new Set(['every.org', 'givebutter', 'donorbox', 'csv']);

function potSubject(gift) {
  const campaign = String(gift?.campaignKey || '').trim();
  const program = String(gift?.programKey || '').trim();
  if (campaign && program) return `${campaign}/${program}`;
  return campaign || program || '';
}

/**
 * @param {ReturnType<import('./service.mjs').createFundIntel>} intel
 * @param {{ gift: object, needId?: string, verified?: boolean, source?: string }} input
 */
export async function maybeSignalFromVerifiedGift(intel, input = {}) {
  const gift = input.gift;
  const source = input.source || gift?.source;
  if (!gift) return { created: false, reason: 'GIFT_REQUIRED' };
  if (source === 'stripe' || gift.source === 'stripe') {
    return { created: false, reason: 'STRIPE_FORBIDDEN' };
  }
  if (input.verified !== true) return { created: false, reason: 'UNVERIFIED' };
  if (!CONNECTOR_SOURCES.has(source)) return { created: false, reason: 'SOURCE_NOT_CONNECTOR' };
  const needId = input.needId == null ? '' : String(input.needId).trim();
  if (!needId) return { created: false, reason: 'NEED_REQUIRED' };

  const subject = potSubject(gift);
  if (!subject) return { created: false, reason: 'SUBJECT_REQUIRED' };

  const signal = await intel.publishSignal({
    needId,
    source,
    subject,
    observedAt: gift.donatedAt,
    capturedAt: input.capturedAt,
    confidence: input.confidence == null ? 0.8 : input.confidence,
    verified: true,
  });
  return { created: true, signal };
}
