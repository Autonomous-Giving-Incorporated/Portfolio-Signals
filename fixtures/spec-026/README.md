# SPEC-026 synthetic connector fixtures

Synthetic payloads only. Do not copy live donor PII. Do not mark these `OBSERVED` or READY.

These files exercise the SPEC-026 v1.1.0 adapter (`verify_webhook`, `normalize_gift`, `list_campaign_hints`) for every.org, Givebutter, Donorbox, and CSV. Donorbox v1 arrays credit only when `action` is `new` or `donation.created`.

Field names follow public vendor help retrieved 2026-08-22. Product mappings remain INFERRED at the mapping edge. Re-read current vendor documentation before changing a mapping.
