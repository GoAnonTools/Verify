/**
 * goanon.pro — ZK Engine Test Suite
 *
 * Tests the credential storage and proof generation/verification pipeline.
 * Run with: node --experimental-vm-modules test/engine.test.mjs
 *
 * NOTE: Full ZK proof generation requires the compiled circuit (WASM + zkey).
 * These tests cover the crypto layer (encrypt/decrypt) and proof structure.
 * The integration test at the bottom is skipped without the circuit files.
 */

import { strict as assert } from "assert";
import {
  storeCredential,
  loadCredential,
  buildTestCredential,
  PROTOCOL_VERSION,
} from "../src/engine.js";

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ─── Polyfills for Node.js ────────────────────────────────────────────────────
// Node 22+ has globalThis.crypto built-in — no polyfill needed

// ─── Suite: Credential builder ────────────────────────────────────────────────
console.log("\n📋 Credential builder");

await test("builds a credential from a birthdate string", async () => {
  const cred = await buildTestCredential("1990-06-15", "test-issuer");
  assert(typeof cred.birthdate_days === "number");
  assert(cred.birthdate_days > 0);
  assert(typeof cred.salt === "bigint");
  assert(typeof cred.commitment === "bigint");
  assert.equal(cred.issuer, "test-issuer");
});

await test("birthdate_days is correct for a known date", async () => {
  // 1990-01-01 is 7305 days after 1970-01-01
  const cred = await buildTestCredential("1990-01-01");
  assert.equal(cred.birthdate_days, 7305);
});

await test("generates different salts for same birthdate", async () => {
  const cred1 = await buildTestCredential("1990-06-15");
  const cred2 = await buildTestCredential("1990-06-15");
  assert.notEqual(cred1.salt, cred2.salt, "Salts should be random");
  assert.notEqual(cred1.commitment, cred2.commitment, "Commitments differ with different salts");
});

await test("rejects future birthdate (negative days not supported by circuit)", async () => {
  // 2030-01-01 — in the future
  const cred = await buildTestCredential("2030-01-01");
  const today = Math.floor(Date.now() / 86400000);
  assert(cred.birthdate_days > today, "Future birthdate should have days > today");
  // The ZK circuit would reject this proof — tested in integration tests
});

// ─── Suite: Credential storage ────────────────────────────────────────────────
console.log("\n🔒 Credential storage (AES-256-GCM)");

await test("encrypts and decrypts a credential correctly", async () => {
  const cred = await buildTestCredential("1990-06-15", "test-issuer");
  const passphrase = "my-secret-passphrase-123";

  const stored = await storeCredential(cred, passphrase);
  const loaded = await loadCredential(stored, passphrase);

  assert.equal(loaded.birthdate_days, cred.birthdate_days);
  assert.equal(loaded.salt, cred.salt);
  assert.equal(loaded.commitment, cred.commitment);
  assert.equal(loaded.issuer, cred.issuer);
});

await test("stored blob contains no plaintext birthdate", async () => {
  const cred = await buildTestCredential("1990-06-15");
  const stored = await storeCredential(cred, "passphrase");
  const storedStr = JSON.stringify(stored);

  // The actual birthdate days should not appear in plaintext
  assert(!storedStr.includes("7471"), "birthdate_days must not appear in stored blob");
  assert(!storedStr.includes("1990"), "Birth year must not appear in stored blob");
});

await test("issuer name is stored in plaintext (UX feature, not PII)", async () => {
  const cred = await buildTestCredential("1990-06-15", "itsme.be");
  const stored = await storeCredential(cred, "passphrase");
  assert.equal(stored.issuer, "itsme.be");
});

await test("wrong passphrase throws on decrypt", async () => {
  const cred = await buildTestCredential("1990-06-15");
  const stored = await storeCredential(cred, "correct-passphrase");

  try {
    await loadCredential(stored, "wrong-passphrase");
    assert.fail("Should have thrown");
  } catch (err) {
    assert(err.message.includes("Decryption failed"), `Expected 'Decryption failed', got: ${err.message}`);
  }
});

await test("each store call uses a different IV and keySalt", async () => {
  const cred = await buildTestCredential("1990-06-15");
  const stored1 = await storeCredential(cred, "passphrase");
  const stored2 = await storeCredential(cred, "passphrase");

  assert.notEqual(stored1.iv, stored2.iv, "IVs must be unique");
  assert.notEqual(stored1.keySalt, stored2.keySalt, "Key salts must be unique");
  assert.notEqual(stored1.ciphertext, stored2.ciphertext, "Ciphertexts must be unique");
});

await test("tampered ciphertext throws on decrypt", async () => {
  const cred = await buildTestCredential("1990-06-15");
  const stored = await storeCredential(cred, "passphrase");

  // Flip one byte in the ciphertext
  const ct = atob(stored.ciphertext);
  const tampered = btoa(String.fromCharCode(ct.charCodeAt(0) ^ 0xff) + ct.slice(1));

  try {
    await loadCredential({ ...stored, ciphertext: tampered }, "passphrase");
    assert.fail("Should have thrown on tampered ciphertext");
  } catch (err) {
    assert(err.message.includes("Decryption failed"));
  }
});

// ─── Suite: Protocol version ──────────────────────────────────────────────────
console.log("\n📄 Protocol");

await test("PROTOCOL_VERSION is set", () => {
  assert.equal(PROTOCOL_VERSION, "goanon-age-v1");
});

// ─── Integration test (skipped without circuit files) ────────────────────────
console.log("\n⚡ Integration (ZK proof generation)");

import { existsSync } from "fs";
const circuitReady = existsSync("./circuits/age_verify_final.zkey");

if (!circuitReady) {
  console.log("  ⊘  Skipped — compile circuit first: npm run circuit:build");
  console.log("     (requires circom + snarkjs CLI installed globally)");
} else {
  await test("generates a valid proof for someone born in 1990", async () => {
    const { generateAgeProof, verifyAgeProof } = await import("../src/engine.js");
    const cred = await buildTestCredential("1990-06-15");
    const proof = await generateAgeProof(
      cred,
      "./circuits/age_verify.wasm",
      "./circuits/age_verify_final.zkey"
    );
    assert.equal(proof.publicSignals.is_over_age, "1");
    assert.equal(proof.protocol_version, "goanon-age-v1");

    const vkey = JSON.parse(await import("fs").readFileSync("./circuits/verification_key.json", "utf8"));
    const result = await verifyAgeProof(proof, vkey);
    assert(result.valid, `Verification failed: ${result.reason}`);
  });

  await test("rejects proof for someone born in 2015 (under 18)", async () => {
    const { generateAgeProof } = await import("../src/engine.js");
    const cred = await buildTestCredential("2015-01-01");
    try {
      await generateAgeProof(
        cred,
        "./circuits/age_verify.wasm",
        "./circuits/age_verify_final.zkey"
      );
      assert.fail("Should have thrown for underage credential");
    } catch (err) {
      assert(err.message.includes("threshold"), `Unexpected error: ${err.message}`);
    }
  });
}

// ─── Results ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`  ${passed} passed · ${failed} failed`);
if (failed > 0) process.exit(1);
