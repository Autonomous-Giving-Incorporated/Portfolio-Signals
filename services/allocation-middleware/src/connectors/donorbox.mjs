import { resolvePotPath } from '../domain/pots.mjs';
import { CONNECTOR_DONORBOX } from './sources.mjs';
import { isTruthyOptIn, vendorAmountToCents } from './amount.mjs';
import { hmacSha256Base64, hmacSha256Hex, timingSafeEqualString } from './crypto.mjs';

/** Vendor verify article (retrieved 2026-08-22): 30–60 seconds. */
export const DONORBOX_SIGNATURE_MAX_AGE_SEC = 60;

/**
 * Donorbox Help (retrieved 2026-08-22): header Donorbox-Signature is
 * `timestamp,hmac-sha256`. Message is `timestamp.body`. Re-read at implement time.
 */
export async function verifyDonorboxSignature(headerValue, secret, rawBody, { now = Date.now, maxAgeSec = DONORBOX_SIGNATURE_MAX_AGE_SEC } = {}) {
  if (!secret) {
    return { ok: false, status: 503, error: 'webhook_token_unconfigured' };
  }
  const header = headerValue == null ? '' : String(headerValue).trim();
  const comma = header.indexOf(',');
  if (comma <= 0) {
    return { ok: false, status: 401, error: 'UNAUTHORIZED' };
  }
  const timestamp = header.slice(0, comma).trim();
  const signature = header.slice(comma + 1).trim();
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return { ok: false, status: 401, error: 'UNAUTHORIZED' };
  }
  const tsMs = Number(timestamp) * (timestamp.length <= 10 ? 1000 : 1);
  const ageSec = Math.abs((typeof now === 'function' ? now() : now) - tsMs) / 1000;
  if (!Number.isFinite(ageSec) || ageSec > maxAgeSec) {
    return { ok: false, status: 401, error: 'UNAUTHORIZED' };
  }
  const message = `${timestamp}.${rawBody == null ? '' : String(rawBody)}`;
  const hex = await hmacSha256Hex(secret, message);
  const b64 = await hmacSha256Base64(secret, message);
  if (timingSafeEqualString(signature, hex) || timingSafeEqualString(signature.toLowerCase(), hex) || timingSafeEqualString(signature, b64)) {
    return { ok: true };
  }
  return { ok: false, status: 401, error: 'UNAUTHORIZED' };
}

/** Map Donorbox v1 `action` / v2 `event_name`. Never infer donation.created. */
export function donorboxEventNameFromAction(action) {
  const raw = String(action || '').trim();
  if (!raw) return '';
  if (raw === 'new') return 'donation.created';
  if (raw === 'update' || raw === 'updated') return 'donation.updated';
  if (raw.includes('chargeback')) {
    return raw.startsWith('donation.') ? raw : 'donation.chargeback_created';
  }
  return raw;
}

export function donorboxDonation(payload) {
  if (Array.isArray(payload)) {
    if (payload.length !== 1 || !payload[0] || typeof payload[0] !== 'object') {
      const donation = payload[0] && typeof payload[0] === 'object' ? payload[0] : null;
      return { eventName: '', donation };
    }
    return { eventName: donorboxEventNameFromAction(payload[0].action), donation: payload[0] };
  }
  if (!payload || typeof payload !== 'object') {
    return { eventName: '', donation: null };
  }
  if (payload.donation && typeof payload.donation === 'object') {
    return {
      eventName: String(payload.event_name || donorboxEventNameFromAction(payload.donation.action) || ''),
      donation: payload.donation,
    };
  }
  if (payload.id != null && (payload.amount != null || payload.campaign)) {
    return {
      eventName: String(payload.event_name || donorboxEventNameFromAction(payload.action) || ''),
      donation: payload,
    };
  }
  return { eventName: String(payload.event_name || ''), donation: null };
}

export function listDonorboxHints(payload) {
  const { donation } = donorboxDonation(payload);
  const campaign = donation?.campaign && typeof donation.campaign === 'object' ? donation.campaign : {};
  const fundraiserKey = campaign.name || campaign.id || '';
  const designationKey = donation?.designation || '';
  return { fundraiserKey: String(fundraiserKey || ''), designationKey: String(designationKey || '') };
}

export function normalizeDonorboxGift(payload, { orgId, now } = {}) {
  const { eventName, donation } = donorboxDonation(payload);
  const chargeId = donation?.id != null && String(donation.id).trim() ? String(donation.id) : '';

  if (eventName !== 'donation.created') {
    const reason = eventName.startsWith('donation.chargeback')
      ? 'chargeback_not_v1'
      : eventName
        ? 'event_not_credited'
        : 'missing_event';
    return {
      kind: 'hold',
      source: CONNECTOR_DONORBOX,
      eventName,
      chargeId,
      reason,
    };
  }

  if (!chargeId) throw new Error('chargeId required');

  const amountCents = vendorAmountToCents(donation.amount);
  if (amountCents == null) {
    return {
      kind: 'uncomputable',
      source: CONNECTOR_DONORBOX,
      eventName: eventName || 'donation.created',
      chargeId,
      reason: 'net_not_computable',
    };
  }

  const feePresent = donation.processing_fee != null && donation.processing_fee !== '';
  const feeCents = feePresent ? vendorAmountToCents(donation.processing_fee) : 0n;
  if (feePresent && feeCents == null) {
    return {
      kind: 'uncomputable',
      source: CONNECTOR_DONORBOX,
      eventName: eventName || 'donation.created',
      chargeId,
      reason: 'net_not_computable',
    };
  }
  const netCents = amountCents - (feeCents || 0n);
  if (netCents < 0n) {
    return {
      kind: 'uncomputable',
      source: CONNECTOR_DONORBOX,
      eventName: eventName || 'donation.created',
      chargeId,
      reason: 'net_not_computable',
    };
  }

  const hints = listDonorboxHints(payload);
  const { campaignKey, programKey } = resolvePotPath({
    fundraiserKey: hints.fundraiserKey,
    designationKey: hints.designationKey,
  });
  const donatedAt = String(
    donation.donation_date || (typeof now === 'function' ? now() : now) || new Date().toISOString(),
  );
  const contact = isTruthyOptIn(donation.join_mailing_list) ? extractDonorboxContact(donation) : null;

  return {
    kind: 'credit',
    source: CONNECTOR_DONORBOX,
    eventName: eventName || 'donation.created',
    gift: {
      chargeId,
      orgId,
      campaignKey,
      programKey,
      netCents,
      grossCents: amountCents,
      currency: String(donation.currency || 'USD'),
      donatedAt,
      source: CONNECTOR_DONORBOX,
      contact,
    },
  };
}

function extractDonorboxContact(donation) {
  const donor = donation.donor && typeof donation.donor === 'object' ? donation.donor : {};
  const emailRaw = typeof donor.email === 'string' ? donor.email.trim().toLowerCase() : '';
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) && emailRaw.length <= 254 ? emailRaw : '';
  const donorPrincipal = donor.id != null && String(donor.id).trim() ? String(donor.id) : '';
  if (!email && !donorPrincipal) return null;
  const contact = {};
  if (email) contact.email = email;
  if (donorPrincipal) contact.donorPrincipal = donorPrincipal;
  return contact;
}
