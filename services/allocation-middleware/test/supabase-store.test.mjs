import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSupabaseStore } from '../src/app/supabase-store.mjs';
import { emptyState } from '../src/domain/pots.mjs';
import { ensureExtras } from '../src/app/store-core.mjs';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body === undefined ? '' : JSON.stringify(body);
    },
  };
}

test('supabase store load keeps only the bound org and drops foreign labels', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('am_gifts')) {
      return jsonResponse(200, [
        {
          charge_id: 'fixture-hd-gift-001',
          client_id: 'org_hacker_dojo',
          campaign_key: 'hacker-dojo-420k',
          program_key: 'community-hardware-fund',
          net_cents: 10000,
          gross_cents: 10000,
          currency: 'USD',
          donated_at: '2026-07-15T18:00:00Z',
          source: 'fixture',
        },
      ]);
    }
    if (String(url).includes('am_org_meta')) {
      return jsonResponse(200, [{
        labels: {
          'org_hacker_dojo|campaign|hacker-dojo-420k': 'Hacker Dojo $420K Campaign',
          'org_other|campaign|x': 'Other campaign',
        },
        aliases: {},
      }]);
    }
    return jsonResponse(200, []);
  };
  const store = createSupabaseStore({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  const state = await store.load();
  assert.equal(state.gifts.get('fixture-hd-gift-001').orgId, 'org_hacker_dojo');
  assert.equal(state.labels.get('org_hacker_dojo|campaign|hacker-dojo-420k'), 'Hacker Dojo $420K Campaign');
  assert.equal(state.labels.has('org_other|campaign|x'), false);
  assert.ok(calls.every((url) => (
    url.includes('client_id=eq.org_hacker_dojo') || url.includes('id=eq.org_hacker_dojo')
  )));
});

test('supabase store save refuses to persist another org\'s rows', async () => {
  const bodies = [];
  const fetchImpl = async (url, init = {}) => {
    if (init.method === 'POST' || init.method === 'PATCH') {
      bodies.push({ url: String(url), method: init.method, rows: JSON.parse(init.body) });
      return jsonResponse(201, []);
    }
    return jsonResponse(200, []);
  };
  const store = createSupabaseStore({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'service-role',
    orgId: 'org_hacker_dojo',
    fetchImpl,
  });
  const state = ensureExtras(emptyState());
  state.gifts.set('foreign', {
    chargeId: 'foreign',
    orgId: 'org_other',
    campaignKey: 'x',
    programKey: 'y',
    netCents: 100n,
    grossCents: 100n,
    currency: 'USD',
    donatedAt: '2026-08-15T00:00:00Z',
    source: 'fixture',
  });
  state.gifts.set('hd', {
    chargeId: 'hd',
    orgId: 'org_hacker_dojo',
    campaignKey: 'hacker-dojo-420k',
    programKey: 'community-hardware-fund',
    netCents: 2500n,
    grossCents: 2500n,
    currency: 'USD',
    donatedAt: '2026-08-15T00:00:00Z',
    source: 'fixture',
  });
  await store.save(state);
  const giftUpsert = bodies.find((item) => item.url.includes('am_gifts'));
  assert.ok(giftUpsert);
  assert.deepEqual(giftUpsert.rows.map((row) => row.charge_id), ['hd']);
  assert.ok(giftUpsert.rows.every((row) => row.client_id === 'org_hacker_dojo'));
  const clientPatch = bodies.find((item) => item.url.includes('/clients?'));
  assert.ok(clientPatch);
  assert.equal(clientPatch.method, 'PATCH');
});
