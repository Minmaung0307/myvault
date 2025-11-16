// ===== CONFIG =====
const CLIENT_ID =
  "27254719227-e0rgbjkkn0j23v0t3ecd12dicqe0d4o4.apps.googleusercontent.com";
const API_KEY = "";
const SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid";

const META_FILE_NAME = "vault_meta.json";
const VAULT_FOLDER_NAME = "MyVault";

// ✅ အAuthorized user စာရင်း (၁၅ ယောက်ထိ)
const ALLOWED_USERS = [
  "honeymoe093@gmail.com",
  "minmaung0307@gmail.com",
  "panna07@gmail.com",
  "sue@randevoz.com",
  // ...
  "user15@gmail.com",
];

const USER_META_OVERRIDE = {};

const CATEGORY_CONFIG = {
  ids: { label: "IDs & Identity", icon: "🪪", color: "#facc15" },
  immigration: { label: "Immigration & Status", icon: "🛂", color: "#38bdf8" },
  legal: { label: "Legal Documents", icon: "⚖️", color: "#f97316" },
  tax: { label: "Tax Returns", icon: "📄", color: "#22c55e" },
  payment: { label: "Finance & Payments", icon: "💳", color: "#6366f1" },
  housing: { label: "Housing / Lease", icon: "🏠", color: "#a855f7" },
  vehicles: { label: "Vehicles & Driving", icon: "🚗", color: "#0ea5e9" },
  health: { label: "Health & Medical", icon: "🩺", color: "#10b981" },
  work: { label: "Work & Employment", icon: "💼", color: "#eab308" },
  education: {
    label: "Education & Certificates",
    icon: "🎓",
    color: "#ec4899",
  },
  business: { label: "Business & LLC", icon: "📑", color: "#22c55e" },
  membership: { label: "Memberships & Cards", icon: "🎫", color: "#f97316" },
  receipts: { label: "Receipts & Warranty", icon: "🧾", color: "#f59e0b" },
  photos: { label: "Photos & Albums", icon: "📷", color: "#ec4899" },

  // ဟောင်း data-compatible key: applications
  applications: { label: "Applications & Forms", icon: "🗂️", color: "#3b82f6" },

  other: { label: "Other", icon: "📁", color: "#9ca3af" },
};

// ===== STATE =====
let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;
let currentUserEmail = null;

let vaultFolderId = null;
let metadataFileId = null;
let metadata = [];
let activities = [];

const root = document.documentElement;

// DOM refs
const btnSignin = document.getElementById("btn-signin");
const btnSignout = document.getElementById("btn-signout");
const btnLock = document.getElementById("btn-lock");
const vaultPasswordInput = document.getElementById("vault-password");
const vaultPasswordStatus = document.getElementById("vault-password-status");
const uploadForm = document.getElementById("upload-form");
const uploadStatus = document.getElementById("upload-status");
const vaultListEl = document.getElementById("vault-list");
const searchInput = document.getElementById("search-input");
const filterCategory = document.getElementById("filter-category");
const albumRow = document.getElementById("album-row");
const albumInput = document.getElementById("file-album");
const activityList = document.getElementById("activity-list");
const dashContainer = document.getElementById("dashboard-cards");

const modal = document.getElementById("category-modal");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const modalClose = document.getElementById("modal-close");
const previewModal = document.getElementById("preview-modal");
const previewTitle = document.getElementById("preview-title");
const previewBody = document.getElementById("preview-body");
const previewClose = document.getElementById("preview-close");

const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const editClose = document.getElementById("edit-close");
const editId = document.getElementById("edit-id");
const editTitle = document.getElementById("edit-title");
const editCategory = document.getElementById("edit-category");
const editAlbum = document.getElementById("edit-album");
const editTags = document.getElementById("edit-tags");
const editDate = document.getElementById("edit-date");
const editStatus = document.getElementById("edit-status");

const btnExportMeta = document.getElementById("btn-export-meta");
const inputImportMeta = document.getElementById("input-import-meta");

// Theme / font
const themeSelect = document.getElementById("theme-select");
const fontSelect = document.getElementById("font-select");

function showToast(msg) {
  const t = document.getElementById("welcome-toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
}

function metaCacheKey() {
  if (currentUserEmail) {
    return "myvault_meta_cache_" + currentUserEmail.toLowerCase();
  }
  return "myvault_meta_cache_anon";
}

function getCategoryConf(key) {
  return CATEGORY_CONFIG[key] || CATEGORY_CONFIG.other;
}

// Date picker icon → open native date picker
const fileDateInput = document.getElementById("file-date");
const btnDatePicker = document.getElementById("btn-date-picker");

if (btnDatePicker && fileDateInput) {
  btnDatePicker.addEventListener("click", () => {
    if (typeof fileDateInput.showPicker === "function") {
      // Chrome, Edge, etc.
      fileDateInput.showPicker();
    } else {
      // Safari, Firefox → focus only
      fileDateInput.focus();
    }
  });
}

async function fetchUserInfo() {
  if (!accessToken) throw new Error("No access token");
  const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: "Bearer " + accessToken },
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error("Userinfo failed: " + t.slice(0, 200));
  }
  return resp.json();
}

// ----- Simple tab switching (Dashboard / Upload / Help / Dev ...) -----
const tabButtons = document.querySelectorAll(".tab-btn[data-tab]");
const tabPanels = document.querySelectorAll(".tab-panel");

function switchTab(name) {
  tabPanels.forEach((panel) => {
    const isActive = panel.id === `tab-${name}`;
    panel.classList.toggle("hidden", !isActive);
  });

  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === name;
    btn.classList.toggle("active", isActive);
  });
}

// Connect click events
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.dataset.tab;
    switchTab(name);
  });
});

// Default tab (dashboard ဆိုရင် dashboard / upload ဆိုရင် upload …)
// မင်းစိတ်ကြိုက်မှန်အောင် အောက်က name ကိုပြောင်းသုံး
switchTab("dashboard");

// ===== INIT THEME / FONT =====
(function initPreferences() {
  const t = localStorage.getItem("myvault_theme") || "dark";
  const f = localStorage.getItem("myvault_font") || "md";
  root.dataset.theme = t;
  root.dataset.font = f;
  themeSelect.value = t;
  fontSelect.value = f;
})();

themeSelect.addEventListener("change", () => {
  const v = themeSelect.value;
  root.dataset.theme = v;
  localStorage.setItem("myvault_theme", v);
});
fontSelect.addEventListener("change", () => {
  const v = fontSelect.value;
  root.dataset.font = v;
  localStorage.setItem("myvault_font", v);
});

