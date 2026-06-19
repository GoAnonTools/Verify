# EUDI / France Identité research lock

Last checked: 2026-06-19

This document records the official-source research used to guide GoAnon Verify’s EUDI-compatible wallet path.

GoAnon Verify should not implement an official wallet connector until the privacy requirements below are satisfied.

## Sources checked

Official / primary sources reviewed:

* European Commission — EU Digital Identity Wallet Age Verification Manual
* European Commission — EU Digital Identity Wallet Security and Privacy
* European Commission — Age-verification blueprint, first and second release notes
* EUDI Wallet Architecture and Reference Framework
* EUDI Wallet zero-knowledge proof discussion topic
* France Identité official website
* France Identité identity-creation page
* France Identité / SGIN AIPD synthesis
* FranceConnect / FranceConnect+ partner documentation

## Confirmed direction

The public GoAnon Verify direction remains correct:

* prove age eligibility, not identity;
* disclose an age threshold result, not exact birthdate;
* avoid raw ID upload to relying parties;
* avoid stable wallet identifiers;
* avoid issuer/government callback during normal proof use;
* keep user consent at the center of every proof request;
* keep local test credentials clearly marked as development-only;
* keep official wallet support disabled until privacy checks pass.

## EUDI-compatible target

The target official-wallet proof should support:

* `age_over_threshold`;
* threshold values such as 16, 18, or 21;
* relying-party binding;
* single-use challenge binding;
* expiry / freshness;
* selective disclosure;
* unlinkability across relying parties;
* no exact birthdate disclosure;
* no identity attributes unless explicitly required by a separate use case;
* no GoAnon Verify server or other GoAnon ecosystem server in normal proof use.

The ideal public envelope remains:

```json
{
  "type": "goanon.age.proof",
  "protocol": "goanon.verify.v1",
  "claim": {
    "type": "age_over_threshold",
    "threshold": 18,
    "result": true
  },
  "disclosed": ["age_over_threshold"],
  "not_disclosed": [
    "name",
    "exact_birthdate",
    "id_document",
    "passport_scan",
    "face",
    "biometric_data",
    "wallet_identifier",
    "address",
    "passphrase",
    "encrypted_credential"
  ]
}
```

## France Identité notes

France Identité is relevant as a French official digital identity route.

Current public GoAnon Verify code should not present France Identité as an enabled connector until a privacy-preserving age-proof integration path is confirmed.

Important constraints:

* France Identité requires an eligible French identity card and compatible phone.
* France Identité is for adult users.
* France Identité is also available through FranceConnect / FranceConnect+ authentication contexts.
* FranceConnect-style login should not be treated as equivalent to a GoAnon age-only proof.
* A normal identity login may disclose or process more identity context than the GoAnon age-proof model needs.
* The desired path is an age / majority proof, not a full identity assertion.

## FranceConnect decision

Do not implement FranceConnect as the default GoAnon Verify proof path.

Reason:

FranceConnect is an identity/authentication federation. GoAnon Verify is an age-proof protocol for cooperating websites.

A FranceConnect integration may be useful for a separate login or account-verification product, but it is not the privacy-preserving age-only proof path unless it can satisfy the same requirements:

* no exact birthdate to the relying party;
* no full identity disclosure to the relying party;
* no stable cross-site identifier;
* no issuer/provider knowledge of relying-party proof use;
* no GoAnon Verify server or other GoAnon ecosystem server during normal proof use;
* proof challenge bound to the relying party.

## Digital Credentials API note

The EU age-verification blueprint mentions modern proof presentation methods such as the Digital Credentials API.

This is relevant for future browser integration, but GoAnon Verify should not depend on it until browser support, mobile wallet support, and privacy behavior are confirmed.

For now:

* keep the browser extension flow as the local demo / cooperating website test path;
* keep the EUDI connector disabled;
* document Digital Credentials API as a future presentation option;
* do not claim production support.

## Zero-knowledge proof note

The EUDI Wallet material treats selective disclosure and zero-knowledge proofs as privacy-enhancing capabilities.

GoAnon Verify should remain compatible with both routes:

1. selective-disclosure wallet presentation;
2. ZK proof over wallet-held attributes.

The public verifier envelope should not require websites to know which underlying mechanism was used, as long as the verifier can validate:

* issuer / trust anchor;
* challenge binding;
* relying-party binding;
* threshold claim;
* expiration;
* privacy label.

## Implementation blockers

Do not enable official-wallet proof until these are resolved:

* Which EUDI wallet presentation protocol is available to web relying parties?
* Is the Digital Credentials API available and stable enough for the target browsers?
* Can the relying party request only `age_over_threshold`?
* Can exact birthdate remain hidden?
* Can wallet identifiers remain hidden?
* Can the proof be one-time-use or unlinkable?
* Can the issuer/proof provider avoid learning the relying-party site during normal proof use?
* How are relying parties registered or trusted?
* Which public keys / trust lists are required for verifier validation?
* How does France Identité expose age / majority proof for online relying parties?
* Does the France Identité path require FranceConnect, or is there a separate age-proof presentation path?

## What can be implemented now

Safe now:

* keep EUDI issuer card visible but disabled;
* keep local test credential for development;
* keep `goanon.verify.v1` envelope stable;
* keep verifier rejecting demo proofs by default;
* improve docs and tests;
* prepare a wallet connector interface;
* prepare challenge/audience/expiry validation;
* prepare privacy labels;
* prepare Digital Credentials API experiments behind feature flags.

Not safe yet:

* claiming production legal verification;
* enabling France Identité as a public connector;
* enabling FranceConnect as the age-proof path;
* saying EUDI proof is live;
* saying ZK production proof is complete;
* accepting demo-local-test proofs in production.

## GoAnon decision

GoAnon Verify remains:

* EUDI-first;
* local-first for development;
* no raw ID upload;
* no exact birthdate disclosure;
* no stable wallet ID disclosure;
* no issuer/government callback during normal proof use;
* no GoAnon Verify server or other GoAnon ecosystem server during normal proof use;
* not a bypass tool.

The next implementation step is a disabled wallet connector scaffold, not a live France Identité integration.

## Disabled wallet scaffold

A disabled implementation scaffold exists at:

~~~text
src/eudi-wallet-scaffold.ts
~~~

Documentation:

~~~text
docs/EUDI_WALLET_SCAFFOLD.md
~~~

This scaffold must remain disabled until the official wallet path, privacy behavior, trust model, and production verifier are reviewed.
