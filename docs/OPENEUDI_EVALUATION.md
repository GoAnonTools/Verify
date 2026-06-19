# OpenEUDI evaluation for GoAnon Verify

This document records the current OpenEUDI evaluation direction for GoAnon Verify.

It is a research and planning document only.

No OpenEUDI dependency, adapter, or live connector is enabled by this document.

GoAnon Verify remains alpha. Local demo proofs are not legal or production age verification.

## Summary

OpenEUDI is currently the preferred first candidate to evaluate for a future EUDI-compatible verifier path in GoAnon Verify.

Reason:

- it is presented as an open-source TypeScript SDK;
- it targets EUDI Wallet verification;
- it is designed around OpenID4VP;
- it appears suitable for JavaScript / TypeScript relying-party backends;
- it may allow GoAnon Verify integrations to keep verification inside the relying-party backend instead of routing normal proof use through a GoAnon Verify server.

This makes OpenEUDI a better first research candidate than a managed verification API, because GoAnon Verify’s privacy model prefers no GoAnon Verify server or other GoAnon ecosystem server during normal proof use.

## Why OpenEUDI is relevant

GoAnon Verify needs a real production proof path.

The current local demo proof is intentionally non-cryptographic and development-only.

A future production path needs one of:

- verified EUDI-compatible wallet presentation;
- selective-disclosure credential proof;
- ZK proof over wallet-held attributes;
- reviewed cryptographic circuit and verifier.

OpenEUDI may help with the first two paths by providing OpenID4VP-related verifier functionality for EUDI Wallet presentations.

## Target role in GoAnon Verify

OpenEUDI should be evaluated as a possible verifier-side dependency for:

- OpenID4VP presentation handling;
- SD-JWT VC verification;
- mdoc / mDL credential handling;
- wallet presentation session handling;
- issuer / trust validation support;
- proof result normalization into the GoAnon Verify proof model.

The likely future shape is:

~~~text
EUDI wallet
  -> OpenID4VP presentation
  -> relying-party backend
  -> OpenEUDI verification
  -> GoAnon Verify production verifier wrapper
  -> age_over_threshold result
~~~

GoAnon Verify should still keep its own rules for:

- expected challenge;
- expected audience;
- requested age threshold;
- proof expiry;
- proof-type allowlisting;
- demo-proof rejection;
- privacy-grade labeling;
- trust-anchor policy;
- replay protection.

## Privacy fit

OpenEUDI is interesting only if it can support the GoAnon Verify privacy model.

The required privacy gates remain:

- no raw ID document upload to websites;
- no exact birthdate disclosure to websites;
- no face scan or biometric data shared with websites;
- no stable wallet identifier disclosed to websites;
- no browsing activity sent to GoAnon Verify during normal proof use;
- no GoAnon Verify server required during normal proof use;
- no other GoAnon ecosystem server required during normal proof use;
- challenge-bound proof;
- audience-bound proof;
- short-lived presentation;
- demo/local-test proofs rejected by default.

OpenEUDI must not be treated as acceptable merely because it verifies a wallet presentation.

The verified presentation must disclose only the minimum required eligibility claim.

For GoAnon Verify, the ideal disclosed claim is:

~~~json
{
  "type": "age_over_threshold",
  "threshold": 18,
  "result": true
}
~~~

## Open questions

Before implementation, answer these questions:

