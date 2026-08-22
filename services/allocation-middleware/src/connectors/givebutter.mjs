import { resolvePotPath } from '../domain/pots.mjs';
import { CONNECTOR_GIVEBUTTER } from './sources.mjs';
import { isTruthyOptIn, vendorAmountToCents } from './amount.mjs';
import { timingSafeEqualString } from './crypto.mjs';

/**
 * Givebutter Help (retrieved 2026-08-22): header Signature matches the
 * dashboard signing secret. Re-read vendor docs at implement time.
 */
export function verifyGivebutterSignature(headerValue, secret) {
  if (!secret) {
    return { ok: false, status: 503, error: 'webhook_token_unconfigured' };
  }
  const header = headerValue == null ? '' : String(headerValue);
  if (!header || !timingSafeEqualString(header, secret)) {
    return { ok: false, status: 401, error: 'UNAUTHORIZED' };
  }
  return { ok: true };
}

export function givebutterEventName(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  return String(payload.event || payload.type || '');
}

export function listGivebutterHints(payload) {
  const data = payload && typeof payload === 'object' ? payload.data || {} : {};
  const fundraiserKey = data.campaign_code || data.campaign_id || '';
  const designationKey = data.fund_code || data.fund_id || '';
  return { fundraiserKey: String(fundraiserKey || ''), designationKey: String(designationKey || '') };
}

export function normalizeGivebutterGift(payload, { orgId, now } = {}) {
  const eventName = givebutterEventName(payload);
  const data = payload && typeof payload === 'object' ? payload.data || {} : {};
  const chargeId = data.id != null && String(data.id).trim() ? String(data.id) : '';

  if (eventName === 'refund.created') {
    return {
      kind: 'hold',
      source: CONNECTOR_GIVEBUTTER,
      eventName,
      chargeId: chargeId || (data.transaction_id != null ? String(data.transaction_id) : ''),
      reason: 'refund_not_v1',
    };
  }

  if (eventName && eventName !== 'transaction.succeeded') {
    return {
      kind: 'hold',
      source: CONNECTOR_GIVEBUTTER,
      eventName,
      chargeId,
      reason: 'event_not_credited',
    };
  }

  if (!chargeId) throw new Error('chargeId required');

  const netCents = vendorAmountToCents(data.donated != null && data.donated !== '' ? data.donated : data.payout);
  if (netCents == null) {
    return {
      kind: 'uncomputable',
      source: CONNECTOR_GIVEBUTTER,
      eventName: eventName || 'transaction.succeeded',
      chargeId,
      reason: 'net_not_computable',
    };
  }

  const grossCents = vendorAmountToCents(data.amount) ?? netCents;
  const hints = listGivebutterHints(payload);
  const { campaignKey, programKey } = resolvePotPath({
    fundraiserKey: hints.fundraiserKey,
    designationKey: hints.designationKey,
  });
  const donatedAt = String(data.transacted_at || (typeof now === 'function' ? now() : now) || new Date().toISOString());
  const contact = isTruthyOptIn(data.communication_opt_in)
    ? extractGivebutterContact(data)
    : null;

  return {
    kind: 'credit',
    source: CONNECTOR_GIVEBUTTER,
    eventName: eventName || 'transaction.succeeded',
    gift: {
      chargeId,
      orgId,
      campaignKey,
      programKey,
      netCents,
      grossCents,
      currency: String(data.currency || 'USD'),
      donatedAt,
      source: CONNECTOR_GIVEBUTTER,
      contact,
    },
  };
}

function extractGivebutterContact(data) {
  const emailRaw = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) && emailRaw.length <= 254 ? emailRaw : '';
  if (!email) return null;
  return { email };
}
