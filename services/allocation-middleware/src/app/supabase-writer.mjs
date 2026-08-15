/**
 * Service-role writer for allocation webhook ingest → platform Supabase am_* tables.
 * Gift insert is idempotent on charge_id. Pot credit is read-modify-write (pilot scale).
 * Does not use D1, Render, or Fly disk.
 */
import { normalizeEveryOrgDonation } from '../connectors/everyorg.mjs';

const MAX_KEY = 128;

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

export function createSupabaseAllocationWriter({
  supabaseUrl,
  serviceRoleKey,
  orgId,
  fetchImpl = fetch,
}) {
  const base = String(supabaseUrl || '').replace(/\/$/, '');
  if (!base || !serviceRoleKey || !orgId) {
    throw new Error('allocation_store_unavailable');
  }

  async function rest(path, init = {}) {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, {
      ...init,
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

  async function readJson(response) {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('allocation_store_unavailable');
    }
  }

  async function insertCurrencyException(gift) {
    const id = `ex_${gift.chargeId}_currency`;
    const response = await rest('am_exceptions?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        id,
        client_id: orgId,
        code: 'CURRENCY_MISMATCH',
        message: `currency ${gift.currency} not USD`,
        open: true,
        ref: { chargeId: gift.chargeId },
      }),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error('allocation_store_unavailable');
    }
    return { created: false, exception: { id, code: 'CURRENCY_MISMATCH' } };
  }

  async function creditPot(gift) {
    const select =
      `am_pots?select=credited_cents,allocated_cents` +
      `&client_id=eq.${encodeURIComponent(orgId)}` +
      `&campaign_key=eq.${encodeURIComponent(gift.campaignKey)}` +
      `&program_key=eq.${encodeURIComponent(gift.programKey)}` +
      `&limit=1`;
    const existingRes = await rest(select);
    if (!existingRes.ok) throw new Error('allocation_store_unavailable');
    const existing = await readJson(existingRes);
    const row = Array.isArray(existing) ? existing[0] : null;
    if (!row) {
      const insert = await rest('am_pots', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          client_id: orgId,
          campaign_key: gift.campaignKey,
          program_key: gift.programKey,
          credited_cents: Number(gift.netCents),
          allocated_cents: 0,
        }),
      });
      if (!insert.ok) throw new Error('allocation_store_unavailable');
      return;
    }
    const nextCredited = Number(row.credited_cents) + Number(gift.netCents);
    const patch = await rest(
      `am_pots?client_id=eq.${encodeURIComponent(orgId)}` +
        `&campaign_key=eq.${encodeURIComponent(gift.campaignKey)}` +
        `&program_key=eq.${encodeURIComponent(gift.programKey)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ credited_cents: nextCredited }),
      },
    );
    if (!patch.ok) throw new Error('allocation_store_unavailable');
  }

  return {
    async ingestEveryOrg(payload) {
      const gift = boundedGift(normalizeEveryOrgDonation(payload, { orgId }));
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
      await creditPot(gift);
      return { created: true };
    },
  };
}
