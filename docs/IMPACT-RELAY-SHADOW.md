# Impact Relay shadow mode (Hacker Dojo)

Shadow mode runs Impact Relay money workflows against **copy / fixture data** with **no live donor notifications**.

## Goals

- Exercise finance approval queue + donor receipt screens
- Keep CRM / outreach authority **off**
- Produce evidence for pilot sign-off without production money movement

## Preconditions

| Item | Value |
|------|--------|
| Impact Relay | main with `console_server` |
| Data dir | local only (not git): `.impact-relay/hacker-dojo-shadow` |
| Auth | Supabase staging profile **or** fixture mode |
| Notifications | never enable live Postmark/APNs |

## Automated library rehearsal (optional first step)

Synthetic principals only — proves host seed / role denial / approve / rehydrate without the browser:

```bash
cd ../Impact-Relay
python -m impact_relay --shadow-rehearsal \
  --data-dir .impact-relay/shadow-rehearsal \
  --write-findings docs/pilot/FINDINGS.md
```

Still complete the human UI steps below before claiming shadow exit.

## Procedure

### 1. Start console (shadow data-dir)

```bash
cd ../Impact-Relay
# Default-deny; no --trusted-proxy for host-bridge / fixture Bearer.
python -m impact_relay.console_server \
  --data-dir .impact-relay/hacker-dojo-shadow \
  --port 8787
```

### 2. Seed and approve (no production)

Open `finance-impact.html` (or curl with **fixture Bearer**, not forgeable identity headers):

```bash
curl -X POST http://127.0.0.1:8787/api/pilot/seed \
  -H 'Authorization: Bearer finance.approver@hackersdojo.example'
curl http://127.0.0.1:8787/api/finance/queue \
  -H 'Authorization: Bearer finance.approver@hackersdojo.example'
```

`X-Impact-*` / `X-HD-Campaign-Role` are ignored unless the server is started with
`--trusted-proxy` (gateway-only; gateway must strip client copies). Prefer Bearer
fixture email or a real Supabase JWT.

With Supabase: load `runtime-config.js`, sign in as director/campaign_lead, use UI **Seed** → **Approve**.

### 3. Donor screen (staff)

```bash
# After run_pilot data exists in the same data-dir (entity snapshot / UOF):
# Use donor-impact.html with donor_alice
```

Or Python:

```python
from impact_relay.pilot import run_pilot
from impact_relay.domain.tenant import TenantWorkspace
from impact_relay.donor import open_donor_api
from impact_relay.storage import open_storage
from impact_relay.storage.template import ensure_canonical_hacker_dojo_tenant

store = open_storage(".impact-relay/hacker-dojo-shadow")
ensure_canonical_hacker_dojo_tenant(store)
led, recs = run_pilot()
store.ledger.save_ledger(led)
api = open_donor_api(TenantWorkspace(led.organization, ledger=led))
print(api.dashboard(recs[0].donor_id)["timeline"][:3])
```

### 4. Notification shadow rule

Always call notification evaluate with `deliver=False` in shadow scripts:

```python
ns.evaluate_for_use_of_funds(receipt_id, deliver=False)
```

Do **not** configure real email/push adapters in shadow.

### 5. Exit criteria (sign-off evidence)

- [ ] Finance queue shows waiting case after seed
- [ ] Approve as campaign_lead/director succeeds; agent email rejected
- [ ] Data steward can list queue but cannot approve (403)
- [ ] Donor dashboard loads for fixture donor without CRM export in git
- [ ] `durable check` / rehydrate ids stable
- [ ] No public Pages publish from shadow data-dir

### 6. Record findings

Append date + outcomes to pilot sign-off section in Impact-Relay  
`docs/pilot/HACKER-DOJO-PILOT.md`.
