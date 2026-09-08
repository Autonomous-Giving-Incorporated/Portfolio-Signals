# Gift-tracking connectors (SPEC-026 v1.1.0)

Portfolio Signals observes completed gifts from third-party receivers. AGI never processes donations. Stripe is SaaS billing only and is not a donation source.

This note is **CODE_SHIPPED** in-repo. It is not live pointing, not a live gift, and not READY.

Normative text lives in [Autonomous-Giving-Specs SPEC-026](https://github.com/Autonomous-Giving-Incorporated/Autonomous-Giving-Specs/blob/main/specs/SPEC-026-donation-source-connectors.md) v1.1.0 (squash `084c003709298febfcd8b5f980a6ef9639408b80`).

## Adapter

One adapter boundary, three functions only:

- `verify_webhook`
- `normalize_gift`
- `list_campaign_hints`

Gift summary shape: `chargeId`, `netAmount`, optional `amount`, campaign/program hints, `currency`, `donatedAt`, and opt-in identity. Credit is idempotent on `chargeId`.

## Tenant fields

| Field | Rule |
| --- | --- |
| `source` | `every.org` \| `givebutter` \| `donorbox` \| `csv` |
| `donation_link` | Optional HTTPS tenant receiver. Missing is allowed. Do not invent a URL. |
| Webhook secret | Worker binding. Never commit. Pointing stays operator-owned. |

ImpactNotice still requires contactable identity, Evidence or an explicit waive, and `donation_link`.

## Worker paths

These paths are in-repo on Worker `portfolio-signals`. They are **not** live URLs. Do not invent a `workers.dev` or named-host URL. The operator pastes the real origin into the vendor dashboard after a live host exists.

| Path | Role | Verify |
| --- | --- | --- |
| `POST /webhooks/every-org` | P0. Keep this path. | `x-webhook-token` or `?token=` |
| `POST /webhooks/givebutter` | P1 Givebutter `transaction.succeeded` | Header `Signature` equals `GIVEBUTTER_WEBHOOK_SECRET` |
| `POST /webhooks/donorbox` | P1 Donorbox `donation.created` | Header `Donorbox-Signature` as `timestamp,hmac-sha256` |
| `POST /import/csv` | Authenticated CSV twin | Director write session. Not a public webhook. |
| Other `/webhooks/*` | Reject | 404, including `/webhooks/stripe` |

## Operator pointing

1. Deploy or confirm the operator-owned Worker origin. Do not publish an invented host in this repository.
2. Set Worker secrets. Never commit them:
   - `WEBHOOK_TOKEN` (every.org)
   - `GIVEBUTTER_WEBHOOK_SECRET` (Givebutter)
   - `DONORBOX_WEBHOOK_SECRET` (Donorbox)
   - `SUPABASE_SERVICE_ROLE_KEY` (`am_*` writes)
3. Open the vendor dashboard and paste the matching path on that operator-owned origin.
4. every.org: nonprofit Advanced settings webhook URL.
5. Givebutter: webhook for `transaction.succeeded`. That event does not fire during Givebutter CSV imports.
6. Donorbox: custom webhooks need the **API/Zapier add-on or Premium**. Other tenants use `POST /import/csv`.
7. Leave pointing operator-owned until a controlled live gift is verified. Do not mark READY from this document.

## Field mapping (product)

- every.org: `fromFundraiser` → campaign, `designation` → slice, `chargeId`, `netAmount`.
- Givebutter: credit only when `event` or `type` is exactly `transaction.succeeded`. Missing event is a hold. `data.id` → `chargeId`, `data.donated` → `netAmount` (`payout` if `donated` is absent). Email only when `communication_opt_in` is true.
- Donorbox: credit only `donation.created`. v1 arrays credit only when `action` is `new` or `donation.created`; chargebacks and missing `action` hold. Never infer `donation.created`. donation `id` → `chargeId`. Never use `stripe_charge_id`. INFERRED net = `amount` − `processing_fee` when fee is present; otherwise `amount`. Email only when `join_mailing_list` is true.
- CSV required columns: `chargeId`, `netAmount`.

Refunds and chargebacks persist after verify and open `SYNC_FAILURE`. v1 does not debit pots.

Durable pot credit on the Supabase writer is an atomic increment via service-role RPC `am_credit_pot` (`INSERT … ON CONFLICT DO UPDATE` on `(client_id, campaign_key, program_key)`). The writer sends the gift increment only; it does not GET a pot and PATCH an absolute `credited_cents`. Gift insert stays idempotent on `chargeId`. This is CODE_SHIPPED, not live, and not READY.

## Exception catalog

Unchanged: `UNMAPPED_FUNDRAISER`, `UNMAPPED_DESIGNATION`, `DUPLICATE_GIFT`, `CURRENCY_MISMATCH`, `OVER_ALLOCATION`, `SYNC_FAILURE`, `MISSING_PROOF`, `STALE_POT`.

## Non-goals

No AGI checkout. No Stripe/PayPal/Square donation source. No Fundraise Up / Zeffy / GoFundMe Pro as required P1 work. No CRM, bank, Plaid, or QuickBooks. No HIPAA or live-operations claim.