// ===== GOOGLE API LOAD CALLBACKS =====
function gapiLoaded() {
  gapi.load("client", initGapiClient);
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: async (resp) => {
      if (resp.error) {
        console.error(resp);
        return;
      }
      accessToken = resp.access_token;

      // 🔐 Drive SDK ကို လက်ရှိ token နဲ့ sync
      syncGapiToken();

      try {
        const info = await fetchUserInfo();
        const email = (info.email || "").toLowerCase();

        // 🌟 allowlist စစ်
        if (!ALLOWED_USERS.map((e) => e.toLowerCase()).includes(email)) {
          alert("This MyVault is private. Your account is not allowed.");
          // token revoke + UI reset
          try {
            google.accounts.oauth2.revoke(accessToken, () => {
              console.log("Access revoked for", email);
            });
          } catch {}
          accessToken = null;
          toggleAuthButtons(false);
          return;
        }

        // ✅ allow ဖြစ်ရင်
        currentUserEmail = email;
        console.log("Signed in as", email);
        await onSignedIn();
      } catch (e) {
        console.error("Sign-in allowlist check failed", e);
        alert("Sign-in failed. Please contact admin.");
        accessToken = null;
        toggleAuthButtons(false);
      }
    },
  });
  gisInited = true;
  maybeEnableSignin();
}

async function initGapiClient() {
  try {
    await gapi.client.init({
      apiKey: API_KEY || undefined,
      discoveryDocs: [
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
      ],
    });
    gapiInited = true;
    maybeEnableSignin();
  } catch (e) {
    console.error("gapi init error", e);
  }
}

function maybeEnableSignin() {
  if (gapiInited && gisInited) {
    btnSignin.disabled = false;

    // Try silent sign-in if the user has already granted access before.
    if (tokenClient) {
      try {
        tokenClient.requestAccessToken({
          prompt: "",
          scope: SCOPES, // ✅ ဘယ်အချိန် request လုပ်လာလာ scope ပြည့်ဖြစ်အောင်
        });
      } catch (e) {
        console.warn("Silent sign-in failed (this is ok on first use)", e);
      }
    }
  }
}

// ===== AUTH =====
btnSignin.addEventListener("click", () => {
  if (!tokenClient) return;
  tokenClient.requestAccessToken({
    prompt: "consent",
    scope: SCOPES, // ✅ Drive + userinfo scope အပြည့်နဲ့ တဖန်တလဲတောင်း
  });
});

btnSignout.addEventListener("click", () => {
  if (!accessToken) return;
  google.accounts.oauth2.revoke(accessToken, () => {
    accessToken = null;
    currentUserEmail = null;
    vaultFolderId = null;
    metadataFileId = null;
    metadata = [];
    activities = [];

    // 🔄 Drive SDK token ကိုလည်း reset လုပ်
    try {
      if (window.gapi && gapi.client) {
        gapi.client.setToken(null);
      }
    } catch (e) {
      console.warn("Failed to clear gapi token", e);
    }

    const t = document.getElementById("welcome-toast");
    if (t) {
      t.textContent = "";
      t.classList.add("hidden");
      t.classList.remove("show");
    }

    renderVaultList();
    renderActivity();
    renderDashboard();
    toggleAuthButtons(false);
  });
});

function syncGapiToken() {
  try {
    if (window.gapi && gapi.client && accessToken) {
      gapi.client.setToken({ access_token: accessToken });
    }
  } catch (e) {
    console.warn("Failed to sync gapi token", e);
  }
}

function toggleAuthButtons(loggedIn) {
  if (loggedIn) {
    btnSignin.classList.add("hidden");
    btnSignout.classList.remove("hidden");
  } else {
    btnSignin.classList.remove("hidden");
    btnSignout.classList.add("hidden");
  }
}

async function onSignedIn() {
  syncGapiToken();

  toggleAuthButtons(true);
  uploadStatus.textContent = "";
  uploadStatus.className = "status";

  try {
    await ensureVaultFolder();
    await ensureMetadataFile();
    await loadMetadata();
    renderVaultList();
    renderActivity();
    renderDashboard();
    addActivity("login", "Signed in & vault loaded");

    // ✅ Login & vault အောင်မြင်ပြီးမှ Welcome ပြပါ
    if (currentUserEmail) {
      showToast(`You're welcome, ${currentUserEmail}!`);
    } else {
      showToast("Welcome back to MyVault!");
    }
  } catch (e) {
    console.error(e);

    // 🔁 Drive error ဖြစ်သွားရင် local cache ကို fallback လုပ်မယ်
    try {
      const cache = localStorage.getItem(metaCacheKey());
      if (cache) {
        const arr = JSON.parse(cache);
        if (Array.isArray(arr)) {
          metadata = arr;
          renderVaultList();
          renderActivity();
          renderDashboard();
          addActivity("login", "Loaded from local cache (Drive error)");
        }
      }
    } catch (err2) {
      console.warn("Failed to restore metadata from cache after error", err2);
    }

    uploadStatus.textContent = "Error initializing vault.";
    uploadStatus.classList.add("err");
  }
}

// ===== PASSWORD UX =====
btnLock.addEventListener("click", () => {
  const pw = vaultPasswordInput.value.trim();
  if (!pw) {
    vaultPasswordStatus.textContent = "Please enter a vault password.";
    vaultPasswordStatus.className = "status err";
    return;
  }
  vaultPasswordStatus.textContent = "Vault password set for this session.";
  vaultPasswordStatus.className = "status ok";
});

// ===== DRIVE HELPERS =====
function authHeaders() {
  return { Authorization: "Bearer " + accessToken };
}

function folderCacheKey() {
  if (currentUserEmail) {
    return "myvault_folder_" + currentUserEmail.toLowerCase();
  }
  return "myvault_folder_anon";
}

function metaIdCacheKey() {
  if (currentUserEmail) {
    return "myvault_meta_id_" + currentUserEmail.toLowerCase();
  }
  return "myvault_meta_id_anon";
}

