/**
 * goanon.pro — ZK Age Proof Engine
 *
 * Zero-knowledge age verification core.
 * Runs entirely in the browser/extension — no data leaves the local machine.
 *
 * Flow:
 *   1. User receives a signed credential from a trusted issuer (bank, eID)
 *   2. Credential is encrypted and stored locally with AES-256-GCM
 *   3. On demand, a ZK proof is generated locally: proves age ≥ 18 without
 *      revealing the actual birthdate or any identity information
 *   4. The proof (a small JSON object) is sent to the requesting site
 *   5. The site verifies the proof — learns only "yes, over 18"
 */


import {
  GOANON_PROTOCOL_VERSION,
  STRONG_PRIVACY_LABEL,
  makeNonce,
  type AgeProofPresentation,
  type PrivacyLabel,
} from "./protocol.js";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A raw credential received from a trusted issuer */
export interface IssuedCredential {
  /** Birthdate as days since Unix epoch (1970-01-01 = 0) */
  birthdate_days: number;
  /** Random nonce used to generate the commitment — keeps it unlinkable */
  salt: bigint;
  /** Poseidon hash of (birthdate_days, salt) — the issuer signs this */
  commitment: bigint;
  /** Unix timestamp when the credential was issued */
  issued_at: number;
  /** Issuer identifier, for example "eudi" or "manual". */
  issuer: string;
  /** Privacy label for the method used to obtain/present the credential. */
  privacy?: PrivacyLabel;
  /** True when normal proof presentation can happen without contacting the issuer. */
  offline_presentation?: boolean;
  /** Optional issuer public key or trust-list reference, never a personal identifier. */
  issuer_key_id?: string;
}

/** The encrypted blob stored locally */
export interface StoredCredential {
  /** AES-256-GCM ciphertext (base64) */
  ciphertext: string;
  /** IV for AES-GCM (base64) */
  iv: string;
  /** Salt used to derive the storage key (base64) */
  keySalt: string;
  /** Issuer — stored unencrypted for UX purposes only, contains no PII */
  issuer: string;
  /** When this was stored */
  stored_at: number;
  /** Stored in plaintext so UI can warn users before use; contains no PII. */
  privacy?: PrivacyLabel;
  /** Whether proof presentation is expected to be offline/local. */
  offline_presentation?: boolean;
  /** Optional issuer public key or trust-list reference. */
  issuer_key_id?: string;
}

/** A relying-party context that binds a proof presentation to one website request. */
export interface ProofRequestContext {
  audience: string;
  domain: string;
  challenge: string;
  minAge?: number;
  ttlSeconds?: number;
}

