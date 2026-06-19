import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  DEFAULT_ALLOWED_PROOF_TYPES,
  TRUST_ANCHOR_CONFIG_ERROR_CODES,
  TrustAnchorConfigError,
  loadTrustAnchorConfig,
  normalizeTrustAnchorConfig,
} from "../sdk/trust-anchor-config.mjs";

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "goanon-verify-trust-anchors-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function throwsWithCode(fn, code) {
  assert.throws(
    fn,
    (error) => {
      assert.ok(error instanceof TrustAnchorConfigError);
      assert.equal(error.name, "TrustAnchorConfigError");
      assert.equal(error.code, code);
      return true;
    }
  );
}

{
  const config = normalizeTrustAnchorConfig({
    trustAnchors: [
      "did:example:trusted-issuer",
      { did: "did:example:wallet-provider" },
    ],
    allowedProofTypes: [
      "cryptographic-wallet-presentation",
    ],
  });

  assert.deepEqual(config.trustAnchors, [
    "did:example:trusted-issuer",
    {
      did: "did:example:wallet-provider",
      id: "did:example:wallet-provider",
    },
  ]);

  assert.deepEqual(config.allowedProofTypes, [
    "cryptographic-wallet-presentation",
  ]);
}

{
  const config = normalizeTrustAnchorConfig({
    issuerAllowlist: [
      "did:example:trusted-issuer",
    ],
  });

  assert.deepEqual(config.trustAnchors, [
    "did:example:trusted-issuer",
  ]);

  assert.deepEqual(config.allowedProofTypes, [...DEFAULT_ALLOWED_PROOF_TYPES]);
}

throwsWithCode(
  () => normalizeTrustAnchorConfig(null),
  TRUST_ANCHOR_CONFIG_ERROR_CODES.CONFIG_NOT_OBJECT
);

throwsWithCode(
  () => normalizeTrustAnchorConfig({}),
  TRUST_ANCHOR_CONFIG_ERROR_CODES.TRUST_ANCHORS_MISSING
);

throwsWithCode(
  () => normalizeTrustAnchorConfig({ trustAnchors: [""] }),
  TRUST_ANCHOR_CONFIG_ERROR_CODES.TRUST_ANCHORS_INVALID
);

throwsWithCode(
  () => normalizeTrustAnchorConfig({ trustAnchors: [42] }),
  TRUST_ANCHOR_CONFIG_ERROR_CODES.TRUST_ANCHORS_INVALID
);

throwsWithCode(
  () => normalizeTrustAnchorConfig({ trustAnchors: [{ name: "missing-id" }] }),
  TRUST_ANCHOR_CONFIG_ERROR_CODES.TRUST_ANCHORS_INVALID
);

for (const blocked of ["manual", "local", "demo", "local-demo", "self-attested"]) {
  throwsWithCode(
    () => normalizeTrustAnchorConfig({ trustAnchors: [blocked] }),
    TRUST_ANCHOR_CONFIG_ERROR_CODES.TRUST_ANCHOR_BLOCKED
  );
}

{
  const config = normalizeTrustAnchorConfig(
    { trustAnchors: ["manual"] },
    { allowDemoTrustAnchors: true }
  );

  assert.deepEqual(config.trustAnchors, ["manual"]);
}

throwsWithCode(
  () => normalizeTrustAnchorConfig({
    trustAnchors: ["did:example:trusted-issuer"],
    allowedProofTypes: [],
  }),
  TRUST_ANCHOR_CONFIG_ERROR_CODES.ALLOWED_PROOF_TYPES_INVALID
);

throwsWithCode(
  () => normalizeTrustAnchorConfig({
    trustAnchors: ["did:example:trusted-issuer"],
    allowedProofTypes: [""],
  }),
  TRUST_ANCHOR_CONFIG_ERROR_CODES.ALLOWED_PROOF_TYPES_INVALID
);

await withTempDir(async (dir) => {
  const file = join(dir, "trust-anchors.json");

  await writeFile(file, JSON.stringify({
    trustAnchors: [
      "did:example:trusted-issuer",
    ],
    allowedProofTypes: [
      "cryptographic-wallet-presentation",
    ],
  }, null, 2));

  const config = await loadTrustAnchorConfig(file);

  assert.deepEqual(config, {
    trustAnchors: [
      "did:example:trusted-issuer",
    ],
    allowedProofTypes: [
      "cryptographic-wallet-presentation",
    ],
  });
});

console.log("trust-anchor config tests passed");
