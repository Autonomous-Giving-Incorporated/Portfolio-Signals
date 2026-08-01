# Hacker Dojo Campaign Intelligence

A director-facing campaign control portal for Hacker Dojo's **$420K minimum campaign** and **$2M transformation path**.

## Current implementation

The repository contains a privacy-safe static dashboard designed for GitHub Pages. It includes:

- executive campaign overview;
- funding ladder and use-of-funds framework;
- sponsor, grant, and member-segment views;
- decision queue and launch gates;
- governance and privacy controls;
- links to approved public resources;
- canonical aggregate campaign data with JSON Schema validation;
- automated validation and GitHub Pages deployment;
- an authenticated-workspace database foundation with roles, row-level security, consent controls, decisions, claims, opportunities, and audit logging.

## Repository map

```text
index.html                            Director portal
styles.css                           Visual system
app.js                               Client-side interactions
data/public-campaign.json            Canonical public aggregate state
schemas/public-campaign.schema.json  Public-data contract
supabase/migrations/001_campaign_control.sql
supabase/seed.sql                    Safe decision-gate seeds only
docs/AUTHENTICATED-WORKSPACE.md      Private application boundary
.env.example                         Deployment variable contract
ROADMAP.md                           Production and backend plan
SECURITY.md                          Data-handling boundary
.github/workflows/validate-and-deploy.yml
```

## Privacy boundary

The repository must **not** contain the raw member registry, personal emails, addresses, attendance-level data, donor records, private notes, or other sensitive campaign data.

The source development list contains extensive personal information. This site therefore shows only aggregated counts and publicly safe planning data. Editable CRM functions require a separately authenticated backend with:

- multifactor authentication;
- role-based access control;
- row-level security;
- audit logs;
- encrypted sensitive fields;
- explicit consent and suppression fields;
- retention rules;
- relationship ownership;
- human approval gates.

See [SECURITY.md](SECURITY.md), [ROADMAP.md](ROADMAP.md), and [docs/AUTHENTICATED-WORKSPACE.md](docs/AUTHENTICATED-WORKSPACE.md).

## Local preview

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Validate the public data contract

```bash
npx --yes ajv-cli@5 validate \
  --spec=draft2020 \
  -s schemas/public-campaign.schema.json \
  -d data/public-campaign.json
```

## GitHub Pages

The workflow in `.github/workflows/validate-and-deploy.yml` validates the data contract, checks for obvious restricted exports, and deploys `main` through GitHub Pages.

Repository configuration still needs:

1. Open **Settings → Pages**.
2. Select **GitHub Actions** as the source.
3. Confirm the Pages environment is permitted for this private repository and account plan.

GitHub Pages must not be treated as the access-control layer for private CRM data.

## Authenticated environment

The SQL migration is designed for a separate Supabase project. Applying it does not place private data in GitHub; it creates the controlled schema and policies that the future application will use.

Required before production use:

- separate staging and production projects;
- MFA enforcement;
- secret-manager configuration;
- field-encryption implementation;
- audit trigger implementation and verification;
- native spreadsheet import through quarantine;
- approved privacy, retention, and outreach policy.

## Campaign state

```yaml
minimum_target: 420000
stretch_target: 2000000
public_evidence: complete
campaign_architecture: complete
field_materials: draft_complete
public_data_contract: implemented
pages_workflow: implemented
authenticated_schema: drafted
outreach_authority: not_granted
sensitive_data_in_repo: prohibited
next_backend_phase: director_application_shell_and_import_quarantine
```