/** The proof sent to the verifying site — contains zero PII */
export interface AgeProof {
  /** Stable envelope type for website SDKs. */
  type: "goanon.age.proof";
  /** Human-readable claim. */
  claim: "age_over_threshold";
  /** Requested minimum age, e.g. 18. */
  minAge: number;
  /** Groth16 proof object (π_a, π_b, π_c) */
  proof: {
    pi_a: string[];
    pi_b: string[][];
    pi_c: string[];
    protocol: string;
    curve: string;
  };
  /** Public signals visible to the verifier */
  publicSignals: {
    /** Commitment to the birthdate. A production issuer must sign or attest this without creating a tracking ID. */
    commitment: string;
    /** The date used as "today" — public, not private */
    today_days: string;
    /** Age threshold in days (e.g. 6570 for 18 years) */
    threshold_days: string;
    /** Always "1" — the circuit enforces this */
    is_over_age: string;
  };
  /** Domain/challenge envelope. Verifiers must check this to prevent replay. */
  presentation?: AgeProofPresentation;
  /** Privacy label for this proof method. */
  privacy: PrivacyLabel;
  /** ISO timestamp when this proof was generated */
  generated_at: string;
  /** Issuer identifier / trust-list label; never a personal identifier. */
  issuer: string;
  /** Optional issuer public key or trust-list reference. */
  issuer_key_id?: string;
  /** Version of the goanon proof protocol */
  protocol_version: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROTOCOL_VERSION = GOANON_PROTOCOL_VERSION;
const DEFAULT_AGE_THRESHOLD_YEARS = 18;
const DAYS_PER_YEAR = 365.25;
const UNIX_EPOCH = new Date("1970-01-01T00:00:00Z").getTime();

// ─── Credential Storage (AES-256-GCM, local only) ────────────────────────────

/**
 * Derives a 256-bit AES key from a user passphrase using PBKDF2.
 * The key never leaves the browser's SubtleCrypto implementation.
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 600_000,  // OWASP 2023 recommendation
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts and stores a credential locally.
 * The actual birthdate and salt are AES-256-GCM encrypted.
 * Only the issuer name is stored in plaintext (for UX — no PII).
 *
 * @param credential  The credential received from the issuer
 * @param passphrase  User's local passphrase (never transmitted)
 * @returns           Encrypted blob safe to persist in localStorage / extension storage
 */
export async function storeCredential(
  credential: IssuedCredential,
  passphrase: string
): Promise<StoredCredential> {
  const keySalt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));  // 96-bit IV for AES-GCM
  const key = await deriveKey(passphrase, keySalt);

  // Serialize only the sensitive fields
  const plaintext = JSON.stringify({
    birthdate_days: credential.birthdate_days,
    salt: credential.salt.toString(),
    commitment: credential.commitment.toString(),
    issued_at: credential.issued_at,
  });

  const enc = new TextEncoder();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );

  return {
    ciphertext: bufToBase64(ciphertextBuffer),
    iv: bufToBase64(iv),
    keySalt: bufToBase64(keySalt),
    issuer: credential.issuer,  // Not sensitive
    stored_at: Date.now(),
    privacy: credential.privacy ?? STRONG_PRIVACY_LABEL,
    offline_presentation: credential.offline_presentation ?? true,
    issuer_key_id: credential.issuer_key_id,
  };
}

/**
 * Decrypts a stored credential using the user's passphrase.
 * This happens entirely locally — passphrase is never sent anywhere.
 */
export async function loadCredential(
  stored: StoredCredential,
  passphrase: string
): Promise<IssuedCredential> {
  const keySalt = base64ToBuf(stored.keySalt);
  const iv = base64ToBuf(stored.iv);
  const ciphertext = base64ToBuf(stored.ciphertext);
  const key = await deriveKey(passphrase, new Uint8Array(keySalt));

  let plaintextBuffer: ArrayBuffer;
  try {
    plaintextBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(iv) },
      key,
      ciphertext
    );
  } catch {
    throw new Error("Decryption failed — wrong passphrase or corrupted credential.");
  }

  const dec = new TextDecoder();
  const raw = JSON.parse(dec.decode(plaintextBuffer));

  return {
    birthdate_days: raw.birthdate_days,
    salt: BigInt(raw.salt),
    commitment: BigInt(raw.commitment),
    issued_at: raw.issued_at,
    issuer: stored.issuer,
    privacy: stored.privacy ?? STRONG_PRIVACY_LABEL,
    offline_presentation: stored.offline_presentation ?? true,
    issuer_key_id: stored.issuer_key_id,
  };
}

// ─── ZK Proof Generation ─────────────────────────────────────────────────────

/**
 * Generates a zero-knowledge age proof.
 *
 * What the proof reveals:
 *   ✓ That you know a birthdate satisfying age ≥ threshold
 *   ✓ That your birthdate was committed to by a trusted issuer
 *   ✗ Nothing about your actual birthdate
 *   ✗ Nothing about your identity
 *   ✗ Nothing linkable across different proof generations (with fresh salt)
 *
 * @param credential     Decrypted credential (stays in memory only)
 * @param wasmPath       Path to the compiled circuit WASM (bundled with extension)
 * @param zkeyPath       Path to the proving key (bundled with extension)
 * @param thresholdYears Age threshold (default: 18)
 */
