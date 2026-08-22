/**
 * SPEC-026 adapter. Three functions only:
 *   verify_webhook, normalize_gift, list_campaign_hints
 * Do not add a fourth function or a fifth capability.
 */
import { normalizeEveryOrgDonation } from './everyorg.mjs';
import { csvRowToEveryOrgPayload } from './csv.mjs';
import { CONNECTOR_CSV, CONNECTOR_DONORBOX, CONNECTOR_EVERY_ORG, CONNECTOR_GIVEBUTTER } from './sources.mjs';
import { listGivebutterHints, normalizeGivebutterGift, verifyGivebutterSignature } from './givebutter.mjs';
import { listDonorboxHints, normalizeDonorboxGift, verifyDonorboxSignature } from './donorbox.mjs';
import { authorizeWebhookToken } from '../http/webhook-auth.mjs';

function headerValue(request, name) {
  if (!request) return '';
  if (typeof request.headers?.get === 'function') {
    return request.headers.get(name) || '';
  }
  const headers = request.headers || {};
  const wanted = String(name).toLowerCase();
  const key = Object.keys(headers).find((item) => item.toLowerCase() === wanted);
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? value[0] : value || '';
}

function requestUrl(request) {
  if (!request) return '';
  if (typeof request.url === 'string') return request.url;
  return '';
}

/**
 * @param {Request|{headers?: Headers|object, url?: string}} request
 * @param {{ source: string, secrets?: object, rawBody?: string, now?: Function|number }} options
 */
export async function verify_webhook(request, { source, secrets = {}, rawBody = '', now } = {}) {
  const src = source || CONNECTOR_EVERY_ORG;
  if (src === CONNECTOR_GIVEBUTTER) {
    return verifyGivebutterSignature(headerValue(request, 'Signature'), secrets.givebutterSecret || secrets.GIVEBUTTER_WEBHOOK_SECRET || '');
  }
  if (src === CONNECTOR_DONORBOX) {
    return verifyDonorboxSignature(
      headerValue(request, 'Donorbox-Signature'),
      secrets.donorboxSecret || secrets.DONORBOX_WEBHOOK_SECRET || '',
      rawBody,
      { now },
    );
  }
  if (src === CONNECTOR_CSV) {
    return { ok: false, status: 404, error: 'not_found' };
  }
  const url = requestUrl(request);
  let queryToken = '';
  try {
    queryToken = url ? new URL(url, 'https://portfolio-signals.example').searchParams.get('token') || '' : '';
  } catch {
    queryToken = '';
  }
  if (!queryToken && request?.queryToken) queryToken = String(request.queryToken);
  return authorizeWebhookToken(
    headerValue(request, 'x-webhook-token'),
    queryToken,
    secrets.webhookToken || secrets.WEBHOOK_TOKEN || '',
  );
}

/**
 * @returns {{ fundraiserKey: string, designationKey: string }}
 */
export function list_campaign_hints(payload, { source } = {}) {
  const src = source || CONNECTOR_EVERY_ORG;
  if (src === CONNECTOR_GIVEBUTTER) return listGivebutterHints(payload);
  if (src === CONNECTOR_DONORBOX) return listDonorboxHints(payload);
  if (src === CONNECTOR_CSV) {
    return {
      fundraiserKey: String(payload?.campaignKey || payload?.fromFundraiser?.title || ''),
      designationKey: String(payload?.programKey || payload?.designation || ''),
    };
  }
  const fundraiserKey =
    payload?.fromFundraiser?.title || payload?.fromFundraiser?.slug || payload?.fromFundraiser?.id || '';
  return {
    fundraiserKey: String(fundraiserKey || ''),
    designationKey: String(payload?.designation || ''),
  };
}

/**
 * Shared gift-summary shape: chargeId, netAmount (as netCents), optional amount,
 * campaign/program hints, currency, donatedAt, opt-in identity.
 *
 * @returns {{ kind: 'credit'|'hold'|'uncomputable', gift?: object, chargeId?: string, eventName?: string, reason?: string, source: string }}
 */
export function normalize_gift(payload, { source, orgId, now } = {}) {
  const src = source || CONNECTOR_EVERY_ORG;
  if (src === CONNECTOR_GIVEBUTTER) {
    return normalizeGivebutterGift(payload, { orgId, now });
  }
  if (src === CONNECTOR_DONORBOX) {
    return normalizeDonorboxGift(payload, { orgId, now });
  }
  const everyOrgPayload = src === CONNECTOR_CSV ? csvRowToEveryOrgPayload(payload, { donatedAtFallback: typeof now === 'function' ? now() : now }) : payload;
  const gift = normalizeEveryOrgDonation(everyOrgPayload, { orgId });
  if (src === CONNECTOR_CSV) gift.source = CONNECTOR_CSV;
  return {
    kind: 'credit',
    source: gift.source,
    eventName: src === CONNECTOR_CSV ? 'csv.import' : 'gift.completed',
    gift,
  };
}
