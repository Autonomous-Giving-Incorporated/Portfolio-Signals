# Shared Impact Relay onboarding entry contract

## URL

The canonical suite entry is:

```text
https://autogive.app/portfolio-signals/workspace?onboarding=impact-relay[&tenant=org_<slug>]
```

The legacy `/fund-intel/workspace` route remains interoperable because the suite
gateway redirects it permanently to `/portfolio-signals/workspace` while
preserving the query string. The upstream workspace document is
`/workspace.html`; callers should use the suite URL above rather than the
upstream implementation filename.

Only the literal `onboarding=impact-relay` action is recognized. `tenant` is an
optional hint matching `^org_[a-z0-9_]{1,124}$`. Duplicate or malformed values are
not resolved. Redirect targets, credentials, tokens, email addresses, and
generic `next` parameters are not part of this contract.

## Authority and behavior

The query is navigation intent, never authority. After authentication and any
required MFA, the tenant hint is intersected with the tenant list returned by
the authenticated workspace context. The guided destination is exposed only
to a platform administrator and is the existing Platform admin → Impact Relay
provisioning pane. The implementation does not look up an arbitrary tenant ID.

An unavailable or unauthorized hint produces the same generic message and
does not echo the hint. Entry, authentication, MFA completion, and focus do not
submit a form, invoke a provisioning RPC, initialize storage, or navigate to an
external URL.

The pending intent is schema-validated, expires after 30 minutes, and is bound
to the first authenticated user that continues it. It is removed before the
destination receives one-time focus, so token refresh, tab focus, a later
reload, or a different signed-in user cannot replay it. Storage failures do not
prevent a fresh in-memory navigation from continuing. Native controls and the
existing tablist keyboard behavior remain unchanged.

## Status language

The destination distinguishes these states:

- requested: a private request record exists;
- reserved: an empty scaffold exists;
- initialized: the read-only storage core was verified;
- operational: **no**.

None of the first three states enables money execution, publication,
notifications, or policy activation.

## Suite verification

The suite route was verified at remote main
`ecbae3dd6736d050460b221350f0112acb63436a`. A live read-only request confirmed:

```text
https://autogive.app/fund-intel/workspace?onboarding=impact-relay&tenant=org_test
  → 301 https://autogive.app/portfolio-signals/workspace?onboarding=impact-relay&tenant=org_test
  → 200
```
