# GoAnon Verify — EUDI / France Identité Integration Plan

Status: planning  
Direction: EUDI-first, local-first, privacy-first  
Goal: prove age eligibility, not identity.

## Product goal

GoAnon Verify should let a user prove:

“I am over the required age.”

without sharing:

- name
- exact birthdate
- ID card image
- passport
- address
- national ID number
- face scan
- wallet identifier
- browsing activity with the issuer or government

The website should receive only:

- age eligibility result
- cryptographic proof
- issuer family / trust reference
- privacy metadata

## Main product direction

GoAnon Verify should focus on:

- EUDI-compatible wallet age proof
- France Identité / France Titres experimental research path
- local test credential only for development

The public UI should not show Yivi, itsme, BankID, or country-specific providers unless they support the same privacy model.

## Strong privacy requirement

Strong privacy mode requires:

- no issuer or government callback during normal proof use
- no GoAnon server contacted during normal proof use
- no stable user identifier disclosed
- no exact birthdate disclosed
- no full identity disclosed
- proofs should be unlinkable across websites
- proofs should be bound to the requesting domain

If a wallet contacts the issuer or government every time a proof is used, GoAnon must label it as limited privacy.

## Privacy grades

Grade A: Digital Dignity Protected

- proof generated or presented locally
- issuer/government not contacted during proof use
- GoAnon server not contacted
- no stable identifier
- no exact birthdate
- no full identity
- domain-bound proof
- unlinkable across websites where possible

Grade B: Acceptable with warning

- good privacy model but not fully audited
- local test credential
- playground or experimental wallet flow

Grade C: Limited privacy

- issuer/status server may be contacted
- metadata leakage possible
- verifier may learn more than age eligibility

Blocked:

- full identity required for age-only use
- exact birthdate required unnecessarily
- stable wallet/user identifier disclosed
- government/issuer can see each website verification
- GoAnon becomes a tracking relay

## France Identité investigation checklist

Before implementing a real France Identité connector, verify:

- Does it support age-only verification?
- Does it disclose only over-18 status?
- Does it avoid sharing exact birthdate?
- Does proof use contact France Identité / France Titres servers?
- Does verification require a central endpoint?
- Is the presentation unlinkable across relying parties?
- Is the proof domain-bound?
- Does the relying party receive a stable identifier?
- Can it work from a browser extension?
- Does it support same-device flow?
- Does it support QR / cross-device flow?
- What production onboarding is required for websites?

Until these are answered, the connector must stay:

Experimental
Privacy grade pending

## Implementation phases

Phase 1 — Current alpha

- EUDI-first UI
- local test credential for development
- GoAnon demo page
- website proof request protocol
- no platform-specific bypass adapters in public path

Phase 2 — EUDI research connector

- keep connectEudiWallet placeholder
- research France Identité / EUDI verifier flows
- identify same-device and QR options
- verify whether issuer callback happens during proof use

Phase 3 — Experimental wallet flow

- launch wallet request
- receive wallet presentation
- parse age credential
- show privacy grade
- never store full identity
- do not store exact birthdate unless unavoidable and encrypted locally

Phase 4 — Production verifier SDK

- website-side verifier
- challenge and domain binding
- replay protection
- issuer trust-list validation
- public documentation

Phase 5 — Audit

- dependency audit
- cryptographic review
- extension storage review
- network traffic test
- wallet metadata review
- public threat model

## Hard product rules

1. GoAnon Verify proves eligibility, not identity.
2. GoAnon must not collect proof events.
3. GoAnon must not know which websites users verify with.
4. Websites should not receive more than age eligibility.
5. Issuers/governments must not be contacted during normal proof use in strong privacy mode.
6. Any weaker flow must be clearly labelled.
7. The extension must be open source and auditable.
8. No platform manipulation in the public path.
9. Cooperating websites must explicitly request a GoAnon proof.
10. Local test credentials are for development only.