async function ensureVaultFolder() {
  // 1) memory ထဲမှာ ရှိရင် direct use
  if (vaultFolderId) {
    devLog && devLog("Using in-memory vaultFolderId:", vaultFolderId);
    return;
  }

  // 2) localStorage (per-user) ထဲမှာရှိရင် အရင်အသုံးချ
  const cachedId = localStorage.getItem(folderCacheKey());
  if (cachedId) {
    vaultFolderId = cachedId;
    devLog && devLog("Using cached vaultFolderId:", vaultFolderId);
    return;
  }

  // 3) Drive ထဲက MyVault / My Vault folders အားလုံးရှာမယ်
  const q = `(name = 'MyVault' or name = 'My Vault') and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await gapi.client.drive.files.list({
    q,
    fields: "files(id,name,createdTime)",
  });

  const folders = res.result.files || [];

  // 3a) လုံးဝ folder မရှိရင် အသစ်တစ်ခု ဖန်တီး
  if (!folders.length) {
    const createRes = await gapi.client.drive.files.create({
      resource: {
        name: VAULT_FOLDER_NAME, // "MyVault"
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    vaultFolderId = createRes.result.id;
  } else if (folders.length === 1) {
    // 3b) တစ်ခုတည်းရှိရင် အဲဒီဟာနဲ့ ဆက်သုံး
    vaultFolderId = folders[0].id;
  } else {
    // 3c) နှစ်ခုကျော်ရှိရင် — vault_meta.json ပါတဲ့ folder ကို ဦးစားပေးရွေး
    let chosen = null;

    for (const f of folders) {
      try {
        const metaRes = await gapi.client.drive.files.list({
          q: `'${f.id}' in parents and name = '${META_FILE_NAME}' and trashed = false`,
          fields: "files(id,name,modifiedTime)",
        });
        if (metaRes.result.files && metaRes.result.files.length) {
          chosen = f;
          devLog && devLog("Found folder with existing metadata:", f.id, f.name);
          break;
        }
      } catch (e) {
        console.warn("Error checking meta in folder", f.id, e);
      }
    }

    // meta ပါတဲ့ folder မတွေ့ရင် fallback = ပထမတစ်ခု
    vaultFolderId = (chosen || folders[0]).id;
  }

  // 4) per-user cache ထဲသိမ်း
  try {
    localStorage.setItem(folderCacheKey(), vaultFolderId);
  } catch (e) {
    console.warn("Failed to cache vaultFolderId", e);
  }
}

async function ensureMetadataFile() {
  // 1) memory ထဲမှာရှိရင် မလုပ်တော့
  if (metadataFileId) return;

  // 2) cache ထဲက id ရှိရင် တကယ်ရှိ/မရှိ စစ်မယ်
  const cachedId = localStorage.getItem("myvault_meta_id");
  if (cachedId) {
    try {
      const check = await gapi.client.drive.files.get({
        fileId: cachedId,
        fields: "id, trashed",
      });
      if (check.result && check.result.id && !check.result.trashed) {
        metadataFileId = check.result.id;
        return;
      }
    } catch (e) {
      console.warn("Cached metadataFileId not valid, will recreate:", e);
    }
  }

  // 3) MyVault folder id မရှိသေးရင် အရင်သေချာလုပ်
  if (!vaultFolderId) {
    await ensureVaultFolder();
  }

  // 4) MyVault folder အောက်မှာ vault_meta.json ရှိ/မရှိ စစ်မယ်
  const listRes = await gapi.client.drive.files.list({
    q: `'${vaultFolderId}' in parents and name = '${META_FILE_NAME}' and trashed = false`,
    fields: "files(id,name,modifiedTime,size)",
    pageSize: 1,
  });

  if (listRes.result.files && listRes.result.files.length > 0) {
    // ရှိနေတဲ့ meta ကိုသုံး
    metadataFileId = listRes.result.files[0].id;
  } else {
    // 5) မရှိရင် MyVault folder ထဲမှာအသစ်ဖန်တီး
    const createRes = await gapi.client.drive.files.create({
      resource: {
        name: META_FILE_NAME,
        parents: [vaultFolderId],
        mimeType: "application/json",
      },
      fields: "id",
    });
    metadataFileId = createRes.result.id;

    // 6) ပထမဆုံး data = [] ကို Drive ထဲ media upload နဲ့ထည့်
    const initResp = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
        metadataFileId
      )}?uploadType=media`,
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + accessToken,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify([]),
      }
    );

    if (!initResp.ok) {
      const text = await initResp.text().catch(() => "");
      console.error(
        "init vault_meta.json failed",
        initResp.status,
        text.slice(0, 200)
      );
      throw new Error(
        `init vault_meta.json failed ${initResp.status}: ${text.slice(
          0,
          200
        )}`
      );
    }
  }

  // 7) cache ထဲမှာ meta id သိမ်း
  try {
    localStorage.setItem("myvault_meta_id", metadataFileId);
  } catch (e) {
    console.warn("Failed to cache metadataFileId", e);
  }
}

async function loadMetadata() {
  if (!metadataFileId) {
    metadata = [];
    return;
  }
  try {
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        metadataFileId
      )}?alt=media`,
      { headers: authHeaders() }
    );
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `loadMetadata failed ${resp.status}: ${text.slice(0, 200)}`
      );
    }
    const txt = await resp.text();
    const arr = JSON.parse(txt);
    if (Array.isArray(arr)) {
      metadata = arr;
      // ✅ cache is now per-user
      localStorage.setItem(metaCacheKey(), JSON.stringify(arr));
    } else {
      console.warn(
        "metadata JSON is not an array; keeping existing metadata in memory"
      );
    }
  } catch (e) {
    console.error("loadMetadata error; falling back to local cache if any", e);
    const cache = localStorage.getItem(metaCacheKey());
    if (cache) {
      try {
        metadata = JSON.parse(cache) || [];
      } catch {
        if (!Array.isArray(metadata)) metadata = [];
      }
    } else {
      if (!Array.isArray(metadata)) metadata = [];
    }
  }
}

async function saveMetadata() {
  if (!accessToken) {
    console.warn("saveMetadata: no accessToken, skipping Drive write.");
    return;
  }

  // meta file id မရှိရင် အရင်သေချာရှာ/ဖန်တီး
  if (!metadataFileId) {
    await ensureMetadataFile();
  }
  if (!metadataFileId) {
    console.error(
      "saveMetadata: still no metadataFileId after ensureMetadataFile"
    );
    return;
  }

  const json = JSON.stringify(metadata, null, 2);

  const resp = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      metadataFileId
    )}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: json,
    }
  );

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error(
      "saveMetadata Drive upload failed",
      resp.status,
      text.slice(0, 200)
    );
    throw new Error(
      `saveMetadata failed ${resp.status}: ${text.slice(0, 200)}`
    );
  }

  // local cache လည်း အနည်းငယ်သိမ်းထားလိုက်မယ် (optional)
  try {
    localStorage.setItem("myvault_meta_cache", json);
  } catch (e) {
    console.warn("Failed to cache metadata locally", e);
  }
}

function handleSignOut() {
  accessToken = null;
  currentUserEmail = null;
  metadata = [];
  metadataFileId = null;
  vaultFolderId = null;

  renderVaultList();
  renderDashboard();
  renderActivity();
  toggleAuthButtons(false);
}

// Prime metadata & UI from local cache (per-user cache only)
(function primeMetadataFromCache() {
  try {
    // ❗ ဟောင်း shared cache key ကို once ရှင်းထားမယ် (user1 → user2 leak မဖြစ်အောင်)
    localStorage.removeItem("myvault_meta_cache");

    const cache = localStorage.getItem(metaCacheKey());
    if (!cache) return;
    const arr = JSON.parse(cache);
    if (Array.isArray(arr)) {
      metadata = arr;
      renderVaultList();
      renderActivity();
      renderDashboard();
    }
  } catch (e) {
    console.warn("Failed to restore metadata cache", e);
  }
})();

function buildMultipartBody(meta, data, dataType) {
  const boundary = "-------vaultboundarymeta";
  let body = "";
  body += "--" + boundary + "\r\n";
  body += "Content-Type: application/json; charset=UTF-8\r\n\r\n";
  body += JSON.stringify(meta) + "\r\n";
  body += "--" + boundary + "\r\n";
  body += "Content-Type: " + dataType + "\r\n\r\n";
  return new Blob([body, data, "\r\n--" + boundary + "--"], {
    type: "multipart/related; boundary=" + boundary,
  });
}

async function uploadEncryptedFileToVault(encryptedBlob, originalName) {
  // 1) create metadata-only file
  const createRes = await gapi.client.drive.files.create({
    resource: {
      name: originalName + ".enc",
      parents: [vaultFolderId],
      mimeType: "application/octet-stream",
    },
    fields: "id",
  });
  const fileId = createRes.result.id;

  // 2) upload binary content via media upload (fetch)
  const resp = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
      fileId
    )}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/octet-stream",
      },
      body: encryptedBlob,
    }
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(
      `Media upload failed ${resp.status}: ${text.slice(0, 200)}`
    );
  }
  return fileId;
}

async function downloadFileBlob(fileId) {
  async function getRemoteFileMeta(fileId) {
    const res = await gapi.client.drive.files.get({
      fileId,
      fields: "id,name,size,mimeType,md5Checksum",
    });
    return res.result;
  }

  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    fileId
  )}?alt=media`;
  const resp = await fetch(url, { headers: authHeaders() });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    // Drive error ကို တိတိ ပြမယ် (signin/scope/tester 문제)
    throw new Error(
      `Drive download failed ${resp.status}: ${text?.slice(0, 200)}`
    );
  }

  const blob = await resp.blob();
  // AES-GCM tag သာ 16 bytes လောက်လိုတယ် => file အလွန်သေးမယ်ဆို "too small" ဖြစ်နိုင်
  if (!blob || blob.size < 32) {
    throw new Error(
      `Encrypted blob too small (${
        blob?.size || 0
      }B) — likely not the encrypted file.`
    );
  }
  return blob;
}

