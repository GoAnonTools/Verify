# GoAnon Verify privacy model

GoAnon Verify is designed around one promise:

> Websites should learn eligibility, not identity.

For age verification, that means a website can learn `age_over_threshold = true` while the user keeps their name, exact birthdate, ID document, face, address, wallet identifier, and official credential private.

## Strong privacy mode

A proof method receives the GoAnon `Privacy Grade A` label only when all of these are true:

- proof generation happens locally on the user's device;
- no government, issuer, wallet backend, or GoAnon server is contacted during normal website proof use;
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
| A | Local/offline proof use; no issuer/government/GoAnon callback; no stable ID. |
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
