// ==================== CONFIG ====================
const CLIENT_ID = "1015199990741-nsgs5ufc9o8jksom1p5v2hcqpmornvtp.apps.googleusercontent.com";
const API_KEY = ""; // optional if using discoveryDocs only via OAuth; can stay empty.
const SCOPES = "https://www.googleapis.com/auth/drive.file"; 
// drive.file = app-created files only (safer)

// ==================== GLOBAL STATE ====================
let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;

let vaultFolderId = null;
let metadataFileId = null;
let metadata = []; // in-memory metadata list
const META_FILE_NAME = "vault_meta.json";
const VAULT_FOLDER_NAME = "MyVault";

// DOM
const btnSignin = document.getElementById("btn-signin");
const btnSignout = document.getElementById("btn-signout");
const uploadForm = document.getElementById("upload-form");
const uploadStatus = document.getElementById("upload-status");
const vaultListEl = document.getElementById("vault-list");
const searchInput = document.getElementById("search-input");
const filterCategory = document.getElementById("filter-category");
const vaultPasswordInput = document.getElementById("vault-password");

// ==================== INIT ====================

// Called by gapi script
window.gapiLoaded = function () {
  gapi.load("client", initGapiClient);
};

function initGapiClient() {
  gapi.client
    .init({
      apiKey: API_KEY || undefined,
      discoveryDocs: [
        "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
      ],
    })
    .then(() => {
      gapiInited = true;
      maybeEnableSignin();
    })
    .catch((err) => console.error("gapi init error", err));
}

// Called by GIS script
window.gisLoaded = function () {
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
};

function maybeEnableSignin() {
  if (gapiInited && gisInited) {
    btnSignin.disabled = false;
  }
}

// ==================== AUTH ====================

btnSignin.addEventListener("click", () => {
  if (!tokenClient) return;
  tokenClient.requestAccessToken({ prompt: "consent" });
});

btnSignout.addEventListener("click", () => {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {
      accessToken = null;
      vaultFolderId = null;
      metadataFileId = null;
      metadata = [];
      renderVaultList();
      toggleAuthButtons(false);
    });
  }
});

