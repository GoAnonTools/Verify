/**
 * goanon.pro — Popup Controller
 *
 * Handles all popup UI state: view navigation, issuer connection,
 * credential storage, settings, and the activity log.
 *
 * Architecture:
 *   - Pure event-driven state machine (no framework needed at this scale)
 *   - All credential ops go through chrome.runtime.sendMessage → background.ts
 *   - Local settings and activity log stored in chrome.storage.local
 */

import { ISSUERS, birthdateStringToCredential, type IssuerMeta } from "../src/issuers.js";
import { storeCredential } from "../src/engine.js";

// ─── State ────────────────────────────────────────────────────────────────────

interface AppState {
  view: ViewName;
  credential: StoredCredentialMeta | null;
  settings: Settings;
  activityLog: ActivityEntry[];
  selectedIssuer: IssuerMeta | null;
  pendingPassphrase: string | null;
  pendingManualCredential: any | null;
}

interface StoredCredentialMeta {
  issuer: string;
  stored_at: number;
  proof_count: number;
  last_used: number | null;
  privacy_grade?: "A" | "B" | "C" | "BLOCKED";
  offline_presentation?: boolean;
}

interface Settings {
  interceptEnabled: boolean;
  logEnabled: boolean;
  proofTtlSeconds: number;
  ageThreshold: number;
  requireStrongPrivacy: boolean;
}

interface ActivityEntry {
  site: string;
  timestamp: number;
  success: boolean;
}

type ViewName = "home" | "issuers" | "passphrase" | "waiting" | "manual" | "unlock" | "settings";

const state: AppState = {
  view: "home",
  credential: null,
  settings: {
    interceptEnabled: true,
    logEnabled: false,
    proofTtlSeconds: 300,
    ageThreshold: 18,
    requireStrongPrivacy: true,
  },
  activityLog: [],
  selectedIssuer: null,
  pendingPassphrase: null,
  pendingManualCredential: null,
};

// ─── View navigation ──────────────────────────────────────────────────────────

function navigate(view: ViewName) {
  document.querySelectorAll(".view").forEach(el => el.classList.remove("active"));
  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add("active");
  state.view = view;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadState();
  renderIssuers();
  renderHome();
  bindEvents();

  const params = new URLSearchParams(location.search);
  if (params.get("unlock") === "1") {
    const site = params.get("site") || "this website";
    const unlockSite = document.getElementById("unlock-site");
    if (unlockSite) unlockSite.textContent = `for ${site}`;
    navigate("unlock");
    return;
  }

  navigate("home");
}

async function loadState() {
  const data = await chrome.storage.local.get([
    "goanon_credential_meta",
    "goanon_settings_v1",
    "goanon_activity_log",
  ]);

  if (data.goanon_credential_meta) {
    state.credential = data.goanon_credential_meta;
  }
  if (data.goanon_settings_v1) {
    state.settings = { ...state.settings, ...data.goanon_settings_v1 };
  }
  if (data.goanon_activity_log) {
    state.activityLog = data.goanon_activity_log;
  }
}

async function saveSettings() {
  await chrome.storage.local.set({ goanon_settings_v1: state.settings });
}

async function saveActivity() {
  // Keep last 50 entries
  const trimmed = state.activityLog.slice(-50);
  await chrome.storage.local.set({ goanon_activity_log: trimmed });
}

// ─── Home view ────────────────────────────────────────────────────────────────

