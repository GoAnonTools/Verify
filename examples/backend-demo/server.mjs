import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as verifier from "../../sdk/verify-proof.mjs";
import {
  getDemoPolicyViolation
} from "../../sdk/production-verifier.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "public");
const SDK_PATH = resolve(__dirname, "../../sdk/goanon-verify.js");

const DEFAULT_PORT = Number(process.env.PORT || 8787);
const DEFAULT_THRESHOLD = Number(process.env.GOANON_VERIFY_THRESHOLD || 18);
const DEFAULT_CHALLENGE_TTL_MS = Number(process.env.GOANON_VERIFY_CHALLENGE_TTL_MS || 2 * 60 * 1000);
const DEFAULT_USED_CHALLENGE_RETENTION_MS = Number(process.env.GOANON_VERIFY_USED_CHALLENGE_RETENTION_MS || 10 * 60 * 1000);

function base64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

function sha256Base64url(value) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function nowMs() {
  return Date.now();
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function json(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers
  });
  res.end(payload);
}

function text(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  res.end(body);
}

function mimeType(pathname) {
  switch (extname(pathname)) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    default: return "application/octet-stream";
  }
}

function parseBooleanEnv(value) {
  return value === "1" || value === "true" || value === "yes";
}

const LOG_REDACTED = "[redacted]";

const SENSITIVE_LOG_KEYS = new Set([
  "challenge",
  "rawChallenge",
  "proof",
  "proofEnvelope",
  "credential",
  "passphrase",
  "encryptedCredential",
  "birthdate",
  "exactBirthdate",
  "idDocument",
  "passportScan",
  "face",
  "biometricData",
  "walletIdentifier"
]);

export function sanitizeLogFields(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeLogFields);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const clean = {};

  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_LOG_KEYS.has(key)) {
      clean[key] = LOG_REDACTED;
    } else {
      clean[key] = sanitizeLogFields(child);
    }
  }

  return clean;
}

export function createSafeStructuredLogger({
  enabled = parseBooleanEnv(process.env.GOANON_VERIFY_STRUCTURED_LOGS),
  sink = (record) => console.log(JSON.stringify(record))
} = {}) {
  return {
    info(event, fields = {}) {
      if (!enabled) return;

      sink({
        timestamp: new Date().toISOString(),
        service: "goanon-verify-backend-demo",
        event,
        ...sanitizeLogFields(fields)
      });
    }
  };
}

function challengeRef(record) {
  return record?.challengeHash ? record.challengeHash.slice(0, 16) : undefined;
}

