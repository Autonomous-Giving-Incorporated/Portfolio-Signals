#!/usr/bin/env node
/**
 * Load AutoGive Synthetic Dataset v1 into a disposable local database.
 * Refuses platform/legacy Supabase refs. Idempotent upserts.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  CAMPAIGN_ID,
  CONSENT_MAP,
  FUND_PROGRAM,
  ROLE_MAP,
  TENANT_ID,
  TENANT_SLUG,
  assertLocalSafeDatabaseUrl,
  loadCorpus,
  validateCorpus,
} from './lib.mjs';

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildSql(corpus) {
  const lines = [];
  lines.push('-- SYNTHETIC_ONLY AutoGive v1 seed. Not OBSERVED. Local/disposable only.');
  lines.push('begin;');
  lines.push(`insert into public.clients (id, slug, display_name, state, reference_tenant)
values (${sqlLiteral(TENANT_ID)}, ${sqlLiteral(TENANT_SLUG)}, 'Civic Forge Foundation — Synthetic', 'active', false)
on conflict (id) do update
  set slug = excluded.slug,
      display_name = excluded.display_name,
      state = 'active',
      reference_tenant = false,
      updated_at = now();`);

  for (const role of corpus.roles) {
    const mapped = ROLE_MAP[role.role];
    lines.push(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values (${sqlLiteral(mapped.uuid)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${sqlLiteral(role.email)}, '', now(), now(), now())
on conflict (id) do nothing;`);
    const mfa = mapped.appRole === 'board_viewer' ? false : true;
    lines.push(`insert into public.profiles (id, display_name, role, active, mfa_enforced)
values (${sqlLiteral(mapped.uuid)}, ${sqlLiteral(`Synthetic ${role.role}`)}, ${sqlLiteral(mapped.appRole)}::public.app_role, true, ${sqlLiteral(mfa)})
on conflict (id) do update
  set role = excluded.role, active = true, mfa_enforced = excluded.mfa_enforced, deactivated_at = null, deactivation_reason = null;`);
    lines.push(`insert into public.client_memberships (client_id, user_id, role, active)
values (${sqlLiteral(TENANT_ID)}, ${sqlLiteral(mapped.uuid)}, ${sqlLiteral(mapped.appRole)}::public.app_role, true)
on conflict (client_id, user_id) do update
  set role = excluded.role, active = true, membership_version = public.client_memberships.membership_version + 1;`);
  }

  const createdBy = ROLE_MAP.director.uuid;
  for (const donor of corpus.donors) {
    const consent = CONSENT_MAP[donor.consent_state] || 'unknown';
    const receipt = {
      classification: 'SYNTHETIC_ONLY',
      dataset: 'autogive-synthetic-dataset',
      version: '1.0.0',
      donor_id: donor.donor_id,
      channel: donor.channel,
      provenance: 'SYNTHETIC',
    };
    lines.push(`insert into public.constituents (
      client_id, external_source, external_id, display_name, relationship_class,
      consent_status, source_receipt, created_by
    ) values (
      ${sqlLiteral(TENANT_ID)}, 'autogive_synthetic_v1', ${sqlLiteral(donor.donor_id)},
      ${sqlLiteral(donor.display_name)}, 'public_adjacency',
      ${sqlLiteral(consent)}::public.consent_status,
      ${sqlLiteral(JSON.stringify(receipt))}::jsonb,
      ${sqlLiteral(createdBy)}
    )
    on conflict (client_id, external_source, external_id) do update
      set display_name = excluded.display_name,
          consent_status = excluded.consent_status,
          source_receipt = excluded.source_receipt,
          updated_at = now();`);
  }

  const potCredit = new Map();
  let giftsUpserted = 0;
  let giftsSkippedCredit = 0;
  for (const gift of corpus.gifts) {
    const programKey = gift.restricted_fund_id
      ? FUND_PROGRAM[gift.restricted_fund_id] || 'undesignated'
      : 'undesignated';
    const cents = Math.round(Number(gift.amount) * 100);
    const chargeId = `fixture-${gift.gift_id}`;
    lines.push(`insert into public.am_gifts (
      charge_id, client_id, campaign_key, program_key, net_cents, gross_cents,
      currency, donated_at, source
    ) values (
      ${sqlLiteral(chargeId)}, ${sqlLiteral(TENANT_ID)}, ${sqlLiteral(CAMPAIGN_ID)},
      ${sqlLiteral(programKey)}, ${cents}, ${cents}, ${sqlLiteral(gift.currency)},
      ${sqlLiteral(gift.received_at)}, 'fixture'
    )
    on conflict (charge_id) do nothing;`);
    giftsUpserted += 1;
    if (gift.status === 'cleared') {
      const key = `${CAMPAIGN_ID}|${programKey}`;
      potCredit.set(key, (potCredit.get(key) || 0) + cents);
    } else {
      giftsSkippedCredit += 1;
    }
  }

  for (const [key, credited] of potCredit.entries()) {
    const [campaignKey, programKey] = key.split('|');
    lines.push(`insert into public.am_pots (
      client_id, campaign_key, program_key, credited_cents, allocated_cents, updated_at
    ) values (
      ${sqlLiteral(TENANT_ID)}, ${sqlLiteral(campaignKey)}, ${sqlLiteral(programKey)},
      ${credited}, 0, now()
    )
    on conflict (client_id, campaign_key, program_key) do update
      set credited_cents = excluded.credited_cents, updated_at = now();`);
  }

  const potAllocated = new Map();
  let allocationsApproved = 0;
  let allocationsSkippedAgent = 0;
  let allocationsWithoutPotDebit = 0;
  for (const alloc of corpus.allocations) {
    const programKey = FUND_PROGRAM[alloc.fund_id];
    const publicId = corpus.funds.find((f) => f.fund_id === alloc.fund_id)?.public_allocation_id;
    if (alloc.decision_source === 'agent_proposal' || alloc.status === 'proposed') {
      allocationsSkippedAgent += 1;
      continue;
    }
    const cents = Math.round(Number(alloc.amount) * 100);
    lines.push(`insert into public.am_allocations (
      id, client_id, campaign_key, program_key, amount_cents, purpose, status,
      approved_at, approved_by
    ) values (
      ${sqlLiteral(publicId)}, ${sqlLiteral(TENANT_ID)}, ${sqlLiteral(CAMPAIGN_ID)},
      ${sqlLiteral(programKey)}, ${cents},
      ${sqlLiteral(`Synthetic ${alloc.fund_id} allocation`)}, 'approved',
      '2026-08-15T19:15:00Z', 'director@example.test'
    )
    on conflict (id) do update
      set amount_cents = excluded.amount_cents,
          purpose = excluded.purpose,
          status = excluded.status;`);
    const credited = potCredit.get(`${CAMPAIGN_ID}|${programKey}`) || 0;
    if (credited >= cents) {
      potAllocated.set(`${CAMPAIGN_ID}|${programKey}`, cents);
      allocationsApproved += 1;
    } else {
      allocationsWithoutPotDebit += 1;
    }
  }
  for (const [key, allocated] of potAllocated.entries()) {
    const [campaignKey, programKey] = key.split('|');
    lines.push(`update public.am_pots
      set allocated_cents = ${allocated}, updated_at = now()
      where client_id = ${sqlLiteral(TENANT_ID)}
        and campaign_key = ${sqlLiteral(campaignKey)}
        and program_key = ${sqlLiteral(programKey)};`);
  }

  const hardwareProof = corpus.evidence.find((row) => row.evidence_id === 'ev_syn_001');
  if (hardwareProof) {
    lines.push(`insert into public.am_proofs (
      id, allocation_id, client_id, uri, note, attached_by, attached_at
    ) values (
      'proof_alloc_community_hardware', 'alloc_community_hardware', ${sqlLiteral(TENANT_ID)},
      ${sqlLiteral(hardwareProof.reference)},
      'Synthetic verified invoice (suite allocationId: alloc_community_hardware)',
      'fixture', '2026-08-15T19:20:00Z'
    )
    on conflict (id) do nothing;`);
  }

  const unverified = corpus.outcomes.find((row) => row.claim_label === 'NOT_COMPUTABLE');
  if (unverified) {
    lines.push(`insert into public.claims (client_id, claim, state, evidence)
select
  ${sqlLiteral(TENANT_ID)},
  ${sqlLiteral(`Synthetic outcome ${unverified.outcome_id} is NOT_COMPUTABLE`)},
  'unverified',
  ${sqlLiteral(JSON.stringify({ outcome_id: unverified.outcome_id, provenance: 'SYNTHETIC' }))}::jsonb
where not exists (
  select 1 from public.claims
  where client_id = ${sqlLiteral(TENANT_ID)}
    and claim like ${sqlLiteral(`%${unverified.outcome_id}%`)}
);`);
  }

  lines.push(`insert into public.am_org_meta (client_id, labels, aliases)
values (
  ${sqlLiteral(TENANT_ID)},
  '{"campaign:cmp_synthetic_builder_fund_2026":"Builder Fund 2026 — Synthetic"}'::jsonb,
  '{}'::jsonb
)
on conflict (client_id) do update set labels = excluded.labels, updated_at = now();`);

  lines.push('commit;');
  return {
    sql: `${lines.join('\n')}\n`,
    report: {
      gifts_attempted: giftsUpserted,
      gifts_excluded_from_pots: giftsSkippedCredit,
      pots: potCredit.size,
      allocations_approved: allocationsApproved,
      allocations_held_agent_proposal: allocationsSkippedAgent,
      allocations_recorded_without_pot_debit: allocationsWithoutPotDebit,
    },
  };
}

const corpus = loadCorpus();
const validated = validateCorpus(corpus);
if (!validated.ok) {
  console.error(JSON.stringify({ ok: false, errors: validated.errors }, null, 2));
  process.exit(1);
}

const dbUrl = process.env.DB_URL || '';
if (!dbUrl) {
  console.error('DB_URL is required. Example: eval "$(supabase status -o env)" && npm run seed:synthetic');
  process.exit(1);
}
assertLocalSafeDatabaseUrl(dbUrl);
if (process.env.SYNTHETIC_SEED_CONFIRM !== '1') {
  console.error('Refusing to seed without SYNTHETIC_SEED_CONFIRM=1 (local/disposable only).');
  process.exit(1);
}

const built = buildSql(corpus);
const dir = mkdtempSync(path.join(tmpdir(), 'autogive-v1-'));
const sqlPath = path.join(dir, 'seed.sql');
writeFileSync(sqlPath, built.sql);

const psql = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath], {
  encoding: 'utf8',
});
if (psql.status !== 0) {
  process.stderr.write(psql.stdout || '');
  process.stderr.write(psql.stderr || '');
  process.exit(psql.status || 1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      classification: 'SYNTHETIC_ONLY',
      tenant_id: TENANT_ID,
      ...built.report,
      counts: validated.counts,
      note: 'Cleared gifts credit pots; pending/refunded remain in the JSON corpus and am_gifts but do not increase credited_cents.',
    },
    null,
    2,
  ),
);
