# GoAnon Verify backend demo

This is a production-style relying-party demo for GoAnon Verify.

It demonstrates:

- server-generated single-use challenges;
- server-side challenge storage using only a challenge hash;
- proof verification with expected challenge, audience, threshold, and expiry;
- challenge consumption after successful verification;
- replay rejection for reused challenges;
- demo proof rejection by default.

## Run

Production-safe default:

~~~sh
npm run demo:backend
~~~

In this mode, local demo proofs are rejected.

Local extension demo mode:

~~~sh
GOANON_VERIFY_ALLOW_DEMO=true npm run demo:backend
~~~

Then open:

~~~text
http://localhost:8787
~~~

## Expected browser behavior

First verification:

~~~text
Verified. Challenge consumed.
~~~

Replay same proof/challenge:

~~~text
409 challenge_already_used
~~~

## Security notes

This demo is intentionally dependency-light and uses an in-memory challenge store.

A production relying party should replace the in-memory map with a database or Redis store that atomically consumes challenges, for example:

~~~sql
UPDATE goanon_verify_challenges
SET used_at = now()
WHERE challenge_hash = $1
  AND used_at IS NULL
  AND expires_at > now()
RETURNING *
~~~

The atomic consume step is the replay-protection boundary.

Do not enable demo proofs in production. Keep `GOANON_VERIFY_ALLOW_DEMO` unset or false outside local development.

## Production demo-mode guard

The demo server refuses to start if demo proofs are enabled while `NODE_ENV=production`.

This is blocked:

~~~sh
NODE_ENV=production GOANON_VERIFY_ALLOW_DEMO=true npm run demo:backend
~~~

This protects relying-party integrators from accidentally accepting local demo proofs in production-like environments.

The local demo mode remains available only for development:

~~~sh
GOANON_VERIFY_ALLOW_DEMO=true npm run demo:backend
~~~
