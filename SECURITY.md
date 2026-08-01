# Security and Data Handling Policy

## Scope

This repository hosts a static director-facing campaign dashboard. It is not the system of record for members, donors, sponsors, grants, event attendance, or outreach operations.

## Allowed Data

- public organizational information;
- public campaign targets approved for disclosure;
- aggregate counts that cannot reasonably identify a person;
- public sponsor and grant research;
- planning states, decision gates, and governance controls;
- synthetic examples clearly marked as examples.

## Prohibited Data

Do not commit:

- names paired with personal contact information;
- member, attendee, donor, or alumni exports;
- personal email addresses, phone numbers, or street addresses;
- donation histories or capacity estimates;
- attendance-level or RSVP histories;
- relationship notes, contact scores, consent state, or suppression state;
- identity-provider tokens, API keys, passwords, or database credentials;
- spreadsheet or CSV exports containing campaign records.

## Reporting

Report suspected exposure privately to the repository owner. Do not open a public issue containing the exposed information.

A report should include:

- affected path or commit;
- classification of the exposed data;
- whether the data was publicly reachable;
- approximate exposure period;
- containment actions already taken.

## Incident Response

1. Stop deployment if the affected content is public.
2. Remove access and rotate affected credentials.
3. Preserve relevant audit evidence without duplicating exposed data.
4. Remove the content from the current branch and deployment.
5. Rewrite Git history when required for meaningful containment.
6. Identify affected individuals and notification obligations.
7. Record root cause, scope, decisions, and remediation.

## Authentication Requirements for the Future CRM

- MFA for privileged roles;
- least-privilege RBAC;
- row-level authorization;
- encrypted transport and storage;
- immutable audit events for approvals and exports;
- explicit suppression and consent controls;
- tested backup and restore;
- time-bounded sessions;
- secret rotation and environment separation.

## Security Boundary

GitHub Pages is a publication surface, not a privacy or authorization boundary. Restricted campaign operations must use a separately authenticated application and database.
