import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ChallengeStore,
  createDemoServer,
  createSafeStructuredLogger,
  sanitizeLogFields,
} from "../server.mjs";

function listen(app) {
  return new Promise(resolve => {
    app.server.listen(0, "127.0.0.1", () => {
      const address = app.server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(resolveClose => app.server.close(resolveClose))
      });
    });
  });
}

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function demoProof({ challenge, audience, threshold = 18, expiresInSeconds = 60 }) {
  const expiresAt = Date.now() + expiresInSeconds * 1000;

  return {
    type: "goanon.age.proof",
    protocol: "goanon.verify.v1",
    mode: "demo-local-test",
    proof_type: "local-demo-not-cryptographic",
    relying_party: {
      origin: audience,
      domain: new URL(audience).hostname,
      name: "GoAnon Verify backend demo test"
    },
    challenge,
    claim: {
      type: "age_over_threshold",
      threshold,
      result: true
    },
    issued_at: new Date().toISOString(),
    expires_at: expiresAt,
    disclosed: ["age_over_threshold"],
    not_disclosed: [
      "name",
      "exact_birthdate",
      "id_document",
      "passport_scan",
      "face",
      "biometric_data",
      "wallet_identifier",
      "address",
      "passphrase",
      "encrypted_credential"
    ],
    privacy: {
      grade: "B",
      issuer_contacted_during_proof: false,
      goanon_server_contacted_during_proof: false,
      persistent_identifiers_disclosed: [],
      personal_data_disclosed: ["age_over_threshold"]
    },
    warning: "Local test credential only. This is not legal age verification and not a production cryptographic proof."
  };
}

test("challenge endpoint creates a high-entropy challenge and stores only its hash", async () => {
  const app = createDemoServer({ allowDemo: true });
  const running = await listen(app);

  try {
    const { response, body } = await getJson(`${running.baseUrl}/api/goanon/challenge`);

    assert.equal(response.status, 200);
    assert.equal(typeof body.challenge, "string");
    assert.ok(body.challenge.length >= 40);
    assert.equal(body.threshold, 18);
    assert.equal(body.audience, running.baseUrl);

    const rawChallengeIsStored = [...app.challengeStore.records.values()]
      .some(record => Object.values(record).includes(body.challenge));

    assert.equal(rawChallengeIsStored, false);
  } finally {
    await running.close();
  }
});

