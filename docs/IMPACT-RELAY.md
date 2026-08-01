# Impact Relay bridge (Hacker Dojo host)

Impact Relay is the **reusable money / workflow / donor-receipt library**.  
This repository is the **canonical host app** (campaign ops + public portal).

| Repo | Role |
|------|------|
| [Impact-Relay](https://github.com/scrimshawlife-ctrl/Impact-Relay) | Ledger, L0–L3 agents, durable workflows, donor API, RBAC ports |
| **Hacker-Dojo** (this repo) | Campaign UX, Supabase auth, import quarantine, director portal |

Public impact surface (aggregates only):  
https://scrimshawlife-ctrl.github.io/Impact-Relay/

## Local finance + donor screens

1. Start Impact Relay console API (from Impact-Relay checkout):

```bash
cd ../Impact-Relay
python -m impact_relay.console_server --data-dir .impact-relay/hacker-dojo --port 8787
```

2. Open host pages (from this repo, any static server or file open):

- `finance-impact.html` — finance review queue (approve expenses)
- `donor-impact.html` — donor timeline / receipt detail

Default API base: `http://127.0.0.1:8787`  
Override: `localStorage.IMPACT_RELAY_API = 'http://127.0.0.1:8787'`

Auth for pilot: header `Authorization: Bearer finance.approver@hackersdojo.example`  
(maps via Impact Relay fixture OIDC → `finance_approver` role).

## Role mapping (campaign ↔ Impact Relay)

| Hacker-Dojo campaign role | Impact Relay role |
|---------------------------|-------------------|
| director / development | `tenant_admin` or `finance_approver` |
| board viewer / auditor | `auditor` |
| data steward | `finance_reviewer` |

OIDC in production: host validates Supabase/Auth JWT, then maps claims to  
`impact_relay.auth.Principal` before calling console APIs.

## Privacy boundary

- This repo must not store raw donor CRM exports in git.
- Impact Relay durable data-dir is **local/staging only** (not GitHub).
- Public Pages stay aggregate-only (Privacy Sentinel).