// ===== CRYPTO =====
function getOrCreateSalt() {
  let s = localStorage.getItem("myvault_salt");
  if (!s) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    s = bytesToBase64(bytes);
    localStorage.setItem("myvault_salt", s);
  }
  return s;
}

async function deriveKey(password, saltBase64) {
  const enc = new TextEncoder();
  const pwKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const saltBytes = base64ToBytes(saltBase64);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 200000,
      hash: "SHA-256",
    },
    pwKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptFileWithPassword(file, password) {
  const salt = getOrCreateSalt();
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await file.arrayBuffer();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buf);
  return {
    blob: new Blob([cipher], { type: "application/octet-stream" }),
    iv: bytesToBase64(iv),
    salt,
  };
}

async function decryptBlobWithPassword(blob, password, ivBase64, saltBase64) {
  const key = await deriveKey(password, saltBase64);
  const iv = base64ToBytes(ivBase64);
  const buf = await blob.arrayBuffer();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, buf);
  return new Blob([plain]);
}

function bytesToBase64(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ===== UPLOAD =====

// show album for photos
document.getElementById("file-category").addEventListener("change", (e) => {
  if (e.target.value === "photos") {
    albumRow.style.display = "flex";
  } else {
    albumRow.style.display = "none";
    albumInput.value = "";
  }
});

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  uploadStatus.textContent = "";
  uploadStatus.className = "status";

  if (!accessToken) {
    uploadStatus.textContent = "Please sign in with Google first.";
    uploadStatus.classList.add("err");
    return;
  }

  const password = vaultPasswordInput.value.trim();
  if (!password) {
    uploadStatus.textContent = "Enter your vault password.";
    uploadStatus.classList.add("err");
    return;
  }

  // 🔐 Vault folder + metadata file init (VERY IMPORTANT)
  try {
    await ensureVaultFolder();
    await ensureMetadataFile();
  } catch (err) {
    console.error("Vault init failed in upload handler", err);
    uploadStatus.textContent = "Vault init failed. Try sign out & sign in again.";
    uploadStatus.classList.add("err");
    return;
  }

  const fileEl = document.getElementById("file-input");
  const files = Array.from(fileEl.files || []);
  if (!files.length) {
    uploadStatus.textContent = "Select at least one file.";
    uploadStatus.classList.add("err");
    return;
  }

  const titleInput = document.getElementById("file-title").value.trim();
  const category = document.getElementById("file-category").value || "other";
  const tagsRaw = document.getElementById("file-tags").value.trim();
  const date = document.getElementById("file-date").value || null;
  const album = albumInput.value.trim() || null;
  const tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  let ok = 0;
  let fail = 0;

  for (const file of files) {
    try {
      uploadStatus.textContent = `Encrypting: ${file.name}...`;

      const { blob, iv, salt } = await encryptFileWithPassword(file, password);

      uploadStatus.textContent = `Uploading: ${file.name}...`;
      const fileId = await uploadEncryptedFileToVault(blob, file.name);

      const createdAt = new Date().toISOString();
      const entry = {
        id: fileId,
        title: titleInput || file.name, // title ထည့်ထားရင် shared title, မထည့်ရင် ဖိုင်နာမည်
        category,
        tags,
        album,
        date,
        originalName: file.name,
        size: file.size,
        mimeType: file.type,
        iv,
        salt,
        createdAt,
        logs: [{ type: "upload", ts: createdAt }],
      };

      // ✅ ဖိုင်တစ်ခုချင်းစီ metadata ထဲ push
      metadata.push(entry);
      ok++;
    } catch (err) {
      console.error("Upload failed for", file.name, err);
      fail++;
    }
  }

  // ✅ loop ပြီးမှ metadata ကို တစ်ခါတည်း Drive မှာ save
  try {
    await saveMetadata();
  } catch (err) {
    console.error("saveMetadata failed after multi-upload", err);
  }

  uploadStatus.textContent = `Done: ${ok} uploaded, ${fail} failed.`;
  if (ok > 0 && fail === 0) {
    uploadStatus.classList.add("ok");
  } else if (fail > 0) {
    uploadStatus.classList.add("err");
  }

  fileEl.value = "";
  renderVaultList();
  renderDashboard();
  addActivity("upload", `${ok} file(s)`);
  renderActivity();
});

// ===== LIST & SEARCH =====
searchInput.addEventListener("input", renderVaultList);
filterCategory.addEventListener("change", renderVaultList);