test("valid demo proof is accepted only when demo mode is explicitly enabled and then challenge is consumed", async () => {
  const app = createDemoServer({ allowDemo: true });
  const running = await listen(app);

  try {
    const challengeRes = await getJson(`${running.baseUrl}/api/goanon/challenge`);
    const challenge = challengeRes.body;

    const payload = {
      challenge: challenge.challenge,
      proof: demoProof({
        challenge: challenge.challenge,
        audience: challenge.audience,
        threshold: challenge.threshold
      })
    };

    const first = await getJson(`${running.baseUrl}/api/goanon/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.equal(first.response.status, 200);
    assert.equal(first.body.verified, true);
    assert.equal(first.body.challenge_consumed, true);

    const replay = await getJson(`${running.baseUrl}/api/goanon/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.equal(replay.response.status, 409);
    assert.equal(replay.body.verified, false);
    assert.equal(replay.body.error, "challenge_already_used");
  } finally {
    await running.close();
  }
});

test("demo proof is rejected by default", async () => {
  const app = createDemoServer({ allowDemo: false });
  const running = await listen(app);

  try {
    const challengeRes = await getJson(`${running.baseUrl}/api/goanon/challenge`);
    const challenge = challengeRes.body;

    const result = await getJson(`${running.baseUrl}/api/goanon/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challenge: challenge.challenge,
        proof: demoProof({
          challenge: challenge.challenge,
          audience: challenge.audience,
          threshold: challenge.threshold
        })
      })
    });

    assert.equal(result.response.status, 400);
    assert.equal(result.body.verified, false);
    assert.equal(result.body.error, "demo_proof_rejected");
  } finally {
    await running.close();
  }
});

test("unknown challenge is rejected", async () => {
  const app = createDemoServer({ allowDemo: true });
  const running = await listen(app);

  try {
    const payload = {
      challenge: "unknown-challenge",
      proof: demoProof({
        challenge: "unknown-challenge",
        audience: running.baseUrl
      })
    };

    const result = await getJson(`${running.baseUrl}/api/goanon/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.equal(result.response.status, 404);
    assert.equal(result.body.error, "challenge_not_found");
  } finally {
    await running.close();
  }
});

test("expired challenge is rejected", async () => {
  const app = createDemoServer({ allowDemo: true, challengeTtlMs: 1 });
  const running = await listen(app);

  try {
    const challengeRes = await getJson(`${running.baseUrl}/api/goanon/challenge`);
    const challenge = challengeRes.body;

    await new Promise(resolve => setTimeout(resolve, 10));

    const result = await getJson(`${running.baseUrl}/api/goanon/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challenge: challenge.challenge,
        proof: demoProof({
          challenge: challenge.challenge,
          audience: challenge.audience,
          threshold: challenge.threshold
        })
      })
    });

    assert.equal(result.response.status, 410);
    assert.equal(result.body.error, "challenge_expired");
  } finally {
    await running.close();
  }
});

test("wrong audience is rejected and does not consume the challenge", async () => {
  const app = createDemoServer({ allowDemo: true });
  const running = await listen(app);

  try {
    const challengeRes = await getJson(`${running.baseUrl}/api/goanon/challenge`);
    const challenge = challengeRes.body;

    const wrongAudience = await getJson(`${running.baseUrl}/api/goanon/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challenge: challenge.challenge,
        proof: demoProof({
          challenge: challenge.challenge,
          audience: "https://evil.example",
          threshold: challenge.threshold
        })
      })
    });

    assert.equal(wrongAudience.response.status, 400);
    assert.equal(wrongAudience.body.verified, false);

    const correctAudience = await getJson(`${running.baseUrl}/api/goanon/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challenge: challenge.challenge,
        proof: demoProof({
          challenge: challenge.challenge,
          audience: challenge.audience,
          threshold: challenge.threshold
        })
      })
    });

    assert.equal(correctAudience.response.status, 200);
    assert.equal(correctAudience.body.verified, true);
  } finally {
    await running.close();
  }
});

test("used challenge records are retained long enough to reject replay", () => {
  const store = new ChallengeStore({
    ttlMs: 1,
    usedChallengeRetentionMs: 60_000
  });

  const created = store.create({
    audience: "http://localhost.test",
    threshold: 18
  });

  const reservation = store.beginVerification(created.challenge);
  assert.equal(reservation.ok, true);

  store.completeVerification(reservation.record);
  store.cleanExpired();

  const replay = store.beginVerification(created.challenge);
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);
  assert.equal(replay.code, "challenge_already_used");
});

test("server refuses allowDemo=true when NODE_ENV=production", () => {
  const previous = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "production";

    assert.throws(
      () => createDemoServer({ allowDemo: true }),
      /Demo proofs cannot be enabled in production mode/
    );
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
});


test("safe structured logger redacts sensitive fields", () => {
  const clean = sanitizeLogFields({
    challenge: "raw-challenge",
    proof: { type: "goanon.age.proof" },
    nested: {
      passphrase: "secret",
      walletIdentifier: "wallet-id",
      safe: "ok"
    }
  });

  assert.equal(clean.challenge, "[redacted]");
  assert.equal(clean.proof, "[redacted]");
  assert.equal(clean.nested.passphrase, "[redacted]");
  assert.equal(clean.nested.walletIdentifier, "[redacted]");
  assert.equal(clean.nested.safe, "ok");
});

test("backend structured logs do not expose raw challenge or proof envelope", async () => {
  const records = [];
  const logger = createSafeStructuredLogger({
    enabled: true,
    sink: (record) => records.push(record)
  });

  const app = createDemoServer({ allowDemo: true, logger });
  const running = await listen(app);

  try {
    const challengeRes = await getJson(`${running.baseUrl}/api/goanon/challenge`);
    const challenge = challengeRes.body;

    const payload = {
      challenge: challenge.challenge,
      proof: demoProof({
        challenge: challenge.challenge,
        audience: challenge.audience,
        threshold: challenge.threshold
      })
    };

    const first = await getJson(`${running.baseUrl}/api/goanon/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.equal(first.response.status, 200);

    const replay = await getJson(`${running.baseUrl}/api/goanon/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.equal(replay.response.status, 409);

    const serialized = JSON.stringify(records);

    assert.ok(records.some((record) => record.event === "challenge_created"));
    assert.ok(records.some((record) => record.event === "verification_succeeded"));
    assert.ok(records.some((record) =>
      record.event === "verification_rejected" &&
      record.error === "challenge_already_used"
    ));

    assert.equal(serialized.includes(challenge.challenge), false);
    assert.equal(serialized.includes('"proof"'), false);
    assert.equal(serialized.includes("local-demo-not-cryptographic"), false);
  } finally {
    await running.close();
  }
});

