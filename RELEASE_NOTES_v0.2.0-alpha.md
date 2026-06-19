# GoAnon Verify v0.2.0-alpha release notes

This release reframes the project from a platform-specific age-gate bypass prototype into a privacy-preserving age proof standard for cooperating websites.

## Added

- `src/protocol.ts` / `src/protocol.js` — explicit website request/response protocol.
- `sdk/goanon-verify.js` — browser SDK for cooperating websites.
- `sdk/verify-proof.mjs` — verifier helper for server/backend integrations.
- `demo/index.html` and `demo/app.js` — GoAnon demo page flow.
- `docs/PRIVACY_MODEL.md` — Digital Dignity privacy model and privacy grades.
- `docs/INTEGRATION_GUIDE.md` — website integration guide.
- `docs/EUDI_READINESS.md` — EUDI wallet acceptance/privacy gate.
- `docs/THREAT_MODEL.md` — project threat model.

## Changed

- Public content script now only responds to explicit GoAnon proof requests from cooperating websites.
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
- Strong privacy mode rejects methods that contact an issuer/government/GoAnon server during normal proof use.
- EUDI-compatible wallet support is a planned placeholder until a wallet flow passes the privacy gate.

## Validation

- `npm test` — 11 passed.
- `npm run build:all` — Chrome and Firefox bundles built.

## Known alpha gaps

- Circuit artifacts are still not included. Run `npm run circuit:build` before real proof generation.
- Production still needs real issuer signature/trust-list verification.
- The website challenge is bound in the proof envelope; production should also bind it inside circuit public signals.
- npm audit currently reports dependency vulnerabilities inherited from the alpha dependency tree; review before public release.