function renderVaultList() {
  vaultListEl.innerHTML = "";

  if (!accessToken) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Sign in with Google to view your vault items.";
    vaultListEl.appendChild(p);
    return;
  }

  if (!metadata.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No items yet. Upload from the left panel.";
    vaultListEl.appendChild(p);
    return;
  }

  const q = (searchInput.value || "").toLowerCase();
  const cat = filterCategory.value || "";

  const filtered = metadata.filter((m) => {
    if (cat && m.category !== cat) return false;
    const hay = [
      m.title,
      m.originalName,
      m.category,
      (m.tags || []).join(" "),
      m.album || "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  filtered
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .forEach((m) => {
      const item = document.createElement("div");
      item.className = "vault-item";

      const left = document.createElement("div");
      const conf = CATEGORY_CONFIG[m.category] || CATEGORY_CONFIG.other;

      const titleRow = document.createElement("div");
      titleRow.className = "vault-title";

      const catSpan = document.createElement("span");
      catSpan.className = "cat-pill";
      catSpan.style.borderColor = conf.color;
      catSpan.style.color = conf.color;
      catSpan.textContent = `${conf.icon} ${conf.label}`;
      titleRow.appendChild(catSpan);

      const tSpan = document.createElement("span");
      tSpan.textContent = " " + (m.title || m.originalName);
      titleRow.appendChild(tSpan);

      const metaEl = document.createElement("div");
      metaEl.className = "vault-meta";
      metaEl.textContent =
        (m.date || m.createdAt?.slice(0, 10) || "") + " • " + humanSize(m.size);
      if (m.album) {
        const alb = document.createElement("span");
        alb.className = "album-label";
        alb.textContent = "Album: " + m.album;
        metaEl.appendChild(alb);
      }

      left.appendChild(titleRow);
      left.appendChild(metaEl);

      const tagsEl = document.createElement("div");
      if (m.tags?.length) {
        m.tags.forEach((t) => {
          const span = document.createElement("span");
          span.className = "tag";
          span.textContent = t;
          tagsEl.appendChild(span);
        });
      }

      const actions = document.createElement("div");
      actions.style.display = "flex";
      actions.style.gap = "4px";

      // Preview button
      const btnPreview = document.createElement("button");
      btnPreview.className = "btn small";
      btnPreview.textContent = "Preview";
      btnPreview.addEventListener("click", () => handlePreview(m));
      actions.appendChild(btnPreview);

      // Download button
      const btnDownload = document.createElement("button");
      btnDownload.className = "btn small";
      btnDownload.textContent = "Download";
      btnDownload.addEventListener("click", () => handleDownload(m));
      actions.appendChild(btnDownload);

      // Edit button
      const btnEdit = document.createElement("button");
      btnEdit.className = "btn small ghost";
      btnEdit.textContent = "Edit";
      btnEdit.addEventListener("click", () => openEditModal(m));
      actions.appendChild(btnEdit);

      // 🔴 NEW: Delete button (encrypted copy only)
      const btnDelete = document.createElement("button");
      btnDelete.className = "btn small danger";
      btnDelete.textContent = "Delete";
      btnDelete.addEventListener("click", () => handleDelete(m));
      actions.appendChild(btnDelete);
      // 🔴 NEW END

      item.appendChild(left);
      item.appendChild(tagsEl);
      item.appendChild(actions);

      vaultListEl.appendChild(item);
    });
}

// ===== DELETE ENCRYPTED FILE FROM MYVAULT =====
async function handleDelete(entry) {
  if (!accessToken) {
    alert("Please sign in with Google first.");
    return;
  }

  const id = entry.id;
  if (!id) {
    alert("Missing file id.");
    return;
  }

  const idx = metadata.findIndex((m) => m.id === id);
  if (idx === -1) {
    alert("Item not found in metadata.");
    return;
  }

  const m = metadata[idx];

  const confirmMsg =
    `Delete this encrypted file from MyVault?\n\n` +
    `Title: ${m.title || m.originalName || ""}\n` +
    `Category: ${m.category || ""}\n\n` +
    `Only the ENCRYPTED COPY stored in your MyVault folder on Google Drive\n` +
    `will be deleted. Your original file on your device will NOT be touched.`;

  if (!window.confirm(confirmMsg)) {
    return;
  }

  try {
    // 1) Google Drive ထဲက encrypted file ကို ဖျက်မယ်
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: authHeaders(), // Authorization: Bearer accessToken
      }
    );

    // file မတွေ့ရင် (404) ကိုလည်း OK လို ခတ်ပေးလိုက်တယ်
    if (!resp.ok && resp.status !== 404) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `Drive delete failed ${resp.status}: ${text.slice(0, 200)}`
      );
    }

    // 2) metadata ထဲက entry ကို ဖျက်မယ်
    metadata.splice(idx, 1);

    // 3) vault_meta.json + localStorage cache ကို update လုပ်မယ်
    await saveMetadata();

    // 4) UI refresh
    renderVaultList();
    if (typeof renderDashboard === "function") renderDashboard();
    if (typeof addActivity === "function") {
      addActivity("delete", m.title || m.originalName || id);
    }
    if (typeof renderActivity === "function") renderActivity();

    alert("Encrypted file deleted from MyVault.");
  } catch (e) {
    console.error("Delete failed", e);
    alert("Delete failed: " + (e.message || e));
  }
}

function humanSize(bytes = 0) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let val = bytes;
  let iIdx = 0;
  while (val > 1024 && iIdx < units.length - 1) {
    val /= 1024;
    iIdx++;
  }
  return val.toFixed(1) + " " + units[iIdx];
}

function validateMetaForDecrypt(m) {
  if (!m.iv || !m.salt) {
    throw new Error(
      "Missing iv/salt in metadata (old item or corrupted). Re-upload needed."
    );
  }
  // iv (base64) -> 12 bytes ဖြစ်ရမယ်
  const ivBytes = base64ToBytes(m.iv);
  if (ivBytes.length !== 12) {
    throw new Error(`Invalid IV length: ${ivBytes.length}.`);
  }
}