1. Does OpenEUDI support an age-over-threshold request without requesting exact birthdate?
2. Can it verify SD-JWT VC presentations where only the age eligibility claim is disclosed?
3. Can it verify mdoc / mDL presentations without exposing unnecessary identity fields?
4. Can it bind the presentation to a relying-party challenge?
5. Can it bind the presentation to a relying-party audience / origin?
6. Does it require a backend session service, and if yes, can that service run entirely in the relying-party backend?
7. Does it require any OpenEUDI, eIDAS Pro, GoAnon Verify, or other third-party callback during normal proof use?
8. What issuer trust model does it implement or expose?
9. Does it support EU trust list / LOTL validation directly, or must GoAnon Verify implement that separately?
10. Does production use require WRPAC or relying-party registration?
11. Can verifier logs avoid storing raw wallet presentations?
12. Can the result be normalized into GoAnon Verify’s `goanon.verify.v1` production verifier path?
13. What browser flow is expected: QR, same-device handoff, Digital Credentials API, or another mechanism?
14. Does the API expose enough detail to assign a GoAnon Verify privacy grade?
15. What parts remain demo-only in OpenEUDI itself?

## Non-goals for the first OpenEUDI step

Do not implement a live connector yet.

Do not add OpenEUDI as a runtime dependency yet.

Do not enable EUDI wallet support in the public extension.

Do not claim production or legal age verification.

Do not add FranceConnect login as a default path.

Do not route normal proof use through a GoAnon Verify server.

The first step is only research and evaluation.

## Possible future adapter shape

A future adapter could look like this:

~~~js
import {
  verifyProductionGoAnonAgeProof
} from "./production-verifier.mjs";

import {
  verifyOpenEudiPresentation
} from "./eudi-openeudi-adapter.mjs";

const result = await verifyProductionGoAnonAgeProof(proof, verificationKey, {
  expectedAudience,
  expectedChallenge,
  minAge: 18,
  trustAnchors,
  allowedProofTypes: [
    "eudi-wallet-presentation",
    "selective-disclosure-credential"
  ],
  verifyAgeProof: async (envelope, verificationKey, context) => {
    return verifyOpenEudiPresentation(envelope, {
      expectedAudience: context.expectedAudience,
      expectedChallenge: context.expectedChallenge,
      trustAnchors
    });
  }
});
~~~

This is only a possible shape.

It must stay behind the disabled EUDI wallet feature flag until the research lock is satisfied.

## Evaluation checklist

OpenEUDI may be considered a strong candidate only if it passes this checklist:

- [ ] License is compatible with GoAnon Verify.
- [ ] Package and repository are reviewed.
- [ ] API supports OpenID4VP verification.
- [ ] API supports the credential format needed for age proof.
- [ ] API can support age-over-threshold only.
- [ ] API can avoid exact birthdate disclosure to websites.
- [ ] API can avoid stable wallet identifier disclosure.
- [ ] API supports challenge binding.
- [ ] API supports audience binding.
- [ ] API supports short-lived presentations.
- [ ] API exposes issuer / trust validation details.
- [ ] API can integrate with GoAnon Verify trust anchors.
- [ ] API does not require GoAnon Verify server during normal proof use.
- [ ] API does not require third-party callback during normal proof use, unless clearly documented and privacy-graded.
- [ ] API allows safe production logging without raw presentation storage.
- [ ] API can be tested locally in demo mode without weakening production defaults.
- [ ] Production requirements such as certificates, relying-party registration, or trust-list setup are documented.
- [ ] Security review is completed before enabling.
- [ ] Privacy review is completed before enabling.
- [ ] Legal/compliance review is completed before any production or legal verification claim.

## Candidate privacy grade

OpenEUDI should not automatically receive Privacy Grade A.

A future OpenEUDI-backed flow may qualify for strong privacy only if normal proof use:

- verifies locally in the relying-party backend;
- does not contact the issuer or government per proof use;
- does not contact a GoAnon Verify server;
- does not contact another GoAnon ecosystem server;
- discloses only age eligibility;
- avoids stable cross-site identifiers;
- binds proof to challenge and audience.

If any third-party service is contacted during normal proof use, the flow must be downgraded or clearly labeled.

## Current decision

OpenEUDI is the first EUDI verifier candidate to evaluate.

No implementation is enabled yet.

The disabled scaffold remains the only EUDI wallet code path in GoAnon Verify alpha.

GoAnon Verify proves eligibility, not identity.
