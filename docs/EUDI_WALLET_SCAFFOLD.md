# GoAnon Verify EUDI wallet scaffold

GoAnon Verify includes an alpha scaffold for a future EUDI-compatible wallet presentation path.

This scaffold is intentionally disabled.

It exists to document the expected request shape and privacy requirements before any live connector is implemented.

## Current status

The scaffold is not a live EUDI connector.

It does not perform:

- wallet discovery;
- wallet invocation;
- EUDI presentation verification;
- issuer trust-list validation;
- France Identité integration;
- production legal age verification.

The connector must remain disabled until the official wallet path, privacy behavior, trust model, and verifier implementation are reviewed.

## Future request shape

The future wallet connector is expected to request an age-threshold presentation shaped like this:

~~~js
await requestEudiWalletPresentation({
  challenge: "single-use-random-challenge",
  audience: "https://example.com",
  minAge: 18,
  relyingPartyName: "Example Site",
  purpose: "Age eligibility check"
});
~~~

The request must be:

- challenge-bound;
- audience-bound;
- short-lived;
- age-threshold-only;
- compatible with the production verifier.

## Privacy requirements

A future wallet presentation must satisfy these privacy gates:

- disclose age eligibility only, not exact birthdate;
- disclose no raw identity document;
- disclose no passport scan or ID image;
- disclose no face scan or biometric data;
- disclose no stable wallet or account identifier;
- bind the proof to a single-use challenge;
- bind the proof to the relying-party audience;
- avoid per-use issuer or government callbacks during normal proof use;
- avoid contacting a GoAnon Verify server or any other GoAnon ecosystem server during normal proof use.

## Alpha rule

Do not enable this connector until the research lock is satisfied.

The public product claim remains:

GoAnon Verify proves eligibility, not identity.