function renderHome() {
  const credCard = document.getElementById("credential-card")!;
  const emptyState = document.getElementById("empty-state")!;
  const addBtn = document.getElementById("btn-add-credential")!;
  const removeBtn = document.getElementById("btn-remove-credential")! as HTMLButtonElement;
  const statusPill = document.getElementById("status-pill")!;
  const statusText = document.getElementById("status-text")!;
  const activitySection = document.getElementById("activity-section")!;

  if (state.credential) {
    credCard.style.display = "block";
    emptyState.style.display = "none";
    addBtn.textContent = "Replace credential";
    removeBtn.style.display = "flex";

    statusPill.className = "status-pill active";
    statusText.textContent = "Active";

    // Fill credential card
    const issuerMeta = ISSUERS.find(i => i.id === state.credential!.issuer);
    const flag = document.getElementById("cred-flag")!;
    const name = document.getElementById("cred-name")!;
    const id = document.getElementById("cred-id")!;
    const stored = document.getElementById("cred-stored")!;
    const proofs = document.getElementById("cred-proofs")!;
    const last = document.getElementById("cred-last")!;

    flag.textContent = issuerMeta?.flag ?? "📄";
    name.textContent = issuerMeta?.name ?? state.credential.issuer;
    id.textContent = `${state.credential.issuer} · privacy ${state.credential.privacy_grade ?? "A"} · local proof`;
    stored.textContent = formatDate(state.credential.stored_at);
    proofs.textContent = String(state.credential.proof_count);
    last.textContent = state.credential.last_used
      ? formatRelative(state.credential.last_used)
      : "Never";

    // Activity log
    if (state.activityLog.length > 0 && state.settings.logEnabled) {
      activitySection.style.display = "block";
      renderActivityLog();
    } else {
      activitySection.style.display = "none";
    }
  } else {
    credCard.style.display = "none";
    emptyState.style.display = "flex";
    addBtn.textContent = "+ Add credential";
    removeBtn.style.display = "none";
    statusPill.className = "status-pill inactive";
    statusText.textContent = "No credential";
    activitySection.style.display = "none";
  }
}

function renderActivityLog() {
  const list = document.getElementById("activity-list")!;
  const recent = [...state.activityLog].reverse().slice(0, 6);
  list.innerHTML = recent.map(entry => `
    <div class="activity-item">
      <div class="activity-icon ${entry.success ? "" : "fail"}">${entry.success ? "✓" : "✗"}</div>
      <div class="activity-content">
        <div class="activity-site">${escapeHtml(entry.site)}</div>
        <div class="activity-time">${formatRelative(entry.timestamp)}</div>
      </div>
      <div class="activity-badge ${entry.success ? "" : "fail"}">${entry.success ? "Proved" : "Failed"}</div>
    </div>
  `).join("");
}

// ─── Issuer list ──────────────────────────────────────────────────────────────

