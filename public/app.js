// ===== CONFIG =====
const CLIENT_ID =
  "27254719227-e0rgbjkkn0j23v0t3ecd12dicqe0d4o4.apps.googleusercontent.com";
const API_KEY = "";
const SCOPES = "https://www.googleapis.com/auth/drive.file";

const META_FILE_NAME = "vault_meta.json";
const VAULT_FOLDER_NAME = "MyVault";

const CATEGORY_CONFIG = {
  tax: { label: "Tax Returns", icon: "📄", color: "#38bdf8" },
  ids: { label: "IDs & Passports", icon: "🪪", color: "#facc15" },
  business: { label: "Business", icon: "📑", color: "#22c55e" },
  housing: { label: "Housing", icon: "🏠", color: "#a855f7" },
  membership: { label: "Memberships", icon: "🎫", color: "#f97316" },
  payment: { label: "Payments", icon: "💳", color: "#6366f1" },
  photos: { label: "Photos", icon: "📷", color: "#ec4899" },
  other: { label: "Other", icon: "📁", color: "#9ca3af" },
};

// ===== STATE =====
let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;

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

// Theme / font
const themeSelect = document.getElementById("theme-select");
const fontSelect = document.getElementById("font-select");

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
    callback: (resp) => {
      if (resp.error) {
        console.error(resp);
        return;
      }
      accessToken = resp.access_token;
      onSignedIn();
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
  }
}

// ===== AUTH =====
btnSignin.addEventListener("click", () => {
  if (!tokenClient) return;
  tokenClient.requestAccessToken({ prompt: "consent" });
});

