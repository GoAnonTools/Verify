/**
 * GoAnon Verify browser SDK
 *
 * Cooperating websites include this file and call:
 *   const result = await GoAnonVerify.requestAgeProof({ minAge: 18 });
 *
 * The extension content script receives the request, asks the user for consent,
 * generates a local proof, and returns only the proof envelope.
 */
(function () {
  const PROTOCOL = "goanon.verify.v1";
  const SOURCE_PAGE = "goanon-page";
  const SOURCE_EXTENSION = "goanon-extension";
  const REQUEST = "GOANON_VERIFY_REQUEST";
  const RESPONSE = "GOANON_VERIFY_RESPONSE";
  const AVAILABLE = "GOANON_VERIFY_AVAILABLE";

  let extensionAvailable = false;
  const pending = new Map();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data.source !== SOURCE_EXTENSION) return;

    if (data.type === AVAILABLE && data.protocol === PROTOCOL) {
      extensionAvailable = true;
      window.dispatchEvent(new CustomEvent("goanon:available"));
      return;
    }

    if (data.type !== RESPONSE) return;
    const entry = pending.get(data.requestId);
    if (!entry) return;
    pending.delete(data.requestId);
    clearTimeout(entry.timer);

    if (data.ok) entry.resolve(data.proof);
    else entry.reject(new Error(data.error || "GoAnon proof request failed."));
  });

  function randomHex(bytes = 16) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
  }

  function requestAgeProof(options = {}) {
    const minAge = Number.isInteger(options.minAge) ? options.minAge : 18;
    if (minAge < 13 || minAge > 125) {
      return Promise.reject(new Error("minAge must be an integer between 13 and 125."));
    }

    const requestId = randomHex(16);
    const challenge = options.challenge || randomHex(32);
    const timeoutMs = options.timeoutMs || 120000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("GoAnon proof request timed out."));
      }, timeoutMs);

      pending.set(requestId, { resolve, reject, timer });

      window.postMessage({
        source: SOURCE_PAGE,
        type: REQUEST,
        protocol: PROTOCOL,
        requestId,
        minAge,
        challenge,
        reason: options.reason || "Access age-restricted content",
        relyingPartyName: options.relyingPartyName || document.title || location.hostname,
      }, location.origin);
    });
  }

  function isExtensionAvailable() {
    return extensionAvailable;
  }

  window.GoAnonVerify = Object.freeze({
    protocol: PROTOCOL,
    requestAgeProof,
    isExtensionAvailable,
  });
})();
