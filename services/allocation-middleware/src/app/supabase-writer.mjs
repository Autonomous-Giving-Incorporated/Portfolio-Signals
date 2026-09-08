/**
 * Service-role writer for allocation webhook ingest → platform Supabase am_* tables.
 * Gift insert is idempotent on charge_id. Pot credit is an atomic increment
 * via service-role RPC `am_credit_pot` (INSERT … ON CONFLICT DO UPDATE).
 * Does not use D1, Render, or Fly disk.
 */
import { normalize_gift } from '../connectors/adapter.mjs';
import { extractOptInContact } from '../connectors/contact.mjs';
import { CONNECTOR_EVERY_ORG } from '../connectors/sources.mjs';

const MAX_KEY = 128;
export const STORE_FETCH_TIMEOUT_MS = 8000;

function requireBounded(value, maximum, code) {
  if (String(value ?? '').length > maximum) throw new Error(code);
}

function boundedGift(gift) {
  requireBounded(gift.chargeId, 256, 'CHARGE_ID_TOO_LONG');
  requireBounded(gift.campaignKey, MAX_KEY, 'CAMPAIGN_KEY_TOO_LONG');
  requireBounded(gift.programKey, MAX_KEY, 'PROGRAM_KEY_TOO_LONG');
  requireBounded(gift.currency, 16, 'CURRENCY_TOO_LONG');
  return gift;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createSupabaseAllocationWriter({
  supabaseUrl,
  serviceRoleKey,
  orgId,
  fetchImpl = fetch,
  timeoutMs = STORE_FETCH_TIMEOUT_MS,
}) {
  const base = String(supabaseUrl || '').replace(/\/$/, '');
  if (!base || !serviceRoleKey || !orgId) {
    throw new Error('allocation_store_unavailable');
  }

  async function rest(path, init = {}) {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, {
      ...init,
      signal: init.signal || AbortSignal.timeout(timeoutMs),
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        accept: 'application/json',
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
    });
    return response;
  }

  async function restWithRetry(path, init = {}) {
    try {
      const first = await rest(path, init);
      if (first.status < 500) return first;
    } catch {
      // retry once with jitter; fail closed if the second attempt fails
    }
    await sleep(40 + Math.floor(Math.random() * 80));
    return rest(path, init);
  }

  async function readJson(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('allocation_store_unavailable');
    }
  }

  async function persistEvent(payload, { source, eventName, chargeId }) {
    const id = `wh_${source}_${chargeId || 'none'}_${Date.now()}`;
    const response = await restWithRetry('am_webhook_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        id,
        client_id: orgId,
        source,
        event_name: eventName || '',
        charge_id: chargeId || null,
        payload,
      }),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error('allocation_store_unavailable');
    }
  }

  async function insertException({ id, code, message, ref }) {
    const response = await rest('am_exceptions?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        id,
        client_id: orgId,
        code,
        message,
        open: true,
        ref: ref || {},
      }),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error('allocation_store_unavailable');
    }
    return { created: false, exception: { id, code } };
  }

  async function insertCurrencyException(gift) {
    return insertException({
      id: `ex_${gift.chargeId}_currency`,
      code: 'CURRENCY_MISMATCH',
      message: `currency ${gift.currency} not USD`,
      ref: { chargeId: gift.chargeId },
    });
  }

  async function creditPot(gift) {
    const response = await rest('rpc/am_credit_pot', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        p_client_id: orgId,
        p_campaign_key: gift.campaignKey,
        p_program_key: gift.programKey,
        p_credited_cents: Number(gift.netCents),
      }),
    });
    if (!response.ok) throw new Error('allocation_store_unavailable');
    const payload = await readJson(response);
    const row = Array.isArray(payload) ? payload[0] : payload;
    if (!row) throw new Error('allocation_store_unavailable');
    return { newPot: Boolean(row.inserted) };
  }

  async function ingestGift(payload, { source = CONNECTOR_EVERY_ORG } = {}) {
    const result = normalize_gift(payload, { source, orgId, now: () => new Date().toISOString() });
    await persistEvent(payload, {
      source,
      eventName: result.eventName,
      chargeId: result.gift?.chargeId || result.chargeId,
    });

    if (result.kind === 'hold' || result.kind === 'uncomputable') {
      return insertException({
        id: `ex_${result.chargeId || result.eventName || 'hold'}_sync`,
        code: 'SYNC_FAILURE',
        message: result.reason || 'held without pot debit',
        ref: { chargeId: result.chargeId, eventName: result.eventName, source },
      });
    }

    const { contact: giftContact, ...giftFields } = result.gift;
    const gift = boundedGift(giftFields);
    if (gift.currency !== 'USD') {
      return insertCurrencyException(gift);
    }

    const found = await rest(
      `am_gifts?select=charge_id&charge_id=eq.${encodeURIComponent(gift.chargeId)}&limit=1`,
    );
    if (!found.ok) throw new Error('allocation_store_unavailable');
    const rows = await readJson(found);
    if (Array.isArray(rows) && rows[0]?.charge_id) {
      return { created: false };
    }

    const insert = await rest('am_gifts', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        charge_id: gift.chargeId,
        client_id: orgId,
        campaign_key: gift.campaignKey,
        program_key: gift.programKey,
        net_cents: Number(gift.netCents),
        gross_cents: Number(gift.grossCents),
        currency: gift.currency,
        donated_at: gift.donatedAt,
        source: gift.source,
      }),
    });
    if (insert.status === 409) return { created: false };
    if (!insert.ok) throw new Error('allocation_store_unavailable');
    const pot = await creditPot(gift);
    if (pot.newPot && gift.campaignKey !== 'general') {
      await insertException({
        id: `ex_${gift.chargeId}_unmapped`,
        code: 'UNMAPPED_FUNDRAISER',
        message: `New — review campaign ${gift.campaignKey}`,
        ref: { chargeId: gift.chargeId, campaignKey: gift.campaignKey },
      });
    }
    const contact = giftContact !== undefined ? giftContact : extractOptInContact(payload, { source });
    if (contact) {
      const contactInsert = await rest('am_gift_contacts?on_conflict=charge_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify({
          charge_id: gift.chargeId,
          client_id: orgId,
          email: contact.email || null,
          donor_principal: contact.donorPrincipal || null,
        }),
      });
      if (!contactInsert.ok && contactInsert.status !== 409) {
        throw new Error('allocation_store_unavailable');
      }
    }
    return { created: true };
  }

  return {
    ingestGift,
    ingestEveryOrg(payload) {
      return ingestGift(payload, { source: CONNECTOR_EVERY_ORG });
    },
  };
}