// ===== DOWNLOAD & LOG =====
async function handleDownload(m) {
  uploadStatus.textContent = "";
  uploadStatus.className = "status";

  const password = vaultPasswordInput.value.trim();
  if (!password) {
    uploadStatus.textContent = "Enter your vault password first.";
    uploadStatus.classList.add("err");
    return;
  }

  try {
    uploadStatus.textContent = "Downloading encrypted file...";
    validateMetaForDecrypt(m);
    const encBlob = await downloadFileBlob(m.id);

    uploadStatus.textContent = "Decrypting...";
    const plainBlob = await decryptBlobWithPassword(
      encBlob,
      password,
      m.iv,
      m.salt
    );

    const url = URL.createObjectURL(plainBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = m.originalName || "myvault_file";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    uploadStatus.textContent = "File decrypted and downloaded.";
    uploadStatus.classList.add("ok");

    const ts = new Date().toISOString();
    m.logs = m.logs || [];
    m.logs.push({ type: "decrypt", ts });
    await saveMetadata();
    addActivity("decrypt", m.title || m.originalName);
    renderActivity();
  } catch (e) {
    console.error(e);
    const msg = String(e?.message || e);
    if (msg.includes("Drive download failed")) {
      uploadStatus.textContent =
        "Can't fetch from Drive (signin/scope/tester/origin). " + msg;
    } else if (msg.includes("Missing iv/salt")) {
      uploadStatus.textContent =
        "Old/corrupted entry (no IV/SALT). Please re-upload this file.";
    } else if (msg.includes("Invalid IV length")) {
      uploadStatus.textContent = "Metadata IV invalid. Re-upload this file.";
    } else if (msg.includes("too small")) {
      uploadStatus.textContent =
        "Downloaded data isn't the encrypted file (or password wrong).";
    } else {
      uploadStatus.textContent =
        "Decrypt failed. Wrong password or corrupted file.";
    }
    uploadStatus.classList.add("err");
  }
}

async function handlePreview(m) {
  const password = vaultPasswordInput.value.trim();
  if (!password) {
    vaultPasswordStatus.textContent = "Enter your vault password to preview.";
    vaultPasswordStatus.className = "status err";
    vaultPasswordInput.focus();
    return;
  }

  try {
    uploadStatus.textContent = "Preparing preview...";
    uploadStatus.className = "status";

    validateMetaForDecrypt(m);

    // 1) encrypted blob ကို Drive ကနေ ယူ
    const encBlob = await downloadFileBlob(m.id);

    // 2) decrypt with password  → plain blob
    const plainBlob = await decryptBlobWithPassword(
      encBlob,
      password,
      m.iv,
      m.salt
    );

    // 3) မည်သည့် mime type နဲ့ ပြမလဲ ဆုံးဖြတ်
    let mime = m.mimeType || "";
    const name = (m.originalName || "").toLowerCase();

    if (!mime || mime === "application/octet-stream") {
      if (name.endsWith(".pdf")) {
        mime = "application/pdf";
      } else if (
        name.endsWith(".png") ||
        name.endsWith(".jpg") ||
        name.endsWith(".jpeg") ||
        name.endsWith(".gif") ||
        name.endsWith(".webp")
      ) {
        // image သွားမယ်
        if (name.endsWith(".png")) mime = "image/png";
        else if (name.endsWith(".gif")) mime = "image/gif";
        else if (name.endsWith(".webp")) mime = "image/webp";
        else mime = "image/jpeg";
      } else {
        mime = "application/octet-stream";
      }
    }

    // 4) same bytes ကို type label သတ်မှတ်အောင် slice ဖြတ် (bytes မပြောင်း)
    const typedBlob = plainBlob.slice(0, plainBlob.size, mime);
    const url = URL.createObjectURL(typedBlob);

    // 5) modal UI clear & title
    previewTitle.textContent = m.title || m.originalName || "Preview";
    previewBody.innerHTML = "";

    if (mime.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = m.originalName || "image";
      img.className = "preview-image";
      previewBody.appendChild(img);
    } else if (mime === "application/pdf") {
      const emb = document.createElement("embed");
      emb.src = url;
      emb.type = "application/pdf";
      emb.className = "preview-pdf";
      previewBody.appendChild(emb);
    } else {
      // PDF/IMAGE မဟုတ်ရင် → message ပေး
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent =
        "This file type is best viewed after Download (not in inline preview).";
      previewBody.appendChild(p);
    }

    previewModal.classList.remove("hidden");
    uploadStatus.textContent = "";
  } catch (e) {
    console.error(e);
    const msg = String(e?.message || e);

    if (msg.includes("Drive download failed")) {
      uploadStatus.textContent =
        "Can't fetch from Drive (signin/scope/tester/origin). " + msg;
    } else if (msg.includes("Missing iv/salt")) {
      uploadStatus.textContent =
        "Old/corrupted entry (no IV/SALT). Please re-upload this file.";
    } else if (msg.includes("Invalid IV length")) {
      uploadStatus.textContent = "Metadata IV invalid. Re-upload this file.";
    } else if (msg.includes("too small")) {
      uploadStatus.textContent =
        "Downloaded data isn't the encrypted file (or password wrong).";
    } else {
      uploadStatus.textContent =
        "Decrypt failed. Wrong password or corrupted file.";
    }

    uploadStatus.className = "status err";
    previewModal.classList.add("hidden");
  }
}

previewClose.addEventListener("click", closePreview);
previewModal.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) closePreview();
});

function closePreview() {
  previewModal.classList.add("hidden");
  // revoke all object URLs to avoid leaks
  const embeds = previewBody.querySelectorAll("img,embed,iframe");
  embeds.forEach((el) => {
    if (el.src?.startsWith("blob:")) URL.revokeObjectURL(el.src);
  });
  previewBody.innerHTML = "";
}

function openEditModal(m) {
  editStatus.textContent = "";
  editId.value = m.id;
  editTitle.value = m.title || m.originalName || "";
  editCategory.value = m.category || "other";
  editAlbum.value = m.album || "";
  editTags.value = (m.tags || []).join(", ");
  editDate.value = m.date || (m.createdAt ? m.createdAt.slice(0, 10) : "");
  editModal.classList.remove("hidden");
}

editClose.addEventListener("click", () => {
  editModal.classList.add("hidden");
});

editModal.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) {
    editModal.classList.add("hidden");
  }
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  editStatus.textContent = "";
  editStatus.className = "status";

  const id = editId.value;
  const found = metadata.find((x) => x.id === id);
  if (!found) {
    editStatus.textContent = "Item not found.";
    editStatus.classList.add("err");
    return;
  }

  found.title = editTitle.value.trim() || found.title;
  found.category = editCategory.value || found.category || "other";
  found.album = editAlbum.value.trim() || null;
  const tagsRaw = editTags.value.trim();
  found.tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  found.date = editDate.value || found.date || null;

  try {
    await saveMetadata();
    renderVaultList();
    renderDashboard();
    editStatus.textContent = "Saved.";
    editStatus.classList.add("ok");
    setTimeout(() => {
      editModal.classList.add("hidden");
    }, 400);
  } catch (err) {
    console.error(err);
    editStatus.textContent = "Save failed.";
    editStatus.classList.add("err");
  }
});

