# Commercial Client Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an operator-complete commercial client lifecycle path (provision → publish config → activate) via runbook, verify helper, discovery links, and dry-run evidence on platform Supabase.

**Architecture:** Docs + read-only SQL verify helper only (Approach 1). Reuse existing workspace UI and RPCs (`provision_client`, `save_client_config_draft`, `publish_client_config`, `activate_client`). No migrations, no Edge Functions, no service-role on Vercel unless a true blocker forces a minimal gap-fix under the design constraints.

**Tech Stack:** Markdown runbooks, PostgreSQL operator SQL (Dashboard), Fund-Intel `scripts/platform/`, existing Portfolio Signals workspace.

**Spec:** [docs/superpowers/specs/2026-08-06-commercial-client-lifecycle-design.md](../specs/2026-08-06-commercial-client-lifecycle-design.md)

## Global Constraints

- Platform Supabase only: `utdioxwiskzatwoejgiu` — never legacy `ecxkhihlbrcwpavfoaoq` for new tenancy.
- Depends on slice C people path: master_admin + director with `mfa_enforced`.
- Client ids: `org_[a-z0-9_]+`; synthetic dry-run client preferred (e.g. `org_lifecycle_dry_run`).
- Do not activate/re-provision production Hacker Dojo if already `active`.
- No secrets, real Auth UUIDs, or service-role keys in git.
- Activate is one-shot `provisioning` → `active`.
- Platform admin ≠ tenant-private data access.
- Production CRM import remains BLOCKED.
- Slice D and Approach 2 readiness UI are out of scope unless dry-run is blocked and design allows a minimal gap-fix only.
- Production import / real nonprofit go-live out of scope.

## File structure

| Path | Responsibility |
| --- | --- |
| `docs/COMMERCIAL-CLIENT-LIFECYCLE.md` | Canonical happy path + failure modes |
| `scripts/platform/verify-client-lifecycle.sql` | Read-only readiness for one client_id |
| `scripts/platform/README.md` | Index + order after people path |
| `docs/START_HERE.md` | Discovery link |
| `docs/CLIENT-CONFIGURATION.md` | Pointer to lifecycle for activate |
| `docs/OPERATOR-ACCESS-ONBOARDING.md` | Next-step link to commercial lifecycle |
| `docs/PLATFORM.md` | One-line pointer |
| `docs/CURRENT-STATE.md` | Slice B status OBSERVED\|PENDING |

---

### Task 1: Canonical runbook COMMERCIAL-CLIENT-LIFECYCLE.md

**Files:**
- Create: `docs/COMMERCIAL-CLIENT-LIFECYCLE.md`

- [ ] **Step 1: Write the runbook**

Create `docs/COMMERCIAL-CLIENT-LIFECYCLE.md` with this content:

```markdown
# Commercial client lifecycle

Operator path for **provision → publish configuration → activate** on Portfolio Signals (platform Supabase).

**Platform:** `utdioxwiskzatwoejgiu`  
**Workspace:** https://autogive.app/portfolio-signals/workspace  
**People path (prereq):** [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md)  
**Design:** [docs/superpowers/specs/2026-08-06-commercial-client-lifecycle-design.md](superpowers/specs/2026-08-06-commercial-client-lifecycle-design.md)

## Authority gates

```yaml
production_import: BLOCKED
service_role_on_vercel: PROHIBITED
secrets_in_git: PROHIBITED
legacy_staging_for_new_people: PROHIBITED
```

- Only **master_admin** (MFA) provisions and activates.
- Only client **director** (MFA) saves/publishes Brand & content for that client.
- Platform admin does **not** grant tenant-private campaign access.
- Activation is **one-shot**: `provisioning` → `active` only.

## Prerequisites (slice C)

1. Platform migrations applied; workspace magic-link works.
2. `master_admin` with `mfa_enforced = true`.
3. Director Auth user: profile + `mfa_enforced = true` (ensure-profile → MFA enroll → set-mfa-enforced).
4. Copy director **User UUID** from Dashboard (never commit it).

## Happy path

### 1. Provision (master_admin)

1. Sign in to workspace → **Platform admin**.
2. Fill provision form:
   - Client ID: `org_[a-z0-9_]+` (synthetic e.g. `org_lifecycle_dry_run`)
   - URL slug: kebab-case (e.g. `lifecycle-dry-run`)
   - Display name: public-safe label
   - Initial director UUID: director Auth id
   - Rationale: ≥ 12 characters
3. Submit **Provision client**.
4. Expect: client row `state = provisioning`; director membership created.

### 2. Publish configuration (director)

1. Sign in as director (or switch session); select the new client.
2. Open **Brand & content**.
3. Set organization/product/campaign public copy and theme.
4. Enable **at least one** of: Sponsor pipeline, Grant pipeline.
5. Rationale ≥ 12 → **Save draft** → **Publish selected draft**.
6. Expect: one published config version for the client.

### 3. Activate (master_admin)

1. Platform admin as master_admin.
2. Enter activation rationale ≥ 12.
3. Click **Activate** on the provisioning client.
4. Expect: `state = active`; onboarding column no longer shows Activate.

### 4. Verify

```bash
# optional: paste into Dashboard SQL after editing client id
# scripts/platform/verify-client-lifecycle.sql
```

Checklist:

- [ ] `clients.state = active`
- [ ] Active director membership exists
- [ ] Published `client_config_versions` row exists
- [ ] At least one of modules.sponsors / modules.grants true
- [ ] Audit action `client_onboarding_completed` present
- [ ] Platform admin shows onboarding complete for that client

## Failure modes (activate / provision)

| Symptom / exception | Fix |
| --- | --- |
| `master_admin_required` | Complete slice C Flow A; sign in as master_admin |
| MFA / privileged MFA errors | Enroll MFA; `set-mfa-enforced.sql` true |
| `activation_rationale_required` / short rationale | Rationale ≥ 12 characters |
| `client_not_found` | Check client id; provision first |
| `provisioning_client_required` | Client already active or wrong state; do not re-activate |
| `active_client_director_required` | Attach active director (slice C Flow B / provision director UUID) |
| `published_client_configuration_required` | Director publish Brand & content |
| `fundraising_module_required` | Enable sponsors and/or grants in published config |
| validate_client_config errors | Fix theme/copy/assets per CLIENT-CONFIGURATION.md |
| `provision_client` / slug / id pattern errors | Match form patterns; unique id/slug |

## Synthetic clients

Prefer disposable ids such as `org_lifecycle_dry_run`. Do **not** use this runbook to re-activate `org_hacker_dojo` if already active.

## Related

- [CLIENT-CONFIGURATION.md](CLIENT-CONFIGURATION.md) — config fields and director workflow
- [OPERATOR-ACCESS-ONBOARDING.md](OPERATOR-ACCESS-ONBOARDING.md) — people path
- [AUTHENTICATED-WORKSPACE.md](AUTHENTICATED-WORKSPACE.md) — roles
- [CURRENT-STATE.md](CURRENT-STATE.md) — live evidence
- [scripts/platform/README.md](../scripts/platform/README.md)
```

- [ ] **Step 2: Commit**

```bash
git add docs/COMMERCIAL-CLIENT-LIFECYCLE.md
git commit -m "docs: add commercial client lifecycle runbook (slice B)"
```

---

### Task 2: verify-client-lifecycle.sql + platform README

**Files:**
- Create: `scripts/platform/verify-client-lifecycle.sql`
- Modify: `scripts/platform/README.md`
- Modify: `scripts/platform/check-script-safety.sh` only if needed for secret scan on new file (prefer add read-only secret scan if missing)

- [ ] **Step 1: Create verify-client-lifecycle.sql**

