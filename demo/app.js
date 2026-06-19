const proveButton = document.getElementById("proveButton");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const errorEl = document.getElementById("error");
const jsonEl = document.getElementById("json");

const factIssuer = document.getElementById("factIssuer");
const factGrade = document.getElementById("factGrade");
const factIssuerContact = document.getElementById("factIssuerContact");

function setStatus(message) {
  statusEl.textContent = message;
}

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.add("visible");
}

function clearError() {
  errorEl.textContent = "";
  errorEl.classList.remove("visible");
}

function waitForGoAnonExtension(timeoutMs = 1800) {
  if (window.GoAnonVerify?.isExtensionAvailable?.()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("goanon:available", onAvailable);
      reject(new Error(
        "GoAnon extension was not detected on this page. Make sure the extension is loaded and reloaded in chrome://extensions."
      ));
    }, timeoutMs);

    function onAvailable() {
      clearTimeout(timer);
      resolve();
    }

    window.addEventListener("goanon:available", onAvailable, { once: true });
  });
}

function summarizeProof(proof) {
  const privacy = proof?.privacy || {};
  const issuerContacted = privacy.issuer_contacted_during_proof;

  factIssuer.textContent = proof?.issuer || "unknown";
  factGrade.textContent = privacy.grade || "unknown";
  factIssuerContact.textContent =
    issuerContacted === false ? "No" :
    issuerContacted === true ? "Yes" :
    "Unknown";

  jsonEl.textContent = JSON.stringify(proof, null, 2);
  resultEl.classList.add("visible");
}

proveButton.addEventListener("click", async () => {
  clearError();
  resultEl.classList.remove("visible");
  proveButton.disabled = true;

  try {
    setStatus("Checking GoAnon extension…");

    if (!window.GoAnonVerify) {
      throw new Error("GoAnon SDK did not load.");
    }

    await waitForGoAnonExtension();

    setStatus("Requesting local proof from the extension…");

    const proof = await window.GoAnonVerify.requestAgeProof({
      minAge: 18,
      minimumAge: 18,
      reason: "GoAnon Verify demo",
      purpose: "Prove age eligibility without revealing identity"
    });

    summarizeProof(proof);
    setStatus("Proof received.");
  } catch (err) {
    console.error(err);
    showError(err?.message || String(err));
    setStatus("Could not complete proof request.");
  } finally {
    proveButton.disabled = false;
  }
});