btnSignout.addEventListener("click", () => {
  if (!accessToken) return;
  google.accounts.oauth2.revoke(accessToken, () => {
    accessToken = null;
    vaultFolderId = null;
    metadataFileId = null;
    metadata = [];
    activities = [];
    renderVaultList();
    renderActivity();
    renderDashboard();
    toggleAuthButtons(false);
  });
});

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
  } catch (e) {
    console.error(e);
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

async function ensureVaultFolder() {
  const q = `name = '${VAULT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await gapi.client.drive.files.list({
    q,
    fields: "files(id,name)",
  });
  if (res.result.files?.length) {
    vaultFolderId = res.result.files[0].id;
    return;
  }
  const createRes = await gapi.client.drive.files.create({
    resource: {
      name: VAULT_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  vaultFolderId = createRes.result.id;
}

async function ensureMetadataFile() {
  const q = `'${vaultFolderId}' in parents and name = '${META_FILE_NAME}' and trashed = false`;
  const res = await gapi.client.drive.files.list({
    q,
    fields: "files(id,name)",
  });
  if (res.result.files?.length) {
    metadataFileId = res.result.files[0].id;
    return;
  }
  const initBlob = new Blob([JSON.stringify([])], { type: "application/json" });
  const body = buildMultipartBody(
    { name: META_FILE_NAME, parents: [vaultFolderId] },
    initBlob,
    "application/json"
  );
  const fileRes = await gapi.client.request({
    path: "/upload/drive/v3/files",
    method: "POST",
    params: { uploadType: "multipart", fields: "id" },
    headers: authHeaders(),
    body,
  });
  metadataFileId = fileRes.result.id;
}

async function loadMetadata() {
  if (!metadataFileId) {
    metadata = [];
    return;
  }
  const res = await gapi.client.drive.files.get({
    fileId: metadataFileId,
    alt: "media",
  });
  metadata = Array.isArray(res.result) ? res.result : [];
}

async function saveMetadata() {
  if (!metadataFileId) return;
  const blob = new Blob([JSON.stringify(metadata, null, 2)], {
    type: "application/json",
  });
  await gapi.client.request({
    path: `/upload/drive/v3/files/${metadataFileId}`,
    method: "PATCH",
    params: { uploadType: "media" },
    headers: authHeaders(),
    body: blob,
  });
}

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
  const meta = {
    name: originalName + ".enc",
    parents: [vaultFolderId],
  };
  const boundary = "-------vaultboundaryfile";
  let head = "";
  head += "--" + boundary + "\r\n";
  head += "Content-Type: application/json; charset=UTF-8\r\n\r\n";
  head += JSON.stringify(meta) + "\r\n";
  head += "--" + boundary + "\r\n";
  head += "Content-Type: application/octet-stream\r\n\r\n";

  const body = new Blob([head, encryptedBlob, "\r\n--" + boundary + "--"], {
    type: "multipart/related; boundary=" + boundary,
  });

  const res = await gapi.client.request({
    path: "/upload/drive/v3/files",
    method: "POST",
    params: { uploadType: "multipart", fields: "id,name" },
    headers: authHeaders(),
    body,
  });

  return res.result.id;
}

async function downloadFileBlob(fileId) {
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    fileId
  )}?alt=media`;
  const resp = await fetch(url, { headers: authHeaders() });
  return await resp.blob();
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

  const fileEl = document.getElementById("file-input");
  const file = fileEl.files[0];
  if (!file) {
    uploadStatus.textContent = "Select a file.";
    uploadStatus.classList.add("err");
    return;
  }

  const title = document.getElementById("file-title").value.trim() || file.name;
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

  try {
    uploadStatus.textContent = "Encrypting file...";
    const { blob, iv, salt } = await encryptFileWithPassword(file, password);

    uploadStatus.textContent = "Uploading to Google Drive...";
    const fileId = await uploadEncryptedFileToVault(blob, file.name);

    const createdAt = new Date().toISOString();
    const entry = {
      id: fileId,
      title,
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
    metadata.push(entry);
    await saveMetadata();

    uploadStatus.textContent = "Uploaded & saved securely.";
    uploadStatus.classList.add("ok");
    fileEl.value = "";
    renderVaultList();
    renderDashboard();
    addActivity("upload", title);
    renderActivity();
  } catch (err) {
    console.error(err);
    uploadStatus.textContent = "Upload failed.";
    uploadStatus.classList.add("err");
  }
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

      item.appendChild(left);
      item.appendChild(tagsEl);
      item.appendChild(actions);

      vaultListEl.appendChild(item);
    });
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
    uploadStatus.textContent =
      "Decrypt failed. Wrong password or corrupted file.";
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

    const encBlob = await downloadFileBlob(m.id);
    const plainBlob = await decryptBlobWithPassword(
      encBlob,
      password,
      m.iv,
      m.salt
    );

    // Clear previous
    previewBody.innerHTML = "";
    previewTitle.textContent = m.title || m.originalName || "Preview";

    const type = m.mimeType || "";
    const url = URL.createObjectURL(plainBlob);

    if (type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = m.originalName || "image";
      img.className = "preview-image";
      previewBody.appendChild(img);
    } else if (type === "application/pdf") {
      const emb = document.createElement("embed");
      emb.src = url;
      emb.type = "application/pdf";
      emb.className = "preview-pdf";
      previewBody.appendChild(emb);
    } else {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent =
        "Decrypted file is ready. Use Download to open it in its native app.";
      previewBody.appendChild(p);
    }

    previewModal.classList.remove("hidden");
    uploadStatus.textContent = "";
  } catch (e) {
    console.error(e);
    uploadStatus.textContent =
      "Preview failed. Wrong password or file corrupted.";
    uploadStatus.classList.add("err");
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
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
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
  let ok = 0, fail = 0;

  for (const m of metadata) {
    try {
      // 1) download old encrypted blob
      const encBlob = await downloadFileBlob(m.id);
      // 2) decrypt with OLD
      const plain = await decryptBlobWithPassword(encBlob, oldPw, m.iv, m.salt);
      // 3) encrypt with NEW
      const { blob: newEnc, iv: newIv, salt: newSalt } =
        await encryptFileWithPassword(new File([plain], m.originalName, { type: m.mimeType }), newPw);

      // 4) replace Drive file content
      await gapi.client.request({
        path: `/upload/drive/v3/files/${m.id}`,
        method: "PATCH",
        params: { uploadType: "media" },
        headers: authHeaders(),
        body: newEnc
      });

      // 5) update metadata (iv/salt)
      m.iv = newIv;
      m.salt = newSalt;
      ok++;
    } catch (e) {
      console.error("re-encrypt failed for", m.title || m.originalName, e);
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
}

function makeDashCard(conf, count, categoryKey) {
  const card = document.createElement("div");
  card.className = "dash-card";
  card.style.borderColor = conf.color;

  const title = document.createElement("div");
  title.className = "dash-title";
  title.textContent = `${conf.icon} ${conf.label}`;

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

modalClose.addEventListener("click", () => {
  modal.classList.add("hidden");
});
modal.addEventListener("click", (e) => {
  if (e.target.classList.contains("modal-backdrop")) {
    modal.classList.add("hidden");
  }
});
