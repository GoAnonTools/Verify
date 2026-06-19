# GoAnon Verify privacy model

GoAnon Verify is designed around one promise:

> Websites should learn eligibility, not identity.

For age verification, that means a website can learn `age_over_threshold = true` while the user keeps their name, exact birthdate, ID document, face, address, wallet identifier, and official credential private.

## Strong privacy mode

A proof method receives the GoAnon `Privacy Grade A` label only when all of these are true:

- proof generation happens locally on the user's device;
- no government, issuer, wallet backend, or a GoAnon Verify server or any GoAnon ecosystem server is contacted during normal website proof use;
- the proof is fresh and bound to the requesting website origin;
- the proof does not contain a stable cross-site user identifier;
- the website receives only the age-threshold claim and cryptographic proof material;
- the code and verifier format are auditable.

## What can leave the device

| Data | Leaves device? | Notes |
|---|---:|---|
| Name | No | Not needed for age eligibility. |
| Exact birthdate | No | Hidden inside the local proof witness. |
| ID image / passport scan | No | GoAnon should not collect or transmit it. |
| Face / biometric | No | Not part of this design. |
| Wallet ID / national ID | No | Must not appear in the proof envelope. |
| Passphrase | No | Used only to decrypt locally. |
| `age_over_threshold = true` | Yes | This is the claim the website needs. |
| ZK proof | Yes | Contains no raw identity attributes. |
| Issuer/trust-list label | Yes | Lets a site understand the proof's trust source. |

## Government / issuer tracking protection

The critical design rule is:

> Issuers are involved at credential issuance time, not at every website proof.

A good flow is:

1. A wallet or issuer gives the user an age credential once.
2. The credential remains in the wallet/device.
3. A website asks for an age proof.
4. GoAnon/wallet generates a local proof.
5. The website verifies the proof.
6. The issuer is not contacted and does not learn which website requested proof.

A method is downgraded or blocked if it performs a per-use online issuer/status check that can reveal website visits.

## Privacy grades

| Grade | Meaning |
|---|---|
| A | Local/offline proof use; no issuer/government/GoAnon Verify or GoAnon ecosystem callback; no stable ID. |
| B | No raw ID shared, but there is some metadata or implementation risk. |
| C | The method may contact an issuer/status service during proof use. Warn users. |
| BLOCKED | The method creates tracking or discloses unnecessary identity data. |

## Current alpha limitations

The current circuit proves an age threshold from an encrypted local credential. Before production, the project still needs:

- compiled circuit artifacts in the release package;
- a real issuer signature / trust-list verification model;
- a circuit update so the website challenge/domain is also committed inside the ZK proof public signals;
- independent security review.

Until then, this package is a technical alpha and developer demo, not a legal age-verification product.

## Backend privacy addendum

GoAnon Verify’s privacy model depends on both the browser proof flow and the relying-party backend.

A cooperating website should learn only whether the user satisfies the required age threshold. It should not receive the user’s name, exact birthdate, ID document, face scan, biometric data, wallet identifier, address, passphrase, or encrypted credential.

### Challenge privacy

The relying-party backend should generate a single-use challenge and store only a challenge hash.

The raw challenge should be treated as short-lived verification material, not as user identity.

Recommended behavior:

* generate random high-entropy challenges;
* store only challenge hashes;
* expire unused challenges quickly;
* retain used challenge hashes only long enough to reject replay attempts;
* avoid logging raw challenges.

### Proof privacy

In production, relying parties should avoid storing full proof envelopes unless there is a clear legal, security, or compliance reason.

Recommended production logs should be minimal:

* timestamp;
* verification result;
* stable error code, if failed;
* threshold requested;
* relying-party audience;
* no raw ID data;
* no exact birthdate;
* no stable wallet identifier.

### Demo proof privacy

Local demo proofs are development-only.

They must not be described as legal or production age verification. Production verifiers reject them by default, and production mode blocks enabling demo proofs.

### Trust-anchor privacy

Trust anchors define which issuers, wallets, credentials, or proof systems a relying party may accept.

A trust-anchor allowlist must not become a tracking system. GoAnon Verify should prefer verification methods that avoid per-use callbacks to an issuer, government endpoint, wallet backend, GoAnon Verify server, or other GoAnon ecosystem server.

GoAnon Verify proves eligibility, not identity.