function renderIssuers() {
  const list = document.getElementById("issuer-list")!;
  list.innerHTML = ISSUERS.map(issuer => `
    <div class="issuer-option issuer-${issuer.id}" data-issuer-id="${issuer.id}">
      <div class="issuer-flag-lg">${issuer.flag}</div>
      <div class="issuer-info">
        <div class="issuer-title">${escapeHtml(issuer.name)}</div>
        <div class="issuer-country">${escapeHtml(issuer.country)}</div>
        <div class="issuer-desc">${escapeHtml(issuer.description)}</div>
      </div>
      <div class="issuer-badge ${issuer.openAccess ? "open" : "id"}">
        ${issuer.badge ?? (issuer.openAccess ? "No ID" : "eID")}
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".issuer-option").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-issuer-id")!;
      const issuer = ISSUERS.find(i => i.id === id)!;
      selectIssuer(issuer);
    });
  });
}

function selectIssuer(issuer: IssuerMeta) {
  state.selectedIssuer = issuer;

  if (issuer.id === "manual") {
    navigate("manual");
    return;
  }

  if (issuer.id === "eudi") {
    showEudiExperimentalNotice();
    return;
  }

  navigate("passphrase");
}

// ─── Passphrase view ──────────────────────────────────────────────────────────

function bindPassphraseEvents() {
  const input1 = document.getElementById("input-passphrase") as HTMLInputElement;
  const input2 = document.getElementById("input-passphrase2") as HTMLInputElement;
  const btn = document.getElementById("btn-connect-issuer") as HTMLButtonElement;
  const fill = document.getElementById("strength-fill")!;
  const label = document.getElementById("strength-label")!;

  function update() {
    const v1 = input1.value;
    const v2 = input2.value;
    const strength = measureStrength(v1);

    fill.style.width = strength.pct + "%";
    fill.style.background = strength.color;
    label.textContent = strength.label;
    label.style.color = strength.color;

    btn.disabled = !(v1.length >= 8 && v1 === v2 && strength.score >= 2);
  }

  input1.addEventListener("input", update);
  input2.addEventListener("input", update);

  btn.addEventListener("click", async () => {
    const passphrase = input1.value;
    state.pendingPassphrase = passphrase;
    input1.value = "";
    input2.value = "";
    btn.disabled = true;
    await startIssuerConnection();
  });
}

function measureStrength(pw: string): { pct: number; score: number; color: string; label: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const map = [
    { pct: 0, color: "var(--text3)", label: "Enter a passphrase" },
    { pct: 20, color: "var(--red)", label: "Too weak" },
    { pct: 45, color: "var(--amber)", label: "Weak" },
    { pct: 65, color: "var(--amber)", label: "Fair" },
    { pct: 85, color: "var(--green)", label: "Good" },
    { pct: 100, color: "var(--green)", label: "Strong" },
  ];
  const entry = map[Math.min(score, 5)];
  return { ...entry, score };
}

function showEudiExperimentalNotice() {
  navigate("waiting");

  const title = document.getElementById("waiting-issuer-name")!;
  const waitTitle = document.getElementById("waiting-title")!;
  const waitDesc = document.getElementById("waiting-desc")!;
  const qrContainer = document.getElementById("qr-container")!;
  const spinnerContainer = document.getElementById("spinner-container")!;

  title.textContent = "EUDI-compatible wallet";
  waitTitle.textContent = "EUDI wallet connection";
  spinnerContainer.style.display = "none";
  qrContainer.style.display = "none";

  waitDesc.innerHTML = `
    <strong>Experimental connector not enabled yet.</strong><br><br>
    GoAnon is preparing this path for official EU wallet age proofs.
    It will only be enabled when privacy checks confirm:
    <br><br>
    • no issuer/government callback during normal proof use<br>
    • no exact birthdate shared with websites<br>
    • no stable wallet identifier shared<br>
    • no GoAnon Verify server or other GoAnon ecosystem server involved in proof use
    <br><br>
    For now, use Local test credential only to test the extension flow.
  `;
}

// ─── Issuer connection flow ───────────────────────────────────────────────────

async function startIssuerConnection() {
  const issuer = state.selectedIssuer!;

  if (issuer.id === "eudi") {
    showEudiExperimentalNotice();
    return;
  }

  navigate("waiting");

  const title = document.getElementById("waiting-issuer-name")!;
  const waitTitle = document.getElementById("waiting-title")!;
  const waitDesc = document.getElementById("waiting-desc")!;
  const qrContainer = document.getElementById("qr-container")!;
  const spinnerContainer = document.getElementById("spinner-container")!;

  title.textContent = `Connecting to ${issuer.name}…`;

  if (issuer.id === "manual") {
    spinnerContainer.style.display = "flex";
    qrContainer.style.display = "none";
    waitTitle.textContent = "Encrypting local test credential…";
    waitDesc.textContent = "This local test credential stays on this device and is not legal age verification.";
  } else {
    spinnerContainer.style.display = "flex";
    qrContainer.style.display = "none";
    waitTitle.textContent = "Opening identity provider…";
    waitDesc.textContent = `Complete verification in ${issuer.name}, then return here.`;
  }

  try {
    // Run the issuer-specific connection flow.
    // Manual/demo credentials are already prepared by the import screen, so no listener/network flow is needed.
    const credential = issuer.id === "manual" && state.pendingManualCredential
      ? state.pendingManualCredential
      : await issuer.connect();
    state.pendingManualCredential = null;

    // Store the credential encrypted with the user's passphrase
    const passphrase = state.pendingPassphrase!;
    state.pendingPassphrase = null;

    const stored = await storeCredential(credential, passphrase);

    // Save encrypted blob
    await chrome.storage.local.set({ goanon_credential_v1: stored });

    // Save metadata (no PII)
    const meta: StoredCredentialMeta = {
      issuer: credential.issuer,
      stored_at: Date.now(),
      proof_count: 0,
      last_used: null,
      privacy_grade: credential.privacy?.grade ?? "A",
      offline_presentation: credential.offline_presentation ?? true,
    };
    state.credential = meta;
    await chrome.storage.local.set({ goanon_credential_meta: meta });

    showToast("Credential stored securely ✓", "success");
    renderHome();
    navigate("home");
  } catch (err) {
    showToast(`Connection failed: ${(err as Error).message}`, "error");
    navigate("issuers");
  }
}

// ─── Manual import ────────────────────────────────────────────────────────────

function bindManualImportEvents() {
  const textarea = document.getElementById("manual-json-input") as HTMLTextAreaElement;
  const btn = document.getElementById("btn-manual-import") as HTMLButtonElement;
  const hint = document.getElementById("manual-parse-hint")!;

  textarea.addEventListener("input", () => {
    try {
      const parsed = JSON.parse(textarea.value.trim());
      if (!parsed.birthdate) throw new Error("Missing 'birthdate' field");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.birthdate)) throw new Error("birthdate must be YYYY-MM-DD");
      hint.textContent = `✓ Valid — birthdate: ${parsed.birthdate}, issuer: ${parsed.issuer ?? "custom"}`;
      hint.style.color = "var(--green)";
      btn.disabled = false;
    } catch (err) {
      hint.textContent = (err as Error).message;
      hint.style.color = "var(--red)";
      btn.disabled = true;
    }
  });

  btn.addEventListener("click", async () => {
    try {
      const parsed = JSON.parse(textarea.value.trim());
      const credential = await birthdateStringToCredential(
        parsed.birthdate,
        "demo"
      );
      state.pendingManualCredential = credential;
      state.selectedIssuer = ISSUERS.find(i => i.id === "manual")!;
      navigate("passphrase");
      showToast("Demo credential ready — choose a local passphrase", "success");
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  });
}

// ─── Settings view ────────────────────────────────────────────────────────────

function renderSettings() {
  const toggleIntercept = document.getElementById("toggle-intercept")!;
  const toggleLog = document.getElementById("toggle-log")!;
  const proofTtl = document.getElementById("proof-ttl") as HTMLSelectElement;
  const ageThreshold = document.getElementById("age-threshold") as HTMLSelectElement;

  toggleIntercept.className = `toggle ${state.settings.interceptEnabled ? "on" : ""}`;
  toggleLog.className = `toggle ${state.settings.logEnabled ? "on" : ""}`;
  proofTtl.value = String(state.settings.proofTtlSeconds);
  ageThreshold.value = String(state.settings.ageThreshold);
}

function bindSettingsEvents() {
  const toggleIntercept = document.getElementById("toggle-intercept")!;
  const toggleLog = document.getElementById("toggle-log")!;
  const proofTtl = document.getElementById("proof-ttl") as HTMLSelectElement;
  const ageThreshold = document.getElementById("age-threshold") as HTMLSelectElement;
  const exportBtn = document.getElementById("btn-export-log")!;
  const nukeBtn = document.getElementById("btn-nuke")!;

  toggleIntercept.addEventListener("click", async () => {
    state.settings.interceptEnabled = !state.settings.interceptEnabled;
    toggleIntercept.className = `toggle ${state.settings.interceptEnabled ? "on" : ""}`;
    await saveSettings();
    await chrome.runtime.sendMessage({
      action: "UPDATE_SETTINGS",
      settings: state.settings,
    });
  });

  toggleLog.addEventListener("click", async () => {
    state.settings.logEnabled = !state.settings.logEnabled;
    toggleLog.className = `toggle ${state.settings.logEnabled ? "on" : ""}`;
    await saveSettings();
  });

  proofTtl.addEventListener("change", async () => {
    state.settings.proofTtlSeconds = parseInt(proofTtl.value);
    await saveSettings();
  });

  ageThreshold.addEventListener("change", async () => {
    state.settings.ageThreshold = parseInt(ageThreshold.value);
    await saveSettings();
  });

  exportBtn.addEventListener("click", () => {
    const json = JSON.stringify(state.activityLog, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `goanon-activity-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  nukeBtn.addEventListener("click", async () => {
    if (!confirm("Remove your credential and clear all goanon data? This cannot be undone.")) return;
    await chrome.storage.local.clear();
    state.credential = null;
    state.activityLog = [];
    renderHome();
    showToast("All data cleared", "success");
    navigate("home");
  });
}

// ─── Global event bindings ────────────────────────────────────────────────────

function bindEvents() {
  // Back buttons
  document.querySelectorAll("[data-back]").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-back") as ViewName;
      navigate(target);
    });
  });

  // Home view
  document.getElementById("btn-add-credential")!.addEventListener("click", () => {
    navigate("issuers");
  });

  document.getElementById("btn-remove-credential")!.addEventListener("click", async () => {
    if (!confirm("Remove your stored credential?")) return;
    await chrome.runtime.sendMessage({ action: "CLEAR_CREDENTIAL" });
    state.credential = null;
    await chrome.storage.local.remove("goanon_credential_meta");
    renderHome();
    showToast("Credential removed", "success");
  });

  document.getElementById("btn-settings")!.addEventListener("click", () => {
    renderSettings();
    navigate("settings");
  });

  // Passphrase view
  bindPassphraseEvents();

  // Manual import view
  bindManualImportEvents();

  // Settings view
  bindSettingsEvents();

  // Unlock view (used when background requests passphrase)
  document.getElementById("btn-unlock-confirm")!.addEventListener("click", handleUnlockConfirm);
  document.getElementById("btn-unlock-cancel")!.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "PASSPHRASE_RESPONSE", passphrase: null });
    navigate("home");
  });
  document.getElementById("unlock-passphrase")!.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") handleUnlockConfirm();
  });

  // Listen for passphrase prompt from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "PROMPT_PASSPHRASE") {
      const unlockSite = document.getElementById("unlock-site")!;
      unlockSite.textContent = msg.site ? `for ${msg.site}` : "to generate age proof";
      navigate("unlock");
    }
  });
}

