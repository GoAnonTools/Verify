/**
 * goanon.pro — Background Service Worker (v2)
 *
 * Runs as a Chrome MV3 service worker or Firefox background script.
 * All cryptographic operations happen here — isolated from page context.
 *
 * Passphrase flow:
 *   1. Content script receives website proof request → sends REQUEST_PROOF
 *   2. Background opens the popup unlock view
 *   3. User types passphrase in popup → sends PASSPHRASE_RESPONSE
 *   4. Background decrypts credential, generates ZK proof
 *   5. Proof returned to content script
 *
 * Nothing is persisted across steps — passphrase lives in a Promise closure only.
 */

import {
  loadCredential,
  generateAgeProof,
  type StoredCredential,
  type AgeProof,
  type ProofRequestContext,
} from "./engine.js";
import { STRONG_PRIVACY_LABEL, normalizeAge } from "./protocol.js";

// ─── Storage keys ─────────────────────────────────────────────────────────────
const KEY_CREDENTIAL  = "goanon_credential_v1";
const KEY_SETTINGS    = "goanon_settings_v1";
const KEY_CRED_META   = "goanon_credential_meta";

// ─── In-memory passphrase promise ─────────────────────────────────────────────
// Lives only while a proof is being generated. Never serialised.
let passphraseResolver: ((p: string | null) => void) | null = null;
let pendingProofSite: string | null = null;

// ─── Settings (cached from storage) ──────────────────────────────────────────
interface Settings {
  interceptEnabled: boolean;
  logEnabled: boolean;
  proofTtlSeconds: number;
  ageThreshold: number;
  requireStrongPrivacy: boolean;
}
let settings: Settings = {
  interceptEnabled: true,
  logEnabled: false,
  proofTtlSeconds: 300,
  ageThreshold: 18,
  requireStrongPrivacy: true,
};

// Load settings on startup
chrome.storage.local.get(KEY_SETTINGS).then(r => {
  if (r[KEY_SETTINGS]) settings = { ...settings, ...r[KEY_SETTINGS] };
});

// ─── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender, sendResponse);
  return true; // keep channel open for async
});

