## Naming clarity

GoAnon is the broader privacy tools ecosystem at goanon.pro.

GoAnon Verify is this specific privacy-preserving age proof tool.

Use “GoAnon Verify” on first mention and “Verify” when the context is already clear. Avoid using “GoAnon” alone when referring to this extension, SDK, verifier, proof protocol, backend demo, or age-proof flow.

# Verify

**Verify** is a privacy-preserving age proof tool from the **GoAnon ecosystem**.

**Digital Dignity principle:** websites should learn eligibility, not identity.

Verify lets a user prove `age_over_threshold = true` without uploading an ID document, revealing their exact birthdate, or creating a central log of where they verify age.

This repository is an **alpha prototype** for:

* a local-first browser extension;
* an explicit website proof request protocol;
* a demo page for `goanon.pro/verify`;
* a verifier SDK for cooperating websites;
* an EUDI-compatible wallet-first architecture;
* strict privacy labels that reject per-use government, issuer, or GoAnon Verify tracking or broader GoAnon ecosystem tracking.

## Product direction

Verify is not a bypass tool.

The earlier prototype included platform-specific adapters for services such as YouTube, Twitch, Reddit, and others. Those are now intentionally removed from the public path.

The public direction is:

1. **GoAnon Verify demo page** — shows the private proof flow clearly.
2. **Cooperating websites** — any website can request and verify a proof using the SDK.
3. **EUDI-compatible wallet flows** — only when they support age-only, unlinkable presentation without per-use issuer/government tracking.
4. **Local test credential** — development only; not real identity or legal age verification.

## How it works

A cooperating website asks the extension to prove age eligibility.

The extension asks for user consent.

The credential is unlocked locally with the user's passphrase.

A proof is generated or presented locally.

The website receives only:

* `age_over_threshold = true`;
* proof envelope;
* issuer/trust label;
* privacy label;
* website-bound challenge.

The website does **not** receive:

* name;
* exact birthdate;
* ID image or passport scan;
* address;
* face or biometric data;
* wallet ID;
* passphrase;
* encrypted credential.

## Government / issuer tracking protection

GoAnon Verify’s strong privacy rule is:

> No government, issuer, wallet backend, or GoAnon Verify server or other GoAnon ecosystem server should be contacted during normal website proof use.

A trusted issuer or wallet may be involved when the user first obtains a credential. After that, proving age to websites should happen locally or through a wallet presentation flow that does not reveal where the proof is used.

The extension uses privacy labels:

| Grade   | Meaning                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------- |
| A       | Digital Dignity Protected: local/offline proof use, no issuer/government/GoAnon Verify or GoAnon ecosystem callback, no stable ID. |
| B       | Acceptable with warning: no raw ID shared, but implementation or metadata risk remains.                 |
| C       | Limited privacy: the method may contact an issuer/status service during proof use. Warn users.          |
| BLOCKED | The method creates tracking risk or discloses unnecessary identity data.                                |

See:

* `docs/PRIVACY_MODEL.md`
* `docs/THREAT_MODEL.md`
* `docs/EUDI_READINESS.md`
* `docs/EUDI_FRANCE_IDENTITE_PLAN.md`

## Repository structure

```text
Verify/
├── circuits/
├── src/
│   ├── engine.ts
│   ├── protocol.ts
│   ├── content.ts
│   ├── background.ts
│   ├── issuers.ts
│   └── adapters.ts
├── popup/
├── sdk/
├── demo/
├── docs/
└── build.mjs
```

## Quick start

```bash
npm install
npm run build:all
```

Load the extension:

* Chromium / Chrome / Brave / Edge: `chrome://extensions` → Developer mode → Load unpacked → `dist/chrome/`
* Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → `dist/firefox/manifest.json`

## Run the local demo

Start a local web server:

```bash
npm run demo
```

Then open:

```text
http://localhost:8080/demo/
```

In the extension:

1. click **Add age proof**;
2. choose **Local test credential**;
3. create a local test credential;
4. set a passphrase;
5. return to the demo page;
6. click **Prove I am over 18 privately**.

The local test credential is for development only. It is not legal proof of age.

## Current issuer / wallet status

### EUDI-compatible wallet

Status: **experimental connector not enabled yet**.

Verify is being prepared for official EU wallet age proofs. This connector will only be enabled when privacy checks confirm:

* no issuer/government callback during normal proof use;
* no exact birthdate shared with websites;
* no stable wallet identifier shared;
* no GoAnon Verify server or other GoAnon ecosystem server involved in proof use.

### Local test credential

Status: **available for development only**.

This mode tests the extension flow locally. It is not real identity verification and should not be accepted by production websites.

## Circuit build

The package does not include trusted setup artifacts by default. To generate them locally, Circom must be installed first.

```bash
npm run circuit:build
npm run build:all
```

This creates:

* `circuits/age_verify.wasm`
* `circuits/age_verify_final.zkey`
* `circuits/verification_key.json`

Alpha note: the current Chromium MV3 build uses a clearly marked local demo proof fallback for local test credentials. Production real ZK proving still needs the final circuit artifacts and a browser-compatible proving architecture.

## Website integration

A cooperating website includes the SDK:

```html
<script src="/goanon-verify.js"></script>
<button id="verify-age">Verify age privately</button>
<script>
  document.getElementById('verify-age').onclick = async () => {
    const proof = await GoAnonVerify.requestAgeProof({
      minAge: 18,
      reason: 'Access age-restricted content',
      relyingPartyName: 'Example Site'
    });

    console.log(proof);
  };
</script>
```

See `docs/INTEGRATION_GUIDE.md`.

## Alpha limitations

Before production, Verify still needs:

1. real EUDI / France Identité wallet integration;
2. confirmation that the wallet flow avoids per-use issuer/government callbacks;
3. compiled circuit artifacts in release builds;
4. real issuer signature / trust-list verification;
5. challenge and domain binding inside the proof/public envelope;
6. unlinkable commitments that cannot become cross-site tracking handles;
7. independent security and privacy review;
8. legal/compliance review for target markets.

## Scripts

```bash
npm test
npm run build:chrome
npm run build:firefox
npm run build:all
npm run demo
npm run circuit:build
```

## License

© 2026 GoAnon | GoAnon.pro

Licensed under the Apache License, Version 2.0. See the `LICENSE` file for details.
