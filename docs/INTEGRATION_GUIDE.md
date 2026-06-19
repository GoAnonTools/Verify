# Website integration guide

GoAnon Verify works with cooperating websites. The website explicitly requests a proof; the extension asks the user for consent; the website verifies the returned proof.

The public build intentionally does not alter platform internals, cookies, private APIs, or DOM gates.

## Browser flow

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

    // Send proof to your backend or verify locally with the public verification key.
    console.log(proof);
  };
</script>
```

## What your site receives

The proof envelope contains:

- `claim: "age_over_threshold"`
- `minAge: 18`
- `proof`: Groth16 proof object
- `publicSignals`: public circuit signals
- `presentation.audience`: your origin
- `presentation.challenge`: your single-use challenge
- `privacy`: GoAnon privacy label
- `issuer`: issuer/trust-list label

It does not contain the user's name, exact birthdate, ID image, address, face, or wallet identifier.

## Server-side verification checklist

Your site should verify:

1. the Groth16 proof against the public verification key;
2. `publicSignals.is_over_age === "1"`;
3. the proof is fresh;
4. the proof `presentation.audience` matches your origin;
5. the proof `presentation.challenge` matches a single-use challenge you generated;
6. the privacy label is acceptable for your policy;
7. the issuer/trust-list reference is acceptable for your compliance needs.

Use `sdk/verify-proof.mjs` as a starting point.

## Replay protection

Always generate a new challenge per session and reject reused challenges. A proof should never be accepted just because it is structurally valid.

## Alpha note

The current alpha binds the website challenge in the presentation envelope. A production circuit should also bind the challenge/domain inside a public signal so the ZK proof itself is domain-bound.
