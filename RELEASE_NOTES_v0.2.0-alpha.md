# GoAnon Verify v0.2.0-alpha release notes

This release reframes the project from a platform-specific age-gate bypass prototype into a privacy-preserving age proof standard for cooperating websites.

## Added

- `src/protocol.ts` / `src/protocol.js` — explicit website request/response protocol.
- `sdk/goanon-verify.js` — browser SDK for cooperating websites.
- `sdk/verify-proof.mjs` — verifier helper for server/backend integrations.
- `demo/index.html` and `demo/app.js` — GoAnon Verify demo page flow.
- `docs/PRIVACY_MODEL.md` — Digital Dignity privacy model and privacy grades.
- `docs/INTEGRATION_GUIDE.md` — website integration guide.
- `docs/EUDI_READINESS.md` — EUDI wallet acceptance/privacy gate.
- `docs/THREAT_MODEL.md` — project threat model.

## Changed

- Public content script now only responds to explicit GoAnon Verify proof requests from cooperating websites.
- Legacy platform manipulation adapters are disabled from the public path and replaced with an integration policy file.
- Proof envelope now includes:
  - claim type;
  - minimum age;
  - website audience;
  - challenge;
  - expiry;
  - privacy label;
  - issuer/trust-list label.
- Local activity logging is now off by default.
- Extension branding changed to `GoAnon Verify — private age proof`.
- README rewritten around the local-first, EUDI-ready, no-per-use-issuer-tracking architecture.

## Guardrails

- No default YouTube/Twitch/Reddit/X/adult-site manipulation path.
- Strong privacy mode rejects methods that contact an issuer/government/GoAnon Verify server or other GoAnon ecosystem server during normal proof use.
- EUDI-compatible wallet support is a planned placeholder until a wallet flow passes the privacy gate.

## Validation

- `npm test` — 11 passed.
- `npm run build:all` — Chrome and Firefox bundles built.

## Known alpha gaps

- Circuit artifacts are still not included. Run `npm run circuit:build` before real proof generation.
- Production still needs real issuer signature/trust-list verification.
- The website challenge is bound in the proof envelope; production should also bind it inside circuit public signals.
- npm audit currently reports dependency vulnerabilities inherited from the alpha dependency tree; review before public release.

## Backend and verifier hardening checkpoint

This alpha checkpoint adds a production-style relying-party backend demo and several verifier-safety improvements.

### Backend replay-protection demo

Added `examples/backend-demo/`, a dependency-light relying-party demo that shows the recommended server-side challenge lifecycle:

* generates high-entropy single-use challenges;
* stores only challenge hashes;
* binds proofs to expected challenge and audience;
* verifies age threshold and expiry;
* consumes challenges only after successful verification;
* rejects reused challenges with `challenge_already_used`;
* retains used challenge hashes briefly so replay attempts are explicitly rejected;
* rejects demo/local-test proofs by default;
* blocks demo proof mode when `NODE_ENV=production`.

### Safe backend logging

Added safe structured logging support for the backend demo.

The logger is designed to help debug the challenge lifecycle without leaking sensitive proof material. It avoids logging raw challenges, full proof envelopes, passphrases, credential material, birthdates, ID document data, biometric data, and wallet identifiers.

### Typed verifier errors

Updated the verifier helper with stable, machine-readable error codes and typed verifier errors.

This makes backend integrations safer because relying parties can branch on stable codes instead of parsing error text.

### Production verifier interface

Added a production-facing verifier wrapper placeholder.

The wrapper makes production requirements explicit:

* demo proofs are rejected by default;
* production proof types must be allowlisted;
* non-demo proofs require trust anchors or issuer allowlist;
* non-demo proofs require an injected cryptographic verifier;
* unsafe `allowDemo=true` in production mode is blocked.

This is still a placeholder interface. It does not claim final EUDI, wallet, selective-disclosure, ZK, legal, or production age verification.

### Trust-anchor config loader

Added a small JSON trust-anchor config loader.

The loader validates config shape, supports `trustAnchors` / `issuerAllowlist`, supports `allowedProofTypes`, and blocks obvious demo/manual issuer labels from production trust-anchor config.

A JSON allowlist is not enough for real production verification; future work still requires issuer signature validation, wallet/EUDI trust-list validation, selective-disclosure verification, or ZK proof verification.

### Executable docs examples

Added executable tests for production verifier documentation examples so SDK usage examples stay aligned with the actual API.

### Disabled EUDI wallet scaffold

Added a disabled EUDI wallet presentation scaffold.

The scaffold models the future request shape and privacy requirements, but it is not a live connector. It must remain disabled until the official wallet path, privacy behavior, trust model, and production verifier are reviewed.

### Documentation updates

Updated integration, trust-anchor, privacy, threat-model, and release checklist documentation to reflect replay protection, production verifier hardening, trust-anchor limits, safe logging, and the disabled EUDI wallet scaffold.

### Current alpha status

GoAnon Verify remains an alpha prototype.

Local demo proofs are still non-cryptographic, development-only, and not legal or production age verification.

GoAnon Verify proves eligibility, not identity.