```sql
-- scripts/platform/verify-client-lifecycle.sql
-- Read-only readiness check for commercial client lifecycle (slice B).
-- Replace target_client_id before running (Dashboard SQL / postgres).
-- No secrets belong in this file. No mutations.

do $$
declare
  -- >>> REPLACE with org_* client id e.g. org_lifecycle_dry_run <<<
  target_client_id text := '';
  v_client public.clients%rowtype;
  v_director_count integer;
  v_published jsonb;
  v_sponsors boolean;
  v_grants boolean;
  v_audit_count integer;
begin
  if target_client_id is null or length(trim(target_client_id)) = 0 then
    raise exception 'replace target_client_id with org_* id before verify-client-lifecycle';
  end if;

  if target_client_id !~ '^org_[a-z0-9_]+$' then
    raise exception 'target_client_id must match org_[a-z0-9_]+';
  end if;

  select * into v_client from public.clients where id = target_client_id;
  if not found then
    raise exception 'client % not found', target_client_id;
  end if;

  raise notice 'client: id=%, slug=%, state=%, display_name=%',
    v_client.id, v_client.slug, v_client.state, v_client.display_name;

  select count(*) into v_director_count
  from public.client_memberships
  where client_id = target_client_id and role = 'director' and active = true;

  raise notice 'active_directors: %', v_director_count;

  select config into v_published
  from public.client_config_versions
  where client_id = target_client_id and state = 'published'
  limit 1;

  if v_published is null then
    raise notice 'published_config: MISSING';
  else
    v_sponsors := coalesce((v_published#>>'{modules,sponsors}')::boolean, false);
    v_grants := coalesce((v_published#>>'{modules,grants}')::boolean, false);
    raise notice 'published_config: present modules.sponsors=% modules.grants=%',
      v_sponsors, v_grants;
  end if;

  select count(*) into v_audit_count
  from public.client_audit_log
  where client_id = target_client_id and action = 'client_onboarding_completed';

  raise notice 'client_onboarding_completed_audit_rows: %', v_audit_count;

  if v_client.state = 'active'
     and v_director_count > 0
     and v_published is not null
     and (coalesce((v_published#>>'{modules,sponsors}')::boolean, false)
          or coalesce((v_published#>>'{modules,grants}')::boolean, false)) then
    raise notice 'lifecycle_ready: YES (active with director, published config, module)';
  elsif v_client.state = 'provisioning' then
    raise notice 'lifecycle_ready: NO (still provisioning — complete publish + activate)';
  else
    raise notice 'lifecycle_ready: PARTIAL (inspect notices above)';
  end if;

  raise notice 'verify-client-lifecycle complete for %', target_client_id;
end
$$;
```

- [ ] **Step 2: Update scripts/platform/README.md**

Add to script index table:

| `verify-client-lifecycle.sql` | Read-only commercial lifecycle readiness (state, director, published config, modules) |

Add section after Flow B:

```markdown
### Commercial client lifecycle (after people path)

See [docs/COMMERCIAL-CLIENT-LIFECYCLE.md](../../docs/COMMERCIAL-CLIENT-LIFECYCLE.md).

1. master_admin provisions client (workspace Platform admin).
2. Director publishes Brand & content (≥1 fundraising module).
3. master_admin activates client.
4. `verify-client-lifecycle.sql` with `target_client_id` set.
```

Ensure secret / what-not-to-do sections remain.

- [ ] **Step 3: Ensure check-script-safety scans new file for secrets**

If `check-script-safety.sh` only scans mutators, confirm `verify-operator-access` style optional secret scan covers `verify-client-lifecycle.sql` (add path if missing):

```bash
# In check-script-safety.sh, after verify-operator-access block, also scan:
# verify-client-lifecycle.sql for service_role|eyJhbGci|sb_secret_
```

- [ ] **Step 4: Run safety check**

```bash
./scripts/platform/check-script-safety.sh
```

Expected: OK

- [ ] **Step 5: Commit**

```bash
git add scripts/platform/verify-client-lifecycle.sql scripts/platform/README.md scripts/platform/check-script-safety.sh
git commit -m "feat(platform): verify-client-lifecycle helper for commercial onboarding"
```

---

### Task 3: Discovery pointers

