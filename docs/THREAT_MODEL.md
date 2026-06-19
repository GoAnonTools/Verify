# Threat model

## Goals

GoAnon Verify tries to prevent:

- websites collecting ID documents or birthdates for simple age eligibility;
- GoAnon becoming a central verification logger;
- issuers/governments learning every website where a credential is used;
- websites linking the same user across different sites through stable proof identifiers;
- replay of an old proof on a different website or in a later session.

## Non-goals

GoAnon cannot hide the user's IP address from the website. Users who need network anonymity should use a VPN, Tor, or another network privacy tool.

GoAnon also cannot force a website to accept a proof. Websites must integrate and verify the protocol.

## Main risks

### 1. Fake/self-attested credentials

A local demo credential proves only that the user typed a date. Production requires a trusted issuer/wallet credential and a verified issuer trust model.

### 2. Issuer tracking through online status checks

Per-use issuer checks can create a log of where credentials are used. GoAnon should prefer offline/unlinkable revocation mechanisms and downgrade or block per-use callbacks.

### 3. Cross-site linkability

A stable commitment or credential ID can become a tracking handle. Production credentials should use unlinkable presentations and avoid stable identifiers in public proof data.

### 4. Replay

Websites must use single-use challenges. The proof envelope includes `audience`, `challenge`, `nonce`, and expiry; verifiers must check them.

### 5. Malicious websites asking for too much

The extension should only satisfy the minimal age-threshold claim. It should reject requests for full name, birthdate, document number, face, or wallet identifier.