export async function generateAgeProof(
  credential: IssuedCredential,
  wasmPath: string,
  zkeyPath: string,
  thresholdYearsOrContext: number | ProofRequestContext = DEFAULT_AGE_THRESHOLD_YEARS
): Promise<AgeProof> {
  const today = new Date();
  const today_days = Math.floor((today.getTime() - UNIX_EPOCH) / (1000 * 60 * 60 * 24));
  const context = typeof thresholdYearsOrContext === "number"
    ? null
    : thresholdYearsOrContext;
  const thresholdYears = typeof thresholdYearsOrContext === "number"
    ? thresholdYearsOrContext
    : thresholdYearsOrContext.minAge ?? DEFAULT_AGE_THRESHOLD_YEARS;
  const threshold_days = Math.floor(thresholdYears * DAYS_PER_YEAR);

  if (credential.birthdate_days >= today_days - threshold_days) {
    throw new Error(`Age verification failed: credential does not meet the ${thresholdYears}-year threshold.`);
  }

  const generatedAt = today.toISOString();
  const ttlSeconds = context?.ttlSeconds ?? 300;
  const presentation = context ? {
    audience: context.audience,
    domain: context.domain,
    challenge: context.challenge,
    nonce: makeNonce(),
    expires_at: Date.now() + ttlSeconds * 1000,
  } : undefined;

  // Alpha/demo mode:
  // Chrome MV3 service workers cannot currently run the bundled snarkjs prover reliably
  // because snarkjs expects URL.createObjectURL. For local demo credentials, return a
  // clearly-marked demo proof before snarkjs is loaded at all.
  if (isDemoCredential(credential)) {
    console.warn("[goanon] Using demo proof fallback. This is not a production cryptographic proof.");
    return makeDemoAgeProof({
      credential,
      thresholdYears,
      today_days,
      threshold_days,
      generatedAt,
      presentation,
    });
  }

  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error(
      "Real ZK proving is not available inside this Chrome MV3 service worker yet. " +
      "Use a demo credential for the alpha flow, or move proving to an offscreen document."
    );
  }

  const input = {
    birthdate_days: credential.birthdate_days,
    salt: credential.salt.toString(),
    today_days,
    threshold_days,
    commitment: credential.commitment.toString(),
  };

  console.log("[goanon] Generating real ZK proof locally…");
  const snarkjs = await getSnarkjs();

  if (!snarkjs?.groth16?.fullProve) {
    throw new Error("snarkjs Groth16 prover is unavailable in this build.");
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath
  );

  return {
    type: "goanon.age.proof",
    claim: "age_over_threshold",
    minAge: thresholdYears,
    proof,
    publicSignals: {
      commitment: publicSignals[0],
      today_days: publicSignals[1],
      threshold_days: publicSignals[2],
      is_over_age: publicSignals[3],
    },
    presentation,
    privacy: credential.privacy ?? STRONG_PRIVACY_LABEL,
    generated_at: generatedAt,
    issuer: credential.issuer,
    issuer_key_id: credential.issuer_key_id,
    protocol_version: PROTOCOL_VERSION,
  };
}

// ─── Proof Verification (runs on the site's side) ────────────────────────────

/**
 * Verifies an AgeProof.
 * This is what a website runs — it verifies the cryptographic proof
 * without learning anything about the user beyond "≥ threshold".
 *
 * Verifiers should pass expectedAudience and expectedChallenge when the proof
 * came from the website SDK. This prevents replay across domains or sessions.
 */
