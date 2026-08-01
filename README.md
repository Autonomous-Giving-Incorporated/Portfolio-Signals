# Hacker Dojo Campaign Intelligence

A director-facing campaign control portal for Hacker Dojo's **$420K minimum campaign** and **$2M transformation path**.

## Current implementation

This first version is a privacy-safe static dashboard designed for GitHub Pages. It includes:

- executive campaign overview;
- funding ladder and use-of-funds framework;
- sponsor, grant, and member-segment views;
- decision queue and launch gates;
- governance and privacy controls;
- links to approved public resources.

## Privacy boundary

The repository must **not** contain the raw member registry, personal emails, addresses, attendance-level data, donor records, or other sensitive campaign data.

The uploaded source material contains extensive personal information. The static site therefore shows only aggregated counts and publicly safe planning data. Editable CRM functions require a separately authenticated backend with:

- role-based access control;
- audit logs;
- encrypted storage;
- explicit consent and suppression fields;
- retention rules;
- relationship ownership;
- human approval gates.

## Local preview

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## GitHub Pages

After merging the dashboard branch:

1. Open **Settings → Pages**.
2. Set the source to **Deploy from a branch**.
3. Select `main` and `/ (root)`.
4. Save.

Because this is currently a private repository, verify that the account and repository plan support the desired Pages visibility before treating it as an access-control mechanism. GitHub Pages alone is not the secure backend for private CRM data.

## Campaign state

```yaml
minimum_target: 420000
stretch_target: 2000000
public_evidence: complete
campaign_architecture: complete
field_materials: draft_complete
outreach_authority: not_granted
sensitive_data_in_repo: prohibited
next_backend_phase: authenticated_campaign_control_service
```