async function changeVaultPassword(oldPw, newPw) {
  if (!accessToken) throw new Error("Sign in first.");
  if (!oldPw || !newPw) throw new Error("Passwords required.");

  const total = metadata.length;
  let ok = 0;
  let fail = 0;

  for (const m of metadata) {
    try {
      validateMetaForDecrypt(m);

      // 1) download old encrypted blob
      const encBlob = await downloadFileBlob(m.id);

      // 2) decrypt with OLD password
      const plain = await decryptBlobWithPassword(encBlob, oldPw, m.iv, m.salt);

      // 3) encrypt with NEW password
      const {
        blob: newEnc,
        iv: newIv,
        salt: newSalt,
      } = await encryptFileWithPassword(
        new File([plain], m.originalName, {
          type: m.mimeType || "application/octet-stream",
        }),
        newPw
      );

      // 4) replace Drive file content via media upload
      const resp = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(
          m.id
        )}?uploadType=media`,
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/octet-stream",
          },
          body: newEnc,
        }
      );
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(
          `Re-encrypt upload failed ${resp.status}: ${text.slice(0, 200)}`
        );
      }

      // 5) optional sanity check
      try {
        const remote = await getRemoteFileMeta(m.id);
        if (!remote.size || Number(remote.size) < 32) {
          throw new Error(
            `Remote encrypted file looks too small after rekey (${remote.size}B).`
          );
        }
      } catch (err) {
        console.warn("getRemoteFileMeta failed after rekey", err);
      }

      // 6) update metadata (iv/salt)
      m.iv = newIv;
      m.salt = newSalt;
      ok++;
    } catch (err) {
      console.error("re-encrypt failed for", m.title || m.originalName, err);
      fail++;
    }
  }

  await saveMetadata();
  return { ok, fail, total };
}

// ===== ACTIVITY LOG =====
function addActivity(type, title) {
  const ts = new Date().toISOString();
  activities.unshift({ type, title, ts });
  if (activities.length > 30) activities.pop();
}
function renderActivity() {
  activityList.innerHTML = "";
  if (!activities.length) {
    const li = document.createElement("li");
    li.textContent = "No recent activity.";
    activityList.appendChild(li);
    return;
  }
  activities.forEach((a) => {
    const li = document.createElement("li");
    const label =
      a.type === "upload"
        ? "Uploaded"
        : a.type === "decrypt"
        ? "Decrypted"
        : a.type === "login"
        ? "Login"
        : a.type;
    li.textContent = `${label}: ${a.title || ""} (${a.ts
      .slice(0, 19)
      .replace("T", " ")})`;
    activityList.appendChild(li);
  });
}

// ===== DASHBOARD CARDS =====
function renderDashboard() {
  dashContainer.innerHTML = "";

  if (!accessToken) {
    // show static cards 0
    Object.entries(CATEGORY_CONFIG).forEach(([key, conf]) => {
      const card = makeDashCard(conf, 0, key);
      dashContainer.appendChild(card);
    });
    return;
  }

  const counts = {};
  Object.keys(CATEGORY_CONFIG).forEach((k) => (counts[k] = 0));
  metadata.forEach((m) => {
    const c = m.category || "other";
    if (!counts[c]) counts[c] = 0;
    counts[c]++;
  });

  Object.entries(CATEGORY_CONFIG).forEach(([key, conf]) => {
    const card = makeDashCard(conf, counts[key] || 0, key);
    dashContainer.appendChild(card);
  });

  // const wrap = document.getElementById("vault-categories");
  // if (!wrap) return;

  // wrap.innerHTML = "";

  // const cats = Object.keys(CATEGORY_CONFIG);

  // cats.forEach(cat => {
  //   const conf = CATEGORY_CONFIG[cat];
  //   const count = metadata.filter(m => m.category === cat).length;

  //   const card = document.createElement("div");
  //   card.className = "vault-cat-card";
  //   card.onclick = () => {
  //     filterCategory.value = cat;
  //     switchTab("vault");
  //     renderVaultList();
  //   };

  //   card.innerHTML = `
  //     <div class="vault-cat-icon">${conf.icon}</div>
  //     <div class="vault-cat-title">${conf.label}</div>
  //     <div class="vault-cat-count">${count} item${count !== 1 ? "s" : ""}</div>
  //   `;

  //   wrap.appendChild(card);
  // });
}

function makeDashCard(conf, count, categoryKey) {
  const card = document.createElement("div");
  card.className = "dash-card";
  card.style.borderColor = conf.color;

  const title = document.createElement("div");
  title.className = "dash-title";

  // 🔹 icon (big)
  const iconDiv = document.createElement("div");
  iconDiv.className = "dash-icon";
  iconDiv.textContent = conf.icon;

  // 🔹 label (under icon)
  const nameDiv = document.createElement("div");
  nameDiv.className = "dash-name";
  nameDiv.textContent = conf.label;

  title.appendChild(iconDiv);
  title.appendChild(nameDiv);

  const label = document.createElement("div");
  label.className = "dash-label";
  label.textContent = "Secured items";

  const cnt = document.createElement("div");
  cnt.className = "dash-count";
  cnt.textContent = `${count} item${count === 1 ? "" : "s"}`;

  card.appendChild(title);
  card.appendChild(label);
  card.appendChild(cnt);

  card.addEventListener("click", () => {
    openCategoryModal(categoryKey, conf);
  });

  return card;
}

// ===== CATEGORY MODAL (Password-gated view) =====
function openCategoryModal(categoryKey, conf) {
  if (!accessToken) {
    alert("Please sign in first.");
    return;
  }
  const pw = vaultPasswordInput.value.trim();
  if (!pw) {
    vaultPasswordStatus.textContent =
      "Enter your vault password to view this category.";
    vaultPasswordStatus.className = "status err";
    vaultPasswordInput.focus();
    return;
  }

  const items = metadata.filter((m) => m.category === categoryKey);
  modalTitle.textContent = `${conf.icon} ${conf.label} — ${items.length} item(s)`;
  modalBody.innerHTML = "";

  if (!items.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No items in this category yet.";
    modalBody.appendChild(p);
  } else {
    items
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .forEach((m) => {
        const row = document.createElement("div");
        row.className = "modal-item";

        const left = document.createElement("div");
        const t = document.createElement("div");
        t.className = "vault-title";
        t.textContent = m.title || m.originalName;
        const meta = document.createElement("div");
        meta.className = "vault-meta";
        meta.textContent =
          (m.date || m.createdAt?.slice(0, 10) || "") +
          " • " +
          humanSize(m.size);
        if (m.album) {
          const alb = document.createElement("span");
          alb.className = "album-label";
          alb.textContent = "Album: " + m.album;
          meta.appendChild(alb);
        }
        left.appendChild(t);
        left.appendChild(meta);

        const tagsEl = document.createElement("div");
        if (m.tags?.length) {
          m.tags.forEach((tg) => {
            const span = document.createElement("span");
            span.className = "tag";
            span.textContent = tg;
            tagsEl.appendChild(span);
          });
        }

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "4px";

        const btnPrev = document.createElement("button");
        btnPrev.className = "btn small";
        btnPrev.textContent = "Preview";
        btnPrev.addEventListener("click", () => handlePreview(m));
        actions.appendChild(btnPrev);

        const btnDown = document.createElement("button");
        btnDown.className = "btn small";
        btnDown.textContent = "Download";
        btnDown.addEventListener("click", () => handleDownload(m));
        actions.appendChild(btnDown);

        const btnEd = document.createElement("button");
        btnEd.className = "btn small ghost";
        btnEd.textContent = "Edit";
        btnEd.addEventListener("click", () => openEditModal(m));
        actions.appendChild(btnEd);

        row.appendChild(left);
        row.appendChild(tagsEl);
        row.appendChild(actions);

        modalBody.appendChild(row);
      });
  }

  modal.classList.remove("hidden");
}

// ========== DEV PANEL (Admin only) ==========

let MV_DEBUG = false;

// debug log helper
function devLog(...args) {
  if (MV_DEBUG) {
    console.log("[MyVault DEV]", ...args);
  }
}

const devDebugToggle = document.getElementById("dev-debug-toggle");
const devMetaArea = document.getElementById("dev-meta-json");
const devCacheArea = document.getElementById("dev-cache-json");

if (devDebugToggle) {
  devDebugToggle.addEventListener("change", (e) => {
    MV_DEBUG = e.target.checked;
    devLog("Debug mode:", MV_DEBUG);
  });
}

// helper: render metadata[] into textarea
function refreshDevMetadataView() {
  if (!devMetaArea) return;
  try {
    devMetaArea.value = JSON.stringify(metadata || [], null, 2);
  } catch (err) {
    devMetaArea.value =
      "Error while stringifying metadata: " + (err.message || err);
  }
}

// Dev buttons
const btnDumpMeta = document.getElementById("dev-btn-dump-meta");
const btnDumpCache = document.getElementById("dev-btn-dump-cache");
const btnReloadMeta = document.getElementById("dev-btn-reload-meta");
const btnClearCache = document.getElementById("dev-btn-clear-cache");

btnDumpMeta?.addEventListener("click", () => {
  refreshDevMetadataView();
  devLog("Dumped metadata to textarea");
});

btnDumpCache?.addEventListener("click", () => {
  if (!devCacheArea) return;
  const cache = localStorage.getItem("myvault_meta_cache");
  devCacheArea.value = cache || "";
  devLog("Loaded cache from localStorage");
});

btnReloadMeta?.addEventListener("click", async () => {
  try {
    devLog("Reloading metadata from Drive...");
    await loadMetadata();
    renderVaultList();
    renderDashboard && renderDashboard();
    renderActivity && renderActivity();
    refreshDevMetadataView();
    alert("Reloaded metadata from Drive.");
  } catch (err) {
    console.error(err);
    alert("Reload metadata failed: " + (err.message || err));
  }
});

btnClearCache?.addEventListener("click", () => {
  try {
    localStorage.removeItem("myvault_meta_cache");
    if (devCacheArea) devCacheArea.value = "";
    devLog("Cleared local cache");
    alert("Local cache cleared.");
  } catch (err) {
    console.error(err);
    alert("Failed to clear cache: " + (err.message || err));
  }
});

// optional: prime dev metadata view when page loads and metadata already in memory
if (devMetaArea && Array.isArray(metadata)) {
  refreshDevMetadataView();
}

// --- FOOTER BUTTONS → SHOW DRAWER ---
const footerBtns = document.querySelectorAll(".footer-btn");

footerBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab; // "help" or "dev"
    showDrawer(tab);
  });
});