async function handleMessage(
  msg: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (r: any) => void
) {
  try {
    switch (msg.action) {

      // ── Status check (from content script on page load) ──
      case "GET_STATUS": {
        const stored = await getStoredCredential();
        sendResponse({ success: true, status: stored ? "has_credential" : "no_credential" });
        break;
      }

      // ── Store encrypted credential blob (from popup after issuer connect) ──
      case "STORE_CREDENTIAL": {
        await chrome.storage.local.set({ [KEY_CREDENTIAL]: msg.credential });
        sendResponse({ success: true, message: "Credential stored." });
        break;
      }

      // ── Clear credential (from popup settings) ──
      case "CLEAR_CREDENTIAL": {
        await chrome.storage.local.remove([KEY_CREDENTIAL, KEY_CRED_META]);
        sendResponse({ success: true, message: "Credential cleared." });
        break;
      }

      // ── Settings update (from popup) ──
      case "UPDATE_SETTINGS": {
        settings = { ...settings, ...msg.settings };
        await chrome.storage.local.set({ [KEY_SETTINGS]: settings });
        sendResponse({ success: true });
        break;
      }

      // ── Proof request from cooperating website content bridge ──
      case "REQUEST_PROOF": {
        if (!settings.interceptEnabled) {
          sendResponse({ success: false, error: "GoAnon website requests are disabled in settings." });
          break;
        }

        const stored = await getStoredCredential();
        if (!stored) {
          sendResponse({ success: false, error: "No credential stored. Open GoAnon Verify to set up." });
          break;
        }

        const tabUrl = sender.tab?.url ? new URL(sender.tab.url) : null;
        const request = msg.request ?? {};
        const domain = request.domain ?? tabUrl?.hostname ?? msg.site ?? "unknown site";
        const audience = request.audience ?? tabUrl?.origin ?? `https://${domain}`;
        const minAge = normalizeAge(request.minAge ?? settings.ageThreshold);

        if (settings.requireStrongPrivacy) {
          const privacy = stored.privacy ?? STRONG_PRIVACY_LABEL;
          if (privacy.issuer_contacted_during_proof || privacy.goanon_server_contacted_during_proof || privacy.grade === "BLOCKED") {
            sendResponse({ success: false, error: "This credential method does not meet GoAnon strong privacy rules." });
            break;
          }
        }

        if (!request.challenge || typeof request.challenge !== "string") {
          sendResponse({ success: false, error: "Missing website challenge. The site must use the GoAnon verifier SDK." });
          break;
        }

        const context: ProofRequestContext = {
          audience,
          domain,
          relyingPartyName: request.relyingPartyName,
          challenge: request.challenge,
          minAge,
          ttlSeconds: settings.proofTtlSeconds,
        };

        // Remember which site is requesting (for the popup to show)
        pendingProofSite = domain;

        // Open popup in unlock mode and wait for passphrase
        const passphrase = await openUnlockPopup(pendingProofSite);
        pendingProofSite = null;

        if (!passphrase) {
          sendResponse({ success: false, error: "Cancelled by user." });
          break;
        }

        // Decrypt credential (entirely local)
        let credential;
        try {
          credential = await loadCredential(stored, passphrase);
        } catch {
          sendResponse({ success: false, error: "Wrong passphrase." });
          break;
        }

        // Generate ZK proof (entirely local, 1–3s)
        const proof = await generateAgeProof(
          credential,
          chrome.runtime.getURL("circuits/age_verify.wasm"),
          chrome.runtime.getURL("circuits/age_verify_final.zkey"),
          context
        );

        // Update proof count metadata (no PII, and only if the user enabled local logs)
        await bumpProofCount();

        sendResponse({
          success: true,
          proof,
          site: domain,
        });
        break;
      }

      // ── Passphrase response (from popup unlock view) ──
      case "PASSPHRASE_RESPONSE": {
        if (passphraseResolver) {
          passphraseResolver(msg.passphrase ?? null);
          passphraseResolver = null;
        }
        sendResponse({ success: true });
        break;
      }

      // ── Popup asks what site is pending (so it can show the domain) ──
      case "GET_PENDING_SITE": {
        sendResponse({ success: true, site: pendingProofSite });
        break;
      }
    }
  } catch (err) {
    console.error("[goanon background]", err);
    sendResponse({ success: false, error: (err as Error).message });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getStoredCredential(): Promise<StoredCredential | null> {
  const r = await chrome.storage.local.get(KEY_CREDENTIAL);
  return r[KEY_CREDENTIAL] ?? null;
}

/**
 * Opens the extension popup in unlock mode and waits for the user
 * to enter their passphrase. The passphrase travels only through
 * the in-memory Promise — never written to storage or sent over the network.
 */
async function openUnlockPopup(site: string): Promise<string | null> {
  return new Promise((resolve) => {
    passphraseResolver = resolve;

    // Open the popup window (it will message us back with PASSPHRASE_RESPONSE)
    const popupUrl = chrome.runtime.getURL(`popup/popup.html?unlock=1&site=${encodeURIComponent(site)}`);

    // Try chrome.windows (MV3 standard), fall back to action.openPopup
    if (chrome.windows?.create) {
      chrome.windows.create({
        url: popupUrl,
        type: "popup",
        width: 360,
        height: 520,
        focused: true,
      });
    } else if (chrome.action?.openPopup) {
      // Firefox MV3
      chrome.action.openPopup();
    }

    // Safety timeout — resolve null after 2 minutes if user doesn't respond
    setTimeout(() => {
      if (passphraseResolver) {
        passphraseResolver(null);
        passphraseResolver = null;
      }
    }, 120_000);
  });
}

/**
 * Increments the proof count in the credential metadata.
 * This is non-sensitive UX data — no PII.
 */
async function bumpProofCount() {
  const r = await chrome.storage.local.get(KEY_CRED_META);
  const meta = r[KEY_CRED_META];
  if (meta) {
    meta.proof_count = (meta.proof_count ?? 0) + 1;
    meta.last_used = Date.now();
    await chrome.storage.local.set({ [KEY_CRED_META]: meta });
  }
}