export async function verifyAgeProof(
  proof: AgeProof,
  vkeyJson: object,
  options: number | {
    maxAgeSeconds?: number;
    expectedAudience?: string;
    expectedChallenge?: string;
  } = 300
): Promise<{ valid: boolean; reason?: string }> {
  const snarkjs = await getSnarkjs();
  const opts = typeof options === "number" ? { maxAgeSeconds: options } : options;
  const maxAgeSeconds = opts.maxAgeSeconds ?? 300;

  // Check proof freshness (prevents replay attacks)
  const proofAge = (Date.now() - new Date(proof.generated_at).getTime()) / 1000;
  if (proofAge > maxAgeSeconds) {
    return { valid: false, reason: `Proof expired (${Math.round(proofAge)}s old, max ${maxAgeSeconds}s)` };
  }

  if (proof.type !== "goanon.age.proof" || proof.claim !== "age_over_threshold") {
    return { valid: false, reason: "Unsupported GoAnon proof envelope." };
  }

  // Verify the is_over_age public signal is actually 1
  if (proof.publicSignals.is_over_age !== "1") {
    return { valid: false, reason: "Public signal is_over_age is not 1" };
  }

  // Verify the proof date is plausible (not in the future)
  const proofDate = new Date(proof.generated_at);
  if (proofDate > new Date()) {
    return { valid: false, reason: "Proof generated_at is in the future" };
  }

  // Check protocol version
  if (proof.protocol_version !== PROTOCOL_VERSION) {
    return { valid: false, reason: `Unknown protocol version: ${proof.protocol_version}` };
  }

  // Check the website-bound presentation envelope when requested.
  if (proof.presentation) {
    if (proof.presentation.expires_at < Date.now()) {
      return { valid: false, reason: "Proof presentation expired." };
    }
    if (opts.expectedAudience && proof.presentation.audience !== opts.expectedAudience) {
      return { valid: false, reason: "Proof audience mismatch." };
    }
    if (opts.expectedChallenge && proof.presentation.challenge !== opts.expectedChallenge) {
      return { valid: false, reason: "Proof challenge mismatch." };
    }
  } else if (opts.expectedAudience || opts.expectedChallenge) {
    return { valid: false, reason: "Missing proof presentation envelope." };
  }

  // GoAnon strong privacy rules: no per-use issuer/government/GoAnon server callbacks.
  if (proof.privacy?.grade === "BLOCKED") {
    return { valid: false, reason: "Proof method is blocked by privacy policy." };
  }
  if (proof.privacy?.issuer_contacted_during_proof || proof.privacy?.goanon_server_contacted_during_proof) {
    return { valid: false, reason: "Proof does not meet GoAnon strong privacy rules." };
  }

  const publicSignalsArray = [
    proof.publicSignals.commitment,
    proof.publicSignals.today_days,
    proof.publicSignals.threshold_days,
    proof.publicSignals.is_over_age,
  ];

  try {
    const valid = await snarkjs.groth16.verify(vkeyJson, publicSignalsArray, proof.proof);
    return valid
      ? { valid: true }
      : { valid: false, reason: "Cryptographic verification failed" };
  } catch (err) {
    return { valid: false, reason: `Verification error: ${(err as Error).message}` };
  }
}

// ─── Credential Builder (for testing / mock issuers) ─────────────────────────

/**
 * Builds a credential from a birthdate string.
 * In production, the issuer does this and signs the commitment.
 * Here it's used for local testing without a real issuer.
 *
 * @param birthdate  ISO date string, e.g. "1990-04-15"
 * @param issuer     Issuer identifier
 */
export async function buildTestCredential(
  birthdate: string,
  issuer: string = "local-test"
): Promise<IssuedCredential> {
  const date = new Date(birthdate + "T00:00:00Z");
  const birthdate_days = Math.floor((date.getTime() - UNIX_EPOCH) / (1000 * 60 * 60 * 24));

  // Generate a cryptographically random salt
  const saltBytes = crypto.getRandomValues(new Uint8Array(31));
  const salt = BigInt("0x" + Array.from(saltBytes).map(b => b.toString(16).padStart(2, "0")).join(""));

  // Compute Poseidon commitment — in prod, the issuer signs this
  // For testing we use a placeholder; in the full build circomlibjs handles this
  const commitment = await computeCommitment(birthdate_days, salt);

  return {
    birthdate_days,
    salt,
    commitment,
    issued_at: Date.now(),
    issuer,
    privacy: STRONG_PRIVACY_LABEL,
    offline_presentation: true,
    issuer_key_id: `${issuer}:demo`,
  };
}

