# EUDI readiness policy

GoAnon Verify is EUDI-wallet-ready, but not EUDI-dependent.

The intended production flow is:

1. The user receives or holds an official age credential in a wallet.
2. GoAnon Verify asks for an age-threshold proof, not full identity.
3. The wallet/credential proves `age_over_threshold` locally when possible.
4. The website receives only the age claim and cryptographic proof.

## Integration gate

GoAnon Verify should only mark an EUDI-compatible flow as `Privacy Grade A` if:

- normal presentation does not contact a government/issuer server;
- presentation does not disclose a wallet ID or persistent credential ID;
- revocation/status checking does not reveal the relying-party website to the issuer;
- proofs are unlinkable across websites;
- users see a clear consent screen saying exactly what is shared;
- the implementation/specification is auditable.

## If a wallet requires online issuer checks

If a wallet or national implementation requires contacting an issuer/government endpoint every time a user proves age, GoAnon Verify must not label that flow as strong privacy.

The UI should say:

> Limited privacy: this wallet may contact the issuer during verification. That could reveal when age verification happens.

## Product rule

No method receives the GoAnon “Digital Dignity Protected” label unless issuer/government tracking during normal proof use is technically prevented, not merely promised.
