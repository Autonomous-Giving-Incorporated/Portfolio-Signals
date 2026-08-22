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
  timeoutMs = 8000,
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
      const [gifts, pots, allocations, proofs, exceptions, metaRows, contacts, notices, deliveries, waivers, clientRows, events] = await Promise.all([
        rest(scoped('am_gifts', '*')).then(readJson),
        rest(scoped('am_pots', '*')).then(readJson),
        rest(scoped('am_allocations', '*')).then(readJson),
        rest(scoped('am_proofs', '*')).then(readJson),
        rest(scoped('am_exceptions', '*')).then(readJson),
        rest(scoped('am_org_meta', 'labels,aliases,donation_link,source')).then(readJson),
        rest(scoped('am_gift_contacts', '*')).then(readJson),
        rest(scoped('am_impact_notices', '*')).then(readJson),
        rest(scoped('am_impact_notice_deliveries', '*')).then(readJson),
        rest(scoped('am_proof_waivers', '*')).then(readJson),
        rest(`clients?select=donation_link&id=eq.${encodeURIComponent(orgId)}`).then(readJson),
        rest(scoped('am_webhook_events', '*')).then(readJson),
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
      const clientRow = Array.isArray(clientRows) ? clientRows[0] : null;
      state.donationLink = meta?.donation_link || clientRow?.donation_link || null;
      state.tenantSource = meta?.source || 'every.org';
      state.webhookEvents = (events || []).map((row) => ({
        id: row.id,
        orgId: row.client_id,
        source: row.source,
        eventName: row.event_name,
        chargeId: row.charge_id,
        payload: row.payload,
        createdAt: row.created_at,
      }));
      for (const row of contacts || []) {
        const contact = { chargeId: row.charge_id };
        if (row.email) contact.email = row.email;
        if (row.donor_principal) contact.donorPrincipal = row.donor_principal;
        state.giftContacts.set(row.charge_id, contact);
      }
      for (const row of notices || []) {
        state.impactNotices.set(row.allocation_id, {
          impactNoticeId: row.id,
          orgId: row.client_id,
          allocationId: row.allocation_id,
          evidenceId: row.evidence_id,
          proofWaived: row.proof_waived === true,
          channel: row.channel,
          donationLink: row.donation_link,
          useSummary: row.use_summary,
          chargeId: row.charge_id || undefined,
          createdAt: row.created_at,
        });
      }
      state.impactDeliveries = (deliveries || []).map((row) => ({
        id: row.id,
        noticeId: row.notice_id,
        orgId: row.client_id,
        channel: row.channel,
        status: row.status,
        attemptedAt: row.attempted_at,
        detail: row.detail || '',
      }));
      for (const row of waivers || []) {
        state.proofWaivers.set(row.allocation_id, {
          allocationId: row.allocation_id,
          waivedBy: row.waived_by,
          waivedAt: row.waived_at,
          note: row.note || '',
        });
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
      const contactRows = [...(state.giftContacts || new Map()).values()]
        .filter((contact) => state.gifts.get(contact.chargeId)?.orgId === orgId)
        .map((contact) => ({
          charge_id: contact.chargeId,
          client_id: orgId,
          email: contact.email || null,
          donor_principal: contact.donorPrincipal || null,
        }));
      const noticeRows = [...(state.impactNotices || new Map()).values()]
        .filter((notice) => notice.orgId === orgId)
        .map((notice) => ({
          id: notice.impactNoticeId,
          client_id: orgId,
          allocation_id: notice.allocationId,
          evidence_id: notice.evidenceId || null,
          proof_waived: notice.proofWaived === true,
          channel: notice.channel,
          donation_link: notice.donationLink,
          use_summary: notice.useSummary,
          charge_id: notice.chargeId || null,
          created_at: notice.createdAt,
        }));
      const deliveryRows = (state.impactDeliveries || [])
        .filter((item) => item.orgId === orgId)
        .map((item) => ({
          id: item.id,
          notice_id: item.noticeId,
          client_id: orgId,
          channel: item.channel,
          status: item.status,
          attempted_at: item.attemptedAt,
          detail: item.detail || '',
        }));
      const waiverRows = [...(state.proofWaivers || new Map()).values()]
        .filter((item) => state.allocations.get(item.allocationId)?.orgId === orgId)
        .map((item) => ({
          allocation_id: item.allocationId,
          client_id: orgId,
          waived_by: item.waivedBy,
          waived_at: item.waivedAt,
          note: item.note || '',
        }));
      const eventRows = (state.webhookEvents || [])
        .filter((item) => item.orgId === orgId)
        .map((item) => ({
          id: item.id,
          client_id: orgId,
          source: item.source,
          event_name: item.eventName || '',
          charge_id: item.chargeId || null,
          payload: item.payload,
          created_at: item.createdAt,
        }));
      const metaRows = [{
        client_id: orgId,
        labels,
        aliases,
        donation_link: state.donationLink || null,
        source: state.tenantSource || 'every.org',
      }];

      const upserts = [
        ['am_gifts?on_conflict=charge_id', giftRows],
        ['am_pots?on_conflict=client_id,campaign_key,program_key', potRows],
        ['am_allocations?on_conflict=id', allocationRows],
        ['am_proofs?on_conflict=id', proofRows],
        ['am_exceptions?on_conflict=id', exceptionRows],
        ['am_org_meta?on_conflict=client_id', metaRows],
        ['am_webhook_events?on_conflict=id', eventRows],
        ['am_gift_contacts?on_conflict=charge_id', contactRows],
        ['am_proof_waivers?on_conflict=allocation_id', waiverRows],
        ['am_impact_notices?on_conflict=id', noticeRows],
        ['am_impact_notice_deliveries?on_conflict=id', deliveryRows],
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
      const clientPatch = await rest(`clients?id=eq.${encodeURIComponent(orgId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ donation_link: state.donationLink || null }),
      });
      if (!clientPatch.ok) throw new Error('allocation_store_unavailable');
    },
  };
}