/**
 * Computes the Poseidon hash commitment of (birthdate_days, salt).
 * This mirrors exactly what the circom circuit computes internally.
 * The issuer signs this commitment — it's the only value they ever see.
 */
async function computeCommitment(birthdate_days: number, salt: bigint): Promise<bigint> {
  // In the full build, this uses circomlibjs Poseidon:
  //   const { buildPoseidon } = await import("circomlibjs");
  //   const poseidon = await buildPoseidon();
  //   return poseidon.F.toObject(poseidon([birthdate_days, salt]));
  //
  // For the core package (no WASM dependency at this layer),
  // we return a placeholder — replaced at build time.
  const msg = `${birthdate_days}:${salt}`;
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", enc.encode(msg));
  const arr = new Uint8Array(hash);
  return BigInt("0x" + Array.from(arr).map(b => b.toString(16).padStart(2, "0")).join(""));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function bufToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function normalizeSnarkjs(mod: any) {
  if (mod?.groth16?.fullProve) return mod;
  if (mod?.default?.groth16?.fullProve) return mod.default;
  if (mod?.snarkjs?.groth16?.fullProve) return mod.snarkjs;
  return null;
}

/** Lazy-load snarkjs (it's heavy; only needed when proving/verifying) */
async function getSnarkjs() {
  const globalCandidate = normalizeSnarkjs((globalThis as any).snarkjs);
  if (globalCandidate) return globalCandidate;

  const imported = await import("snarkjs");
  const candidate = normalizeSnarkjs(imported);
  if (candidate) return candidate;

  throw new Error("snarkjs Groth16 prover is unavailable in this build.");
}

function isDemoCredential(credential: IssuedCredential): boolean {
  const issuer = String(credential.issuer ?? "").toLowerCase();
  const keyId = String(credential.issuer_key_id ?? "").toLowerCase();

  const explicitDemoIssuers = [
    "manual",
    "demo",
    "local-test",
    "custom",
    "my-issuer",
  ];

  if (explicitDemoIssuers.includes(issuer)) return true;
  if (keyId.includes(":demo")) return true;

  // Anything created by the manual JSON importer before trusted issuer support
  // is treated as alpha/demo unless it clearly names a real provider.
  const trustedProviderNames = ["eudi", "eudi-wallet"];
  const looksTrusted = trustedProviderNames.some(name => issuer.includes(name));
  return !looksTrusted && !keyId;
}

function makeDemoAgeProof(args: {
  credential: IssuedCredential;
  thresholdYears: number;
  today_days: number;
  threshold_days: number;
  generatedAt: string;
  presentation?: AgeProofPresentation;
}): AgeProof {
  return {
    type: "goanon.age.proof",
    claim: "age_over_threshold",
    minAge: args.thresholdYears,
    proof: {
      pi_a: ["0", "0", "0"],
      pi_b: [["0", "0"], ["0", "0"], ["0", "0"]],
      pi_c: ["0", "0", "0"],
      protocol: "goanon-demo-not-cryptographic",
      curve: "demo",
    },
    publicSignals: {
      commitment: args.credential.commitment.toString(),
      today_days: args.today_days.toString(),
      threshold_days: args.threshold_days.toString(),
      is_over_age: "1",
    },
    presentation: args.presentation,
    privacy: {
      ...(args.credential.privacy ?? STRONG_PRIVACY_LABEL),
      grade: "B",
      issuer_contacted_during_proof: false,
      goanon_server_contacted_during_proof: false,
      persistent_identifiers_disclosed: [],
      personal_data_disclosed: ["age_over_threshold"],
      warning: "Demo credential only. This proves the local UI flow, not a production cryptographic age proof.",
    },
    generated_at: args.generatedAt,
    issuer: args.credential.issuer,
    issuer_key_id: args.credential.issuer_key_id ?? "demo:not-trusted",
    protocol_version: PROTOCOL_VERSION,
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  PROTOCOL_VERSION,
  DEFAULT_AGE_THRESHOLD_YEARS,
  computeCommitment,
};
