/**
 * Org-scoped allocation store backed by platform Supabase am_* tables.
 * Worker and Node both use this; D1 / Render / Fly disk are not used.
 */
import { emptyState } from '../domain/pots.mjs';
import { ensureExtras } from './store-core.mjs';

function asBigInt(value) {
  return BigInt(String(value ?? 0));
}

export function createSupabaseStore({
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
    if (!response.ok) throw new Error('allocation_store_unavailable');
    if (!text) return [];
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('allocation_store_unavailable');
    }
  }

  function scoped(table, select) {
    return `${table}?select=${select}&client_id=eq.${encodeURIComponent(orgId)}`;
  }

  return {
    orgId,
    async load() {
      const state = ensureExtras(emptyState());
      const [gifts, pots, allocations, proofs, exceptions, metaRows] = await Promise.all([
        rest(scoped('am_gifts', '*')).then(readJson),
        rest(scoped('am_pots', '*')).then(readJson),
        rest(scoped('am_allocations', '*')).then(readJson),
        rest(scoped('am_proofs', '*')).then(readJson),
        rest(scoped('am_exceptions', '*')).then(readJson),
        rest(scoped('am_org_meta', 'labels,aliases')).then(readJson),
      ]);
      for (const row of gifts || []) {
        state.gifts.set(row.charge_id, {
          chargeId: row.charge_id,
          orgId: row.client_id,
          campaignKey: row.campaign_key,
          programKey: row.program_key,
          netCents: asBigInt(row.net_cents),
          grossCents: asBigInt(row.gross_cents),
          currency: row.currency,
          donatedAt: row.donated_at,
          source: row.source,
        });
      }
      for (const row of pots || []) {
        state.pots.set(`${row.client_id}|${row.campaign_key}|${row.program_key}`, {
          orgId: row.client_id,
          campaignKey: row.campaign_key,
          programKey: row.program_key,
          creditedCents: asBigInt(row.credited_cents),
          allocatedCents: asBigInt(row.allocated_cents),
        });
      }
      for (const row of allocations || []) {
        state.allocations.set(row.id, {
          id: row.id,
          orgId: row.client_id,
          campaignKey: row.campaign_key,
          programKey: row.program_key,
          amountCents: asBigInt(row.amount_cents),
          purpose: row.purpose,
          status: row.status,
          approvedAt: row.approved_at,
          approvedBy: row.approved_by,
        });
      }
      for (const row of proofs || []) {
        const list = state.proofs.get(row.allocation_id) || [];
        list.push({
          id: row.id,
          allocationId: row.allocation_id,
          uri: row.uri,
          note: row.note || '',
          attachedBy: row.attached_by || '',
          attachedAt: row.attached_at,
        });
        state.proofs.set(row.allocation_id, list);
      }
      state.exceptions = (exceptions || []).map((row) => ({
        id: row.id,
        orgId: row.client_id,
        code: row.code,
        message: row.message,
        open: row.open === true,
        createdAt: row.created_at,
        ref: row.ref || {},
      }));
      const meta = Array.isArray(metaRows) ? metaRows[0] : null;
      for (const [key, label] of Object.entries(meta?.labels || {})) {
        if (String(key).startsWith(`${orgId}|`)) state.labels.set(key, label);
      }
      for (const [key, value] of Object.entries(meta?.aliases || {})) {
        if (String(key).startsWith(`${orgId}|`)) state.aliases.set(key, value);
      }
      return state;
    },
    async save(next) {
      const state = ensureExtras(next);
      const giftRows = [...state.gifts.values()]
        .filter((gift) => gift.orgId === orgId)
        .map((gift) => ({
          charge_id: gift.chargeId,
          client_id: orgId,
          campaign_key: gift.campaignKey,
          program_key: gift.programKey,
          net_cents: Number(gift.netCents),
          gross_cents: Number(gift.grossCents),
          currency: gift.currency,
          donated_at: gift.donatedAt,
          source: gift.source,
        }));
      const potRows = [...state.pots.values()]
        .filter((pot) => pot.orgId === orgId)
        .map((pot) => ({
          client_id: orgId,
          campaign_key: pot.campaignKey,
          program_key: pot.programKey,
          credited_cents: Number(pot.creditedCents),
          allocated_cents: Number(pot.allocatedCents),
        }));
      const allocationRows = [...state.allocations.values()]
        .filter((allocation) => allocation.orgId === orgId)
        .map((allocation) => ({
          id: allocation.id,
          client_id: orgId,
          campaign_key: allocation.campaignKey,
          program_key: allocation.programKey,
          amount_cents: Number(allocation.amountCents),
          purpose: allocation.purpose,
          status: allocation.status,
          approved_at: allocation.approvedAt,
          approved_by: allocation.approvedBy,
        }));
      const proofRows = [];
      for (const [allocationId, list] of state.proofs || []) {
        const allocation = state.allocations.get(allocationId);
        if (!allocation || allocation.orgId !== orgId) continue;
        for (const proof of list) {
          proofRows.push({
            id: proof.id,
            allocation_id: allocationId,
            client_id: orgId,
            uri: proof.uri,
            note: proof.note || '',
            attached_by: proof.attachedBy || '',
            attached_at: proof.attachedAt,
          });
        }
      }
      const exceptionRows = (state.exceptions || [])
        .filter((item) => item.orgId === orgId)
        .map((item) => ({
          id: item.id,
          client_id: orgId,
          code: item.code,
          message: item.message,
          open: item.open !== false,
          ref: item.ref || {},
        }));
      const labels = {};
      for (const [key, label] of state.labels || []) {
        if (String(key).startsWith(`${orgId}|`)) labels[key] = label;
      }
      const aliases = {};
      for (const [key, value] of state.aliases || []) {
        if (String(key).startsWith(`${orgId}|`)) aliases[key] = value;
      }
      const metaRows = [{ client_id: orgId, labels, aliases }];

      const upserts = [
        ['am_gifts?on_conflict=charge_id', giftRows],
        ['am_pots?on_conflict=client_id,campaign_key,program_key', potRows],
        ['am_allocations?on_conflict=id', allocationRows],
        ['am_proofs?on_conflict=id', proofRows],
        ['am_exceptions?on_conflict=id', exceptionRows],
        ['am_org_meta?on_conflict=client_id', metaRows],
      ];
      for (const [path, rows] of upserts) {
        if (!rows.length) continue;
        const response = await rest(path, {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(rows),
        });
        if (!response.ok) throw new Error('allocation_store_unavailable');
      }
    },
  };
}