**Files:**
- Modify: `docs/START_HERE.md`
- Modify: `docs/CLIENT-CONFIGURATION.md`
- Modify: `docs/OPERATOR-ACCESS-ONBOARDING.md`
- Modify: `docs/PLATFORM.md`

- [ ] **Step 1: START_HERE.md**

After OPERATOR-ACCESS-ONBOARDING item, add and renumber:

```markdown
5. [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md) — provision → publish → activate  
```

Renumber subsequent items accordingly (previous 5 becomes 6, etc.).

- [ ] **Step 2: CLIENT-CONFIGURATION.md**

After the activation paragraph (master administrator completes onboarding…), add:

```markdown
Full operator path (provision → publish → activate): [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md).
```

- [ ] **Step 3: OPERATOR-ACCESS-ONBOARDING.md**

At end of Related (or new section):

```markdown
## Next: commercial client shell

After people access works, provision and activate a client:
[COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md).
```

- [ ] **Step 4: PLATFORM.md**

Add data-plane or related bullet:

```markdown
8. Commercial client lifecycle: [COMMERCIAL-CLIENT-LIFECYCLE.md](COMMERCIAL-CLIENT-LIFECYCLE.md).
```

(Use next free number if 7 is already operator people path.)

- [ ] **Step 5: Commit**

```bash
git add docs/START_HERE.md docs/CLIENT-CONFIGURATION.md docs/OPERATOR-ACCESS-ONBOARDING.md docs/PLATFORM.md
git commit -m "docs: link commercial client lifecycle from operator entry points"
```

---

### Task 4: Dry-run + CURRENT-STATE

**Files:**
- Modify: `docs/CURRENT-STATE.md`

- [ ] **Step 1: Attempt dry-run**

Prefer **Option A**: full happy path for synthetic `org_lifecycle_dry_run` (or unique suffix) if operator has master_admin + director session on platform.

If cannot complete:

- **Option B:** document furthest step completed  
- **Option C:** PENDING — no session  

Never commit Auth UUIDs or service-role material. Do not re-activate `org_hacker_dojo` if already active.

- [ ] **Step 2: Update CURRENT-STATE.md**

Add:

```markdown
## Commercial client lifecycle (slice B)

```yaml
runbook: docs/COMMERCIAL-CLIENT-LIFECYCLE.md
verify_script: scripts/platform/verify-client-lifecycle.sql
dry_run: OBSERVED|PENDING  # date, option A/B/C, synthetic client id if used (no secrets)
```
```

- [ ] **Step 3: Commit**

```bash
git add docs/CURRENT-STATE.md
git commit -m "docs: record commercial client lifecycle slice B status"
```

---

### Task 5: Final verification gate

- [ ] **Step 1: Artifact checks**

```bash
cd /home/scrimshawlife/Fund-Intel
test -f docs/COMMERCIAL-CLIENT-LIFECYCLE.md
test -f scripts/platform/verify-client-lifecycle.sql
./scripts/platform/check-script-safety.sh
grep -n 'COMMERCIAL-CLIENT-LIFECYCLE' docs/START_HERE.md docs/PLATFORM.md docs/OPERATOR-ACCESS-ONBOARDING.md docs/CLIENT-CONFIGURATION.md
git diff origin/main --stat
```

Expected: files exist; safety OK; links present; diff limited to docs + `scripts/platform/` (+ design/plan under superpowers).

- [ ] **Step 2: Scope gate**

Confirm no migrations, no Edge Functions, no Approach 2 UI unless a design-allowed gap-fix was explicitly committed.

- [ ] **Step 3: Commit only if uncommitted work remains**

```bash
git status
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
| --- | --- |
| COMMERCIAL-CLIENT-LIFECYCLE.md | Task 1 |
| verify-client-lifecycle.sql | Task 2 |
| README index | Task 2 |
| START_HERE / CLIENT-CONFIGURATION / OPERATOR-ACCESS / PLATFORM | Task 3 |
| Dry-run + CURRENT-STATE | Task 4 |
| Activate exception table | Task 1 |
| No D / Approach 2 by default | Task 5 |
| Gap-fix only if blocked | Task 4–5 (conditional) |
