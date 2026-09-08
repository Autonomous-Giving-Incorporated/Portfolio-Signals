# Platform Activate + Tenant Data Harden Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate Client Onboarding Pack on platform Supabase, deploy its Edge functions, and harden residual Hacker Dojo data exposure so canonical tenant content is only available to authenticated members of `org_hacker_dojo` (or master_admin).

**Architecture:** Apply existing mainline migrations (`202608080001`, `202608080002`) to project `utdioxwiskzatwoejgiu`; deploy `upload-onboarding-document` and `onboarding-document-url`. Keep HTML gate from #111; move remaining static HD pipeline payloads behind the same auth gate or empty stubs. Document operator MFA follow-ups for Qi and Ed.

**Tech Stack:** Supabase CLI / Management API, Deno Edge Functions, Portfolio Signals static workspace modules, Node for smoke scripts.

## Global Constraints

- Platform project only: `utdioxwiskzatwoejgiu` (never legacy `ecxkhihlbrcwpavfoaoq` for new work).
- `production_import: BLOCKED`; `outreach: NOT_GRANTED`.
- No service_role in browser or Vercel public env.
- No secrets, real Auth UUIDs, or action_links in git.
- MFA order: user enrolls TOTP before `mfa_enforced=true`.
- Pack `ready` ≠ import authorized ≠ client activated.
- Hacker Dojo canonical data: membership on `org_hacker_dojo` or master_admin only.

---

### Task 1: Apply onboarding pack migrations to platform

**Files:**
- Use: `supabase/migrations/202608080001_client_onboarding_pack.sql`
- Use: `supabase/migrations/202608080002_onboarding_pack_mime_types.sql`
- Use: `scripts/staging/apply-migrations.sh` if available

**Interfaces:**
- Produces: tables `client_onboarding_packs`, `client_onboarding_documents` queryable via PostgREST on platform

- [ ] **Step 1: Confirm credentials**

```bash
# Prefer linked project
supabase projects list
# Or DATABASE_URL / service role with SQL apply path
```

- [ ] **Step 2: Apply migrations**

```bash
cd /home/scrimshawlife/Fund-Intel
supabase link --project-ref utdioxwiskzatwoejgiu
PLATFORM_CONFIRM_PROJECT_REF=utdioxwiskzatwoejgiu \
  ./scripts/staging/apply-migrations.sh remote-linked
# OR: supabase db push --linked
```

Expected: migrations apply without error; `client_onboarding_packs` exists.

- [ ] **Step 3: Verify**

```bash
# REST head
# GET /rest/v1/client_onboarding_packs?select=client_id&limit=1 → 200 (empty ok)
```

- [ ] **Step 4: Record in CURRENT-STATE** (status still PENDING until Edge + dry-run)

- [ ] **Step 5: Commit docs only if state file changes**

---

### Task 2: Deploy Edge functions

**Files:**
- `supabase/functions/upload-onboarding-document/index.ts`
- `supabase/functions/onboarding-document-url/index.ts`

- [ ] **Step 1: Deploy**

```bash
supabase functions deploy upload-onboarding-document --project-ref utdioxwiskzatwoejgiu
supabase functions deploy onboarding-document-url --project-ref utdioxwiskzatwoejgiu
```

- [ ] **Step 2: Smoke OPTIONS/POST unauthorized**

```bash
# OPTIONS → 200/204 with CORS
# POST without JWT → 401
```

- [ ] **Step 3: Update CURRENT-STATE edge_functions list**

---

### Task 3: Residual static HD payload harden (if still in HTML after #111)

**Files:**
- `sponsors.html`, `grants.html`, `members.html` — ensure tbody empty when unauthenticated; optionally load rows only after `requireTenantAccess`
- `index.html` tenant-data-root already gated

- [ ] **Step 1: Verify anonymous cannot see sponsor rows in raw HTML**

If rows remain in HTML source, replace with empty tbody + JS fill after auth (fixture data only for authorized session).

- [ ] **Step 2: Commit**

```bash
git commit -m "fix: do not ship HD pipeline rows in anonymous HTML"
```

---

### Task 4: Operator people follow-ups (docs + optional email)

**People:**
- Restricted operator registry — primary master_admin
- Restricted operator registry — second master_admin
- Restricted operator registry — reference-tenant director

- [ ] **Step 1: Resend magic links when rate limit allows** (do not commit links)

- [ ] **Step 2: Document onboarding checklist in CURRENT-STATE**

- [ ] **Step 3: After MFA enroll (human): run set-mfa-enforced for Qi and Ed**

---

### Task 5: Evidence + PR

- [ ] CURRENT-STATE: onboarding pack platform tables OBSERVED if Task 1–2 pass; Edge OBSERVED; dry-run PENDING until MFA user completes pack
- [ ] Push branch, open PR, merge when CI green

## Success criteria

1. `client_onboarding_packs` REST 200 on platform  
2. Both onboarding Edge functions deployed (not 404)  
3. Anonymous HTML does not embed HD sponsor/member pipelines (or remains behind gate + empty)  
4. Docs reflect people + pack platform status  
5. No secrets in git  