function getRequestAudience(req) {
  const configured = process.env.GOANON_VERIFY_AUDIENCE;
  if (configured) return configured.replace(/\/$/, "");

  const host = req.headers.host || `localhost:${DEFAULT_PORT}`;
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}`.replace(/\/$/, "");
}

function parseJsonBody(req, maxBytes = 128 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.setEncoding("utf8");

    req.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        rejectBody(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolveBody({});
        return;
      }

      try {
        resolveBody(JSON.parse(body));
      } catch {
        rejectBody(new Error("Invalid JSON body."));
      }
    });

    req.on("error", rejectBody);
  });
}

async function verifyAgeProofWithExistingSdk(proof, options) {
  if (typeof verifier.verifyGoAnonAgeProof === "function") {
    const result = await verifier.verifyGoAnonAgeProof(proof, null, options);

    if (result?.ok === false) {
      const error = new Error(result.error || "GoAnon Verify proof verification failed.");
      error.code = result.code || "invalid_proof";
      error.details = result.details;
      throw error;
    }

    return result;
  }

  const verifyAgeProof =
    verifier.verifyAgeProof ||
    verifier.verifyProof ||
    verifier.default;

  if (typeof verifyAgeProof !== "function") {
    throw new Error("GoAnon Verify verifier export not found.");
  }

  const result = await verifyAgeProof(proof, options);

  if (result?.ok === false || result?.valid === false || result === false) {
    const error = new Error(result.error || result.reason || "GoAnon Verify proof verification failed.");
    error.code = result.code || "invalid_proof";
    error.details = result.details;
    throw error;
  }

  return result;
}

function verifierErrorCode(error) {
  if (error?.code) return error.code;

  const message = String(error?.message || error || "");

  if (/demo/i.test(message)) return "demo_proof_rejected";
  if (/challenge/i.test(message)) return "invalid_challenge";
  if (/audience|origin|relying/i.test(message)) return "invalid_audience";
  if (/expired|expiry/i.test(message)) return "proof_expired";
  if (/protocol/i.test(message)) return "invalid_protocol";

  return "invalid_proof";
}

export class ChallengeStore {
  constructor({
    ttlMs = DEFAULT_CHALLENGE_TTL_MS,
    usedChallengeRetentionMs = DEFAULT_USED_CHALLENGE_RETENTION_MS
  } = {}) {
    this.ttlMs = ttlMs;
    this.usedChallengeRetentionMs = usedChallengeRetentionMs;
    this.records = new Map();
  }

  create({ audience, threshold = DEFAULT_THRESHOLD, ttlMs = this.ttlMs } = {}) {
    const challenge = base64url(randomBytes(32));
    const challengeHash = sha256Base64url(challenge);
    const createdAt = nowMs();
    const expiresAt = createdAt + ttlMs;

    const record = {
      challengeHash,
      audience,
      threshold,
      createdAt,
      expiresAt,
      usedAt: null,
      lockedAt: null
    };

    this.records.set(challengeHash, record);

    return {
      challenge,
      challengeHash,
      audience,
      threshold,
      expiresAt,
      expiresAtSeconds: Math.floor(expiresAt / 1000)
    };
  }

  getByChallenge(challenge) {
    if (!challenge || typeof challenge !== "string") return null;
    return this.records.get(sha256Base64url(challenge)) || null;
  }

  beginVerification(challenge) {
    const record = this.getByChallenge(challenge);

    if (!record) {
      return { ok: false, status: 404, code: "challenge_not_found" };
    }

    if (record.usedAt) {
      return { ok: false, status: 409, code: "challenge_already_used", record };
    }

    if (record.lockedAt) {
      return { ok: false, status: 409, code: "challenge_verification_in_progress", record };
    }

    if (record.expiresAt <= nowMs()) {
      return { ok: false, status: 410, code: "challenge_expired", record };
    }

    record.lockedAt = nowMs();
    return { ok: true, record };
  }

  completeVerification(record) {
    record.usedAt = nowMs();
    record.lockedAt = null;
  }

  failVerification(record) {
    if (record && !record.usedAt) {
      record.lockedAt = null;
    }
  }

  cleanExpired() {
    const now = nowMs();

    for (const [hash, record] of this.records.entries()) {
      const unusedAndExpired = !record.usedAt && record.expiresAt <= now;
      const usedRetentionExpired =
        record.usedAt &&
        record.usedAt + this.usedChallengeRetentionMs <= now;

      if (unusedAndExpired || usedRetentionExpired) {
        this.records.delete(hash);
      }
    }
  }
}

export function createDemoServer({
  allowDemo = parseBooleanEnv(process.env.GOANON_VERIFY_ALLOW_DEMO),
  challengeTtlMs = DEFAULT_CHALLENGE_TTL_MS,
  usedChallengeRetentionMs = DEFAULT_USED_CHALLENGE_RETENTION_MS,
  logger = createSafeStructuredLogger()
} = {}) {
  const demoPolicyViolation = getDemoPolicyViolation({
    allowDemo,
    environment: process.env
  });

  if (demoPolicyViolation) {
    throw new Error(demoPolicyViolation.error);
  }

  const challengeStore = new ChallengeStore({
    ttlMs: challengeTtlMs,
    usedChallengeRetentionMs
  });

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", getRequestAudience(req));

      if (req.method === "GET" && url.pathname === "/healthz") {
        json(res, 200, {
          ok: true,
          service: "goanon-verify-backend-demo",
          allow_demo: allowDemo
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/goanon/challenge") {
        const threshold = Number(url.searchParams.get("threshold") || DEFAULT_THRESHOLD);

        if (!Number.isInteger(threshold) || threshold < 1 || threshold > 130) {
          json(res, 400, {
            ok: false,
            error: "invalid_threshold"
          });
          return;
        }

        const created = challengeStore.create({
          audience: getRequestAudience(req),
          threshold
        });

        logger.info("challenge_created", {
          challenge_ref: created.challengeHash.slice(0, 16),
          audience: created.audience,
          threshold: created.threshold,
          expires_at: created.expiresAtSeconds
        });

        json(res, 200, {
          challenge: created.challenge,
          audience: created.audience,
          threshold: created.threshold,
          expires_at: created.expiresAtSeconds
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/goanon/verify") {
        let body;

        try {
          body = await parseJsonBody(req);
        } catch (error) {
          json(res, 400, {
            verified: false,
            error: "invalid_request",
            detail: error.message
          });
          return;
        }

        const challenge = body.challenge || body.proof?.challenge;
        const proof = body.proof;

        if (!challenge || !proof || typeof proof !== "object") {
          logger.info("verification_rejected", {
            error: "missing_challenge_or_proof",
            challenge_present: Boolean(challenge),
            proof_present: Boolean(proof)
          });

          json(res, 400, {
            verified: false,
            error: "missing_challenge_or_proof"
          });
          return;
        }

        const reservation = challengeStore.beginVerification(challenge);

        if (!reservation.ok) {
          logger.info("verification_rejected", {
            error: reservation.code,
            challenge_ref: challengeRef(reservation.record),
            status: reservation.status
          });

          json(res, reservation.status, {
            verified: false,
            error: reservation.code
          });
          return;
        }

        const { record } = reservation;

        try {
          const result = await verifyAgeProofWithExistingSdk(proof, {
            expectedChallenge: challenge,
            expectedAudience: record.audience,
            minAge: record.threshold,
            allowDemo
          });

          challengeStore.completeVerification(record);

          logger.info("verification_succeeded", {
            challenge_ref: challengeRef(record),
            audience: record.audience,
            threshold: record.threshold,
            demo: Boolean(result?.demo),
            cryptographic: Boolean(result?.cryptographic)
          });

          json(res, 200, {
            verified: true,
            result: result || { ok: true },
            challenge_consumed: true
          });
          return;
        } catch (error) {
          challengeStore.failVerification(record);

          const errorCode = verifierErrorCode(error);

          logger.info("verification_failed", {
            challenge_ref: challengeRef(record),
            audience: record.audience,
            threshold: record.threshold,
            error: errorCode
          });

          json(res, 400, {
            verified: false,
            error: errorCode,
            detail: error.message
          });
          return;
        }
      }

      if (req.method === "GET" && url.pathname === "/goanon-verify.js") {
        const sdk = await readFile(SDK_PATH);
        text(res, 200, sdk, "text/javascript; charset=utf-8");
        return;
      }

      if (req.method === "GET") {
        const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
        const requested = resolve(join(PUBLIC_DIR, pathname));

        if (!requested.startsWith(PUBLIC_DIR)) {
          json(res, 403, { ok: false, error: "forbidden" });
          return;
        }

        try {
          const file = await readFile(requested);
          text(res, 200, file, mimeType(requested));
          return;
        } catch {
          json(res, 404, { ok: false, error: "not_found" });
          return;
        }
      }

      json(res, 405, { ok: false, error: "method_not_allowed" });
    } catch (error) {
      json(res, 500, {
        ok: false,
        error: "internal_error",
        detail: error.message
      });
    }
  });

  const cleanupTimer = setInterval(() => challengeStore.cleanExpired(), 60_000);
  cleanupTimer.unref?.();

  server.on("close", () => clearInterval(cleanupTimer));

  return {
    server,
    challengeStore,
    allowDemo
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { server, allowDemo } = createDemoServer();

  server.listen(DEFAULT_PORT, () => {
    console.log(`GoAnon Verify backend demo listening on http://localhost:${DEFAULT_PORT}`);
    console.log(`Demo proofs allowed: ${allowDemo ? "yes" : "no"}`);
    console.log("Set GOANON_VERIFY_ALLOW_DEMO=true for local extension demo proofs.");
  });
}