async function handleUnlockConfirm() {
  const input = document.getElementById("unlock-passphrase") as HTMLInputElement;
  const error = document.getElementById("unlock-error")!;
  const passphrase = input.value;
  input.value = "";
  error.style.display = "none";

  if (!passphrase) return;

  showProofOverlay();

  // Send passphrase to background to generate proof
  chrome.runtime.sendMessage(
    { action: "PASSPHRASE_RESPONSE", passphrase },
    async (response) => {
      hideProofOverlay();
      if (response?.success) {
        // Record activity
        if (state.settings.logEnabled) {
          state.activityLog.push({
            site: response.site ?? "unknown",
            timestamp: Date.now(),
            success: true,
          });
          await saveActivity();
        }
        // Update proof count
        if (state.credential) {
          state.credential.proof_count++;
          state.credential.last_used = Date.now();
          await chrome.storage.local.set({ goanon_credential_meta: state.credential });
        }
        showToast("Proof generated ✓", "success");
        navigate("home");
        renderHome();
      } else {
        error.style.display = "block";
        error.textContent = response?.error ?? "Wrong passphrase or proof failed";
      }
    }
  );

  // Animate proof steps
  await animateProofSteps();
}

// ─── QR rendering ─────────────────────────────────────────────────────────────

async function renderQR(url: string) {
  // Use a lightweight QR library bundled with the extension
  // @ts-ignore
  if (typeof QRCode !== "undefined") {
    const canvas = document.getElementById("qr-canvas") as HTMLCanvasElement;
    // @ts-ignore
    QRCode.toCanvas(canvas, url, { width: 160, margin: 1, color: { dark: "#000", light: "#fff" } });
  }
}

// ─── Proof overlay ────────────────────────────────────────────────────────────

function showProofOverlay() {
  document.getElementById("proof-overlay")!.classList.add("show");
  ["proof-step-1", "proof-step-2", "proof-step-3"].forEach(id => {
    const el = document.getElementById(id)!;
    el.className = "proof-step";
    el.textContent = el.textContent!.replace(/^[✓✗⬜] /, "⬜ ");
  });
}

function hideProofOverlay() {
  document.getElementById("proof-overlay")!.classList.remove("show");
}

async function animateProofSteps() {
  const steps = ["proof-step-1", "proof-step-2", "proof-step-3"];
  const labels = ["Decrypting credential", "Running circuit", "Proof ready"];
  for (let i = 0; i < steps.length; i++) {
    await sleep(i === 1 ? 1200 : 400); // Circuit step is the slow one
    const el = document.getElementById(steps[i])!;
    el.className = "proof-step done";
    el.textContent = `✓ ${labels[i]}`;
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg: string, type: "success" | "error") {
  const toast = document.getElementById("toast")!;
  toast.textContent = msg;
  toast.className = `${type} show`;
  setTimeout(() => { toast.classList.remove("show"); }, 3000);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatRelative(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

init().catch(console.error);