function toggleAuthButtons(isSignedIn) {
  if (isSignedIn) {
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
  try {
    await ensureVaultFolder();
    await ensureMetadataFile();
    await loadMetadata();
    renderVaultList();
  } catch (e) {
    console.error(e);
    uploadStatus.textContent = "Error initializing vault.";
    uploadStatus.className = "status err";
  }
}

// ==================== DRIVE HELPERS ====================

function authHeaders() {
  return { Authorization: "Bearer " + accessToken };
}

async function ensureVaultFolder() {
  // Search for existing folder
  const q =
    "name = '" +
    VAULT_FOLDER_NAME +
    "' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
  const res = await gapi.client.drive.files.list({ q, fields: "files(id,name)" });
  if (res.result.files && res.result.files.length > 0) {
    vaultFolderId = res.result.files[0].id;
    return;
  }
  // Create folder
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
  const q =
    `'${vaultFolderId}' in parents and name = '${META_FILE_NAME}' and trashed = false`;
  const res = await gapi.client.drive.files.list({ q, fields: "files(id,name)" });
  if (res.result.files && res.result.files.length > 0) {
    metadataFileId = res.result.files[0].id;
    return;
  }
  // create empty metadata file
  const fileRes = await gapi.client.request({
    path: "/upload/drive/v3/files",
    method: "POST",
    params: { uploadType: "multipart", fields: "id" },
    headers: authHeaders(),
    body: buildMultipartBody(
      { name: META_FILE_NAME, parents: [vaultFolderId] },
      new Blob([JSON.stringify([])], { type: "application/json" }),
      "application/json"
    ),
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
  try {
    metadata = Array.isArray(res.result) ? res.result : [];
  } catch {
    metadata = [];
  }
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

// Multipart helper for metadata file creation
function buildMultipartBody(metadata, data, dataType) {
  const boundary = "-------314159265358979323846";
  let body = "";
  body += "--" + boundary + "\r\n";
  body += "Content-Type: application/json; charset=UTF-8\r\n\r\n";
  body += JSON.stringify(metadata) + "\r\n";
  body += "--" + boundary + "\r\n";
  body += "Content-Type: " + dataType + "\r\n\r\n";
  return new Blob([body, data, "\r\n--" + boundary + "--"], {
    type: "multipart/related; boundary=" + boundary,
  });
}

async function uploadEncryptedFileToVault(encryptedBlob, originalName) {
  const fileMetadata = {
    name: originalName + ".enc",
    parents: [vaultFolderId],
  };
  const boundary = "-------vaultboundary";
  let bodyStart = "";
  bodyStart += "--" + boundary + "\r\n";
  bodyStart += "Content-Type: application/json; charset=UTF-8\r\n\r\n";
  bodyStart += JSON.stringify(fileMetadata) + "\r\n";
  bodyStart += "--" + boundary + "\r\n";
  bodyStart += "Content-Type: application/octet-stream\r\n\r\n";

  const body = new Blob([bodyStart, encryptedBlob, "\r\n--" + boundary + "--"], {
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
  const res = await gapi.client.drive.files.get({
    fileId,
    alt: "media",
  });
  // gapi wraps but result is already data; use JSON/string? Actually binary fetch via xhr/fetch:
  // To keep simple, use fetch with alt=media:
  const url =
    "https://www.googleapis.com/drive/v3/files/" +
    encodeURIComponent(fileId) +
    "?alt=media";
  const resp = await fetch(url, { headers: authHeaders() });
  return await resp.blob();
}

// ==================== CRYPTO HELPERS (AES-GCM) ====================

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

function getOrCreateSalt() {
  let s = localStorage.getItem("myvault_salt");
  if (!s) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    s = bytesToBase64(bytes);
    localStorage.setItem("myvault_salt", s);
  }
  return s;
}

async function encryptFileWithPassword(file, password) {
  const salt = getOrCreateSalt();
  const key = await deriveKey(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await file.arrayBuffer();
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    buf
  );
  return {
    blob: new Blob([cipher], { type: "application/octet-stream" }),
    iv: bytesToBase64(iv),
    salt, // store for this device/user; using same for simplicity
  };
}

async function decryptBlobWithPassword(blob, password, ivBase64, saltBase64) {
  const key = await deriveKey(password, saltBase64);
  const iv = base64ToBytes(ivBase64);
  const buf = await blob.arrayBuffer();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    buf
  );
  return new Blob([plain]);
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ==================== UPLOAD FLOW ====================

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
    uploadStatus.textContent = "Please enter your vault password (for encryption).";
    uploadStatus.classList.add("err");
    return;
  }

  const fileInput = document.getElementById("file-input");
  const file = fileInput.files[0];
  if (!file) {
    uploadStatus.textContent = "Select a file.";
    uploadStatus.classList.add("err");
    return;
  }

  const title = document.getElementById("file-title").value.trim() || file.name;
  const category = document.getElementById("file-category").value;
  const tagsRaw = document.getElementById("file-tags").value.trim();
  const date = document.getElementById("file-date").value || null;
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

  try {
    uploadStatus.textContent = "Encrypting file...";
    const { blob, iv, salt } = await encryptFileWithPassword(file, password);

    uploadStatus.textContent = "Uploading encrypted file to Google Drive...";
    const fileId = await uploadEncryptedFileToVault(blob, file.name);

    const createdAt = new Date().toISOString();
    const metaEntry = {
      id: fileId,
      title,
      category,
      tags,
      date,
      originalName: file.name,
      size: file.size,
      mimeType: file.type,
      iv,
      salt,
      createdAt,
    };
    metadata.push(metaEntry);
    await saveMetadata();

    uploadStatus.textContent = "Uploaded & saved securely.";
    uploadStatus.classList.add("ok");
    fileInput.value = "";
    renderVaultList();
  } catch (err) {
    console.error(err);
    uploadStatus.textContent = "Upload failed.";
    uploadStatus.classList.add("err");
  }
});

// ==================== LIST & SEARCH ====================

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

  if (!metadata || metadata.length === 0) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "No items yet. Upload your first secure document on the left.";
    vaultListEl.appendChild(p);
    return;
  }

  const q = (searchInput.value || "").toLowerCase();
  const cat = filterCategory.value;

  const filtered = metadata.filter((m) => {
    if (cat && m.category !== cat) return false;
    const hay =
      (m.title || "") +
      " " +
      (m.originalName || "") +
      " " +
      (m.category || "") +
      " " +
      (m.tags || []).join(" ");
    return hay.toLowerCase().includes(q);
  });

  filtered
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .forEach((m) => {
      const item = document.createElement("div");
      item.className = "vault-item";

      const left = document.createElement("div");
      const titleEl = document.createElement("div");
      titleEl.className = "vault-title";
      titleEl.textContent = m.title || m.originalName;
      const metaEl = document.createElement("div");
      metaEl.className = "vault-meta";
      metaEl.textContent =
        (m.category || "other") +
        " • " +
        (m.date || m.createdAt?.slice(0, 10) || "") +
        " • " +
        humanSize(m.size);
      left.appendChild(titleEl);
      left.appendChild(metaEl);

      const tagsEl = document.createElement("div");
      if (m.tags && m.tags.length) {
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

      const btnDownload = document.createElement("button");
      btnDownload.className = "btn small";
      btnDownload.textContent = "Download & Decrypt";
      btnDownload.addEventListener("click", () => handleDownload(m));
      actions.appendChild(btnDownload);

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
  while (val > 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return val.toFixed(1) + " " + units[i];
}

// ==================== DOWNLOAD & DECRYPT ====================

async function handleDownload(m) {
  uploadStatus.textContent = "";
  uploadStatus.className = "status";

  const password = vaultPasswordInput.value.trim();
  if (!password) {
    uploadStatus.textContent = "Enter your vault password to decrypt.";
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
  } catch (e) {
    console.error(e);
    uploadStatus.textContent =
      "Decrypt failed. Wrong password or corrupted file.";
    uploadStatus.classList.add("err");
  }
}