# Release checklist

GoAnon Verify is currently an alpha browser extension and website proof SDK.

This checklist is used before publishing a GitHub release, browser-store package, or public demo build.

## Current release target

* Version: `0.2.0-alpha`
* Protocol: `goanon.verify.v1`
* License: Apache-2.0
* Status: private alpha / public source release
* Primary goal: cooperating website proof flow
* Not a bypass tool
* Not legal age verification in demo mode

## Required before every release

* [ ] `npm test` passes.
* [ ] `npm run build:all` passes.
* [ ] `git status --short` is clean before tagging.
* [ ] `node_modules/` is not tracked.
* [ ] `.env`, secrets, keys, logs, and local build artifacts are not tracked.
* [ ] `dist/chrome` and `dist/firefox` are rebuilt from current source.
* [ ] README version/status matches the release.
* [ ] Manifest version and `version_name` match the release.
* [ ] Homepage URL points to `https://goanon.pro/tools/verify.html`.

## Privacy and safety checks

* [ ] The product is described as proving eligibility, not identity.
* [ ] The public UI does not claim production legal age verification.
* [ ] Demo/local test credentials are clearly marked as development-only.
* [ ] Demo proofs are rejected by default by `sdk/verify-proof.mjs`.
* [ ] Production examples use `allowDemo: false`.
* [ ] Local demo examples explain that `allowDemo: true` is for testing only.
* [ ] No raw ID upload flow is exposed to websites.
* [ ] No exact birthdate is shared with websites.
* [ ] No face scan or biometric data is shared with websites.
* [ ] No stable wallet identifier is shared with websites.
* [ ] No browsing activity is sent to an issuer, government, or GoAnon server during proof use.

## EUDI / official wallet readiness

* [ ] EUDI-compatible wallet path is visible as the intended official route.
* [ ] EUDI connector is disabled until privacy checks pass.
* [ ] UI clearly says official wallet support is not enabled yet.
* [ ] No issuer/government callback is required during normal proof use.
* [ ] No exact birthdate is requested by cooperating websites.
* [ ] No stable wallet or account identifier is exposed to relying parties.
* [ ] `docs/EUDI_FRANCE_IDENTITE_PLAN.md` is up to date.
* [ ] `docs/EUDI_READINESS.md` is up to date.

## Public UI checks

* [ ] Popup does not show Yivi, itsme, BankID, or other removed issuer names.
* [ ] Popup default state says no age proof yet.
* [ ] EUDI wallet card is marked experimental.
* [ ] Local test credential is marked testing/development only.
* [ ] Settings mention local proof history only.
* [ ] Apache-2.0 license label is visible where appropriate.
* [ ] Demo page shows protocol, mode, expiry, disclosed fields, and warning.
* [ ] Demo page does not imply production legal verification.

## Documentation checks

* [ ] `docs/INTEGRATION_GUIDE.md` documents `goanon.verify.v1`.
* [ ] Integration guide explains challenge, audience, expiry, and replay checks.
* [ ] Integration guide warns that demo proofs are not production/legal verification.
* [ ] `docs/PRIVACY_MODEL.md` is current.
* [ ] `docs/THREAT_MODEL.md` is current.
* [ ] `docs/PRIVACY_POLICY.md` is present.
* [ ] `docs/PERMISSIONS.md` explains extension permissions.
* [ ] `docs/STORE_LISTING.md` is present and honest about alpha status.

## SDK / verifier checks

* [ ] `sdk/goanon-verify.js` uses `goanon.verify.v1`.
* [ ] `sdk/verify-proof.mjs` validates proof envelope shape.
* [ ] Verifier checks protocol version.
* [ ] Verifier checks proof type.
* [ ] Verifier checks claim type and result.
* [ ] Verifier checks minimum age threshold.
* [ ] Verifier checks expiration.
* [ ] Verifier checks expected challenge.
* [ ] Verifier checks expected audience/origin.
* [ ] Verifier rejects demo/local-test proofs by default.
* [ ] Verifier tests cover rejection and local-demo acceptance behavior.

## Cryptography status

* [ ] Circuit source is present.
* [ ] Trusted setup artifacts are not presented as production-ready unless reviewed.
* [ ] Missing circuit artifacts are clearly treated as alpha/development status.
* [ ] Production cryptographic proof path is not overstated.
* [ ] Any production verifier requires explicit `verifyAgeProof` integration.
* [ ] Demo fallback remains labeled as non-cryptographic.

## Browser package checks

* [ ] Chrome build loads from `dist/chrome`.
* [ ] Firefox build loads from `dist/firefox`.
* [ ] Manifest permissions are still minimal and explained.
* [ ] Content script behavior is limited to cooperating website requests.
* [ ] Browser-store package has been manually inspected.
* [ ] Browser-store package does not include local secrets, logs, or development-only files.
* [ ] Store listing does not claim production legal age verification.
* [ ] Store listing explains that official wallet support is experimental/prepared.

## Website / public page checks

* [ ] GoAnon homepage links to `/tools/verify.html`.
* [ ] Verify tool page says “Prove your age. Not your identity.”
* [ ] Verify tool page says coming soon / private alpha.
* [ ] Verify tool page explains what is shared and not shared.
* [ ] Verify tool page does not imply government or issuer tracking.
* [ ] Verify tool page matches README positioning.

## Release decision

A release can be tagged only when:

* tests pass;
* build passes;
* documentation is honest about alpha status;
* demo mode cannot be mistaken for legal verification;
* no removed issuer branding appears in public UI;
* privacy claims match the actual code.

## Known alpha blockers

* Official EUDI-compatible wallet connection is not enabled yet.
* France Identité / EUDI implementation requires current official documentation review.
* Production cryptographic verifier integration needs final review.
* Circuit trusted setup artifacts are not production-ready.
* Browser-store submission has not completed review.