// Help / Dev drawer ကို ဖွင့်မယ်
function showDrawer(tab) {
  // tab-panel အားလုံးကို ပထမဆုံး ပိတ်ထားမယ်
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.add("hidden");
    p.classList.remove("active");
  });

  // ပြထားချင်တဲ့ panel ကို ဖွင့်မယ်
  const panel = document.getElementById(`tab-${tab}`);
  if (panel) {
    panel.classList.remove("hidden");
    panel.classList.add("active");
  }
}

// Drawer ကို ပိတ်ချင်ရင် (X ခလုတ်ထဲကနေခေါ်မယ်)
function closeDrawer() {
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.classList.add("hidden");
    p.classList.remove("active");
  });

  // main view ကို dashboard လို့ပြန်ထားချင်ရင် ဒီလို ထပ်လို့ရ
  if (typeof switchTab === "function") {
    switchTab("dashboard");
  }
}

// close drawer when user taps outside (optional)
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("tab-panel")) return;
});

modalClose.addEventListener("click", () => {
  modal.classList.add("hidden");
});
modal.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) {
    modal.classList.add("hidden");
  }
});

// SETTINGS – Change Vault Password
const btnChangePw = document.getElementById("btn-change-vault-password");
const oldPwInput = document.getElementById("old-vault-pw");
const newPwInput = document.getElementById("new-vault-pw");
const settingsStatus = document.getElementById("settings-status");

btnChangePw?.addEventListener("click", async () => {
  const oldPw = oldPwInput.value.trim();
  const newPw = newPwInput.value.trim();

  settingsStatus.textContent = "";
  settingsStatus.className = "status";

  if (!oldPw || !newPw) {
    settingsStatus.textContent = "Enter both old & new passwords.";
    settingsStatus.classList.add("err");
    return;
  }

  try {
    settingsStatus.textContent = "Re-encrypting all files...";
    const result = await changeVaultPassword(oldPw, newPw);

    settingsStatus.textContent = `Done: ${result.ok} success / ${result.fail} failed (Total: ${result.total})`;
    settingsStatus.classList.add("ok");
  } catch (err) {
    console.error(err);
    settingsStatus.textContent = err.message || err;
    settingsStatus.classList.add("err");
  }
});

// ========= Export Vault Metadata (Desktop → JSON file) =========
if (btnExportMeta) {
  btnExportMeta.addEventListener("click", () => {
    if (!metadata || !Array.isArray(metadata) || !metadata.length) {
      alert("No metadata to export. Upload something first on this device.");
      return;
    }
    const email = (currentUserEmail || "myvault").replace(/[^a-z0-9@._-]/gi, "");
    const pretty = JSON.stringify(metadata, null, 2);
    const blob = new Blob([pretty], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vault_meta_backup_${email}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

// ========= Import Vault Metadata (Admin) =========
if (inputImportMeta) {
  inputImportMeta.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) {
        throw new Error("Invalid metadata JSON: expected an array");
      }

      // 1) In-memory metadata ကို overwrite
      metadata = arr;

      // 2) Drive + local cache ထဲကို save
      //    (saveMetadata() က ထဲမှာ ensureMetadataFile() ကိုခေါ်ပြီး
      //     vault_meta.json မရှိသေးရင် ဖန်တီးပေးမယ်)
      try {
        await saveMetadata();
      } catch (err) {
        console.warn("saveMetadata after import failed", err);
      }

      // 3) UI refresh
      renderVaultList();
      renderDashboard();
      renderActivity();

      // 4) Toast / Alert
      if (typeof showToast === "function") {
        showToast("Vault data imported on this device.");
      } else {
        alert("Imported vault data.");
      }
    } catch (err) {
      console.error("Import failed", err);
      alert("Import failed: " + (err.message || err));
    } finally {
      e.target.value = "";
    }
  });
}