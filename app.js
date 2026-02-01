/**
 * FERRETTO EDU PRO — FULL WORKING JS (Biometric Attendance + Admin/User)
 * ✅ Works on Android / iOS / Desktop (Camera + Face Embeddings)
 *
 * HARD REQUIREMENTS (browser rules):
 * 1) MUST run on HTTPS (or localhost) for camera permissions
 * 2) Add in <head> of HTML:
 *    <script defer src="https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js"></script>
 *
 * GOOD NEWS:
 * - This JS is SELF-CONTAINED: if your HTML is missing UI, it auto-builds a working UI.
 * - If your HTML already has elements, it will reuse them if IDs match.
 *
 * Default accounts:
 *   admin / admin12345
 *   student / student123
 */

// ================================
// CONFIG
// ================================
const APP = {
  name: "Ferretto Edu Pro — Biometric Attendance",
  version: "4.0.0",
  storageKey: "ferretto_edu_pro_data",
  sessionKey: "ferretto_current_user",
  // Face settings (mobile-friendly)
  face: {
    detector: "tiny", // "tiny" faster on phones; "full" more accurate but slower
    matchThreshold: 0.62, // cosine similarity threshold (0..1)
    regSamplesTarget: 20, // samples to collect during registration
    regIntervalMs: 180,
    scanTimeoutMs: 15000
  },
  modelsBase: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/"
};

let appData = null;
let currentUser = null;

// Camera streams
let regStream = null;
let attStream = null;

// Registration loop
let regTimer = null;
let regSamples = [];
let regCount = 0;
let regUserId = null;

// Attendance loop
let scanTimer = null;
let bestSim = -1;

// Models load flag
let modelsLoaded = false;

// ================================
// BOOT
// ================================
document.addEventListener("DOMContentLoaded", () => {
  injectBaseStyles();
  ensureUI();          // ✅ builds UI if missing
  loadAppData();
  bindUI();
  restoreSession();
  updateSecureBanner();
});

// ================================
// DATA
// ================================
function defaultData() {
  return {
    users: [
      { id: 1, username: "admin", password: "admin12345", name: "System Admin", role: "admin", status: "active", faceDescriptor: null, createdAt: iso(), lastLogin: null },
      { id: 2, username: "student", password: "student123", name: "Demo Student", role: "student", status: "active", faceDescriptor: null, createdAt: iso(), lastLogin: null }
    ],
    attendance: [],
    logs: []
  };
}

function loadAppData() {
  try {
    const raw = localStorage.getItem(APP.storageKey);
    appData = raw ? JSON.parse(raw) : defaultData();
    // Normalize descriptor format (store as plain number arrays)
    appData.users = (appData.users || []).map(u => ({
      ...u,
      faceDescriptor: normalizeDescriptor(u.faceDescriptor)
    }));
    saveAppData();
  } catch (e) {
    console.error(e);
    appData = defaultData();
    saveAppData();
  }
}

function saveAppData() {
  localStorage.setItem(APP.storageKey, JSON.stringify(appData));
}

function normalizeDescriptor(d) {
  if (!d) return null;
  if (Array.isArray(d)) return d;
  if (d instanceof Float32Array) return Array.from(d);
  if (typeof d === "object" && Array.isArray(d.data)) return d.data;
  return null;
}

function iso() { return new Date().toISOString(); }
function today() { return new Date().toISOString().split("T")[0]; }
function nowTime() { return new Date().toTimeString().split(" ")[0]; }

// ================================
// SESSION + AUTH
// ================================
function restoreSession() {
  const raw = sessionStorage.getItem(APP.sessionKey);
  if (!raw) return showLogin();
  try {
    const u = JSON.parse(raw);
    const fresh = appData.users.find(x => x.id === u.id);
    if (!fresh || fresh.status !== "active") return showLogin();
    currentUser = fresh;
    showDashboard();
  } catch {
    showLogin();
  }
}

function login(username, password) {
  username = (username || "").trim();
  password = (password || "").trim();
  const user = appData.users.find(u => u.username === username && u.password === password && u.status === "active");
  if (!user) return toast("Invalid username or password", "error");

  user.lastLogin = iso();
  saveAppData();
  currentUser = user;
  sessionStorage.setItem(APP.sessionKey, JSON.stringify({ id: user.id }));
  log("LOGIN", `${user.username} logged in`);
  toast(`Welcome, ${user.name}`, "success");
  showDashboard();
}

function logout() {
  stopAttendanceScan();
  stopFaceRegistration();

  log("LOGOUT", `${currentUser?.username || "unknown"} logged out`);
  currentUser = null;
  sessionStorage.removeItem(APP.sessionKey);
  showLogin();
}

// ================================
// UI BUILD (AUTO) — makes it work even if your HTML is empty
// ================================
function ensureUI() {
  const rootExists = document.getElementById("ferrettoAppRoot");
  if (rootExists) return;

  const root = document.createElement("div");
  root.id = "ferrettoAppRoot";
  root.innerHTML = `
  <div class="fx-topbar">
    <div class="fx-brand">
      <div class="fx-logo">F</div>
      <div>
        <div class="fx-title">${APP.name}</div>
        <div class="fx-subtitle">v${APP.version}</div>
      </div>
    </div>
    <div class="fx-right">
      <div id="secureBadge" class="fx-badge fx-badge-warn">Checking…</div>
      <button id="btnLogout" class="fx-btn fx-btn-ghost" style="display:none;">Logout</button>
    </div>
  </div>

  <div class="fx-container">
    <!-- LOGIN -->
    <section id="loginPage" class="fx-card fx-login">
      <h2>Login</h2>
      <p class="fx-muted">Use <b>admin/admin12345</b> or <b>student/student123</b></p>
      <form id="loginForm" class="fx-form">
        <label>Username</label>
        <input id="username" autocomplete="username" required />
        <label>Password</label>
        <input id="password" type="password" autocomplete="current-password" required />
        <button class="fx-btn fx-btn-primary" type="submit">Sign In</button>
      </form>
      <div class="fx-small fx-muted">
        Camera works only on <b>HTTPS</b> or <b>localhost</b>.
      </div>
    </section>

    <!-- DASHBOARD -->
    <section id="dashboardPage" class="fx-grid" style="display:none;">
      <div class="fx-card">
        <h3>Account</h3>
        <div class="fx-row">
          <div class="fx-pill" id="meName">—</div>
          <div class="fx-pill" id="meRole">—</div>
        </div>
        <div id="faceStatus" class="fx-muted" style="margin-top:10px;">—</div>
      </div>

      <div class="fx-card">
        <h3>Attendance</h3>
        <div class="fx-row fx-gap">
          <button id="btnTestFace" class="fx-btn fx-btn-ghost">Test Face</button>
          <button id="btnStartAttendance" class="fx-btn fx-btn-primary">Start Scan</button>
          <button id="btnStopAttendance" class="fx-btn fx-btn-danger" style="display:none;">Stop</button>
        </div>
        <div class="fx-scanbox">
          <div class="fx-scanhead">
            <div><b>Status:</b> <span id="attStatusText">Camera Off</span></div>
            <div class="fx-muted"><span id="attHint">Look at camera in good light</span></div>
          </div>
          <video id="attVideo" autoplay muted playsinline></video>
        </div>
        <div class="fx-row fx-gap" style="margin-top:10px;">
          <button id="btnExportCSV" class="fx-btn fx-btn-ghost">Export CSV</button>
          <button id="btnClearMyAttendance" class="fx-btn fx-btn-ghost">Clear My Records</button>
        </div>
      </div>

      <div class="fx-card fx-span2">
        <h3>Attendance History</h3>
        <div class="fx-tablewrap">
          <table class="fx-table">
            <thead>
              <tr>
                <th>Date</th><th>Time</th><th>Similarity</th><th>Lat</th><th>Lng</th><th>Accuracy</th><th>Method</th>
              </tr>
            </thead>
            <tbody id="attendanceTable"></tbody>
          </table>
        </div>
      </div>

      <!-- ADMIN -->
      <div id="adminPanel" class="fx-card fx-span2" style="display:none;">
        <div class="fx-row fx-between">
          <h3>Admin — Users</h3>
          <button id="btnAddUser" class="fx-btn fx-btn-primary">Add User</button>
        </div>
        <div class="fx-tablewrap">
          <table class="fx-table">
            <thead>
              <tr>
                <th>Name</th><th>Username</th><th>Role</th><th>Face</th><th>Actions</th>
              </tr>
            </thead>
            <tbody id="usersTable"></tbody>
          </table>
        </div>
        <div class="fx-muted fx-small">Register face from a phone for best camera results.</div>
      </div>
    </section>
  </div>

  <!-- MODAL: Add/Edit User -->
  <div id="userModal" class="fx-modal" style="display:none;">
    <div class="fx-modal-card">
      <div class="fx-row fx-between">
        <h3 id="userModalTitle">Add User</h3>
        <button class="fx-btn fx-btn-ghost" id="btnCloseUserModal">✕</button>
      </div>
      <form id="userForm" class="fx-form" style="margin-top:10px;">
        <input id="userId" type="hidden" />
        <label>Name</label>
        <input id="userName" required />
        <label>Username</label>
        <input id="userUsername" required />
        <label>Password</label>
        <input id="userPassword" type="password" required />
        <label>Role</label>
        <select id="userRole">
          <option value="student">student</option>
          <option value="admin">admin</option>
        </select>
        <div class="fx-row fx-gap" style="margin-top:10px;">
          <button class="fx-btn fx-btn-primary" type="submit">Save</button>
          <button class="fx-btn fx-btn-ghost" type="button" id="btnCancelUserModal">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Face Registration -->
  <div id="faceModal" class="fx-modal" style="display:none;">
    <div class="fx-modal-card">
      <div class="fx-row fx-between">
        <h3>Register Face: <span id="regUserName">—</span></h3>
        <button class="fx-btn fx-btn-ghost" id="btnCloseFaceModal">✕</button>
      </div>
      <div class="fx-muted fx-small">Good light + keep face centered. Collects ${APP.face.regSamplesTarget} samples.</div>
      <div class="fx-scanbox" style="margin-top:10px;">
        <div class="fx-scanhead">
          <div><b>Status:</b> <span id="regStatus">Idle</span></div>
          <div><b>Samples:</b> <span id="regCount">0</span>/${APP.face.regSamplesTarget}</div>
        </div>
        <video id="regVideo" autoplay muted playsinline></video>
        <div class="fx-progress"><div id="regBar" class="fx-progress-bar"></div></div>
      </div>
      <div class="fx-row fx-gap" style="margin-top:10px;">
        <button id="btnStartReg" class="fx-btn fx-btn-primary">Start Registration</button>
        <button id="btnStopReg" class="fx-btn fx-btn-danger" style="display:none;">Stop</button>
        <button id="btnTestRegCam" class="fx-btn fx-btn-ghost">Test Camera</button>
      </div>
    </div>
  </div>

  <div id="toastContainer" class="fx-toast-wrap"></div>
  `;
  document.body.appendChild(root);
}

function injectBaseStyles() {
  if (document.getElementById("ferrettoBaseStyles")) return;
  const s = document.createElement("style");
  s.id = "ferrettoBaseStyles";
  s.textContent = `
    :root{--bg:#0b1020;--card:#121a33;--muted:#9fb0ff;--text:#e8eeff;--line:rgba(255,255,255,.08);
      --pri:#4f46e5;--danger:#ef4444;--ok:#22c55e;--warn:#f59e0b;}
    *{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;}
    body{margin:0;background:radial-gradient(1200px 600px at 10% 0%, #1a2a6c 0%, rgba(26,42,108,0) 60%),
                      radial-gradient(1200px 600px at 90% 0%, #b21f1f 0%, rgba(178,31,31,0) 60%),
                      var(--bg);color:var(--text);}
    .fx-topbar{position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center;
      padding:12px 16px;background:rgba(5,8,18,.75);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);}
    .fx-brand{display:flex;gap:10px;align-items:center;}
    .fx-logo{width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#4f46e5,#22c55e);
      display:flex;align-items:center;justify-content:center;font-weight:800;}
    .fx-title{font-weight:800;letter-spacing:.2px}
    .fx-subtitle{font-size:12px;color:rgba(232,238,255,.7)}
    .fx-right{display:flex;gap:10px;align-items:center;}
    .fx-container{max-width:1100px;margin:0 auto;padding:16px;}
    .fx-card{background:rgba(18,26,51,.85);border:1px solid var(--line);border-radius:16px;padding:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);}
    .fx-login{max-width:420px;margin:32px auto;}
    .fx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}
    .fx-span2{grid-column:1 / -1;}
    @media (max-width:900px){.fx-grid{grid-template-columns:1fr;}.fx-span2{grid-column:auto;}}
    .fx-form{display:flex;flex-direction:column;gap:10px;}
    label{font-size:12px;color:rgba(232,238,255,.75)}
    input,select{padding:12px 12px;border-radius:12px;border:1px solid var(--line);background:rgba(0,0,0,.25);color:var(--text);outline:none;}
    input:focus,select:focus{border-color:rgba(79,70,229,.8);box-shadow:0 0 0 3px rgba(79,70,229,.18);}
    .fx-btn{border:1px solid var(--line);background:rgba(0,0,0,.18);color:var(--text);padding:10px 12px;border-radius:12px;cursor:pointer;font-weight:700;}
    .fx-btn:hover{transform:translateY(-1px);transition:.12s;}
    .fx-btn-primary{background:linear-gradient(135deg,#4f46e5,#6d28d9);border-color:rgba(255,255,255,.12);}
    .fx-btn-danger{background:linear-gradient(135deg,#ef4444,#b91c1c);border-color:rgba(255,255,255,.12);}
    .fx-btn-ghost{background:rgba(255,255,255,.06);}
    .fx-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
    .fx-between{justify-content:space-between;}
    .fx-gap{gap:8px;}
    .fx-pill{padding:6px 10px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.06);font-weight:700;}
    .fx-muted{color:rgba(232,238,255,.72)}
    .fx-small{font-size:12px}
    .fx-badge{padding:6px 10px;border-radius:999px;border:1px solid var(--line);font-size:12px;font-weight:800;}
    .fx-badge-ok{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.35);color:#b7f7d0;}
    .fx-badge-warn{background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.35);color:#ffe3b1;}
    .fx-badge-bad{background:rgba(239,68,68,.14);border-color:rgba(239,68,68,.35);color:#ffc3c3;}
    .fx-scanbox{margin-top:10px;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:rgba(0,0,0,.22);}
    .fx-scanhead{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px;border-bottom:1px solid var(--line);font-size:12px;}
    video{width:100%;height:auto;display:block;background:#000;}
    .fx-progress{height:10px;background:rgba(255,255,255,.06);}
    .fx-progress-bar{height:10px;width:0%;background:linear-gradient(90deg,#22c55e,#4f46e5);}
    .fx-tablewrap{overflow:auto;border:1px solid var(--line);border-radius:14px;}
    .fx-table{width:100%;border-collapse:collapse;min-width:760px;}
    .fx-table th,.fx-table td{padding:10px;border-bottom:1px solid var(--line);font-size:12px;white-space:nowrap;}
    .fx-table th{position:sticky;top:0;background:rgba(18,26,51,.95);text-align:left;}
    .fx-modal{position:fixed;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:14px;z-index:50;}
    .fx-modal-card{width:min(720px,100%);background:rgba(18,26,51,.95);border:1px solid var(--line);border-radius:16px;padding:14px;}
    .fx-toast-wrap{position:fixed;right:14px;bottom:14px;display:flex;flex-direction:column;gap:10px;z-index:60;}
    .fx-toast{padding:10px 12px;border-radius:14px;border:1px solid var(--line);background:rgba(18,26,51,.95);
      box-shadow:0 10px 30px rgba(0,0,0,.25);display:flex;gap:10px;align-items:center;max-width:360px;}
    .fx-dot{width:10px;height:10px;border-radius:50%;}
  `;
  document.head.appendChild(s);
}

// ================================
// UI BIND
// ================================
function bindUI() {
  // Login
  byId("loginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    login(byId("username").value, byId("password").value);
  });

  // Logout
  byId("btnLogout").addEventListener("click", logout);

  // Attendance
  byId("btnStartAttendance").addEventListener("click", startAttendanceScan);
  byId("btnStopAttendance").addEventListener("click", stopAttendanceScan);
  byId("btnTestFace").addEventListener("click", testFace);

  byId("btnExportCSV").addEventListener("click", exportCSV);
  byId("btnClearMyAttendance").addEventListener("click", () => {
    if (!confirm("Clear your attendance records?")) return;
    appData.attendance = appData.attendance.filter(a => a.userId !== currentUser.id);
    saveAppData();
    renderAttendance();
    toast("Cleared your records", "success");
  });

  // Admin users
  byId("btnAddUser").addEventListener("click", () => openUserModal());
  byId("btnCloseUserModal").addEventListener("click", closeUserModal);
  byId("btnCancelUserModal").addEventListener("click", closeUserModal);
  byId("userForm").addEventListener("submit", (e) => {
    e.preventDefault();
    saveUserFromModal();
  });

  // Face modal
  byId("btnCloseFaceModal").addEventListener("click", closeFaceModal);
  byId("btnStartReg").addEventListener("click", startFaceRegistration);
  byId("btnStopReg").addEventListener("click", stopFaceRegistration);
  byId("btnTestRegCam").addEventListener("click", testRegCamera);

  // Close modals clicking outside card
  byId("userModal").addEventListener("click", (e) => { if (e.target.id === "userModal") closeUserModal(); });
  byId("faceModal").addEventListener("click", (e) => { if (e.target.id === "faceModal") closeFaceModal(); });
}

// ================================
// SHOW PAGES
// ================================
function showLogin() {
  byId("btnLogout").style.display = "none";
  byId("loginPage").style.display = "block";
  byId("dashboardPage").style.display = "none";
  byId("loginForm").reset();
  byId("username").focus();
}

function showDashboard() {
  byId("btnLogout").style.display = "inline-block";
  byId("loginPage").style.display = "none";
  byId("dashboardPage").style.display = "grid";

  // Update header
  byId("meName").textContent = currentUser.name;
  byId("meRole").textContent = currentUser.role.toUpperCase();

  // Admin panel visibility
  byId("adminPanel").style.display = currentUser.role === "admin" ? "block" : "none";

  // Refresh data UI
  updateFaceStatus();
  renderAttendance();
  if (currentUser.role === "admin") renderUsers();
}

function updateFaceStatus() {
  const me = appData.users.find(u => u.id === currentUser.id);
  const has = !!me?.faceDescriptor;
  byId("faceStatus").innerHTML = has
    ? `✅ Face Registered <span class="fx-muted">(ready to mark attendance)</span>`
    : `⚠️ Face NOT Registered <span class="fx-muted">(admin must register your face)</span>`;
}

// ================================
// SECURITY BANNER
// ================================
function updateSecureBanner() {
  const b = byId("secureBadge");
  const ok = isSecureContextOK();
  if (ok) {
    b.className = "fx-badge fx-badge-ok";
    b.textContent = "HTTPS OK";
  } else {
    b.className = "fx-badge fx-badge-bad";
    b.textContent = "NOT HTTPS";
  }
}

function isSecureContextOK() {
  return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

// ================================
// ADMIN: USERS
// ================================
function renderUsers() {
  const tbody = byId("usersTable");
  tbody.innerHTML = "";

  const users = appData.users.slice().sort((a,b)=>a.id-b.id);
  users.forEach(u => {
    const tr = document.createElement("tr");
    const face = u.faceDescriptor ? "✅ Registered" : "❌ Not set";
    tr.innerHTML = `
      <td>${escapeHtml(u.name)}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.role)}</td>
      <td>${face}</td>
      <td>
        <button class="fx-btn fx-btn-ghost" data-act="reg" data-id="${u.id}">Register Face</button>
        <button class="fx-btn fx-btn-ghost" data-act="edit" data-id="${u.id}">Edit</button>
        ${u.id === 1 ? "" : `<button class="fx-btn fx-btn-danger" data-act="del" data-id="${u.id}">Delete</button>`}
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-id"));
      const act = btn.getAttribute("data-act");
      if (act === "reg") openFaceModal(id);
      if (act === "edit") openUserModal(id);
      if (act === "del") deleteUser(id);
    });
  });
}

function openUserModal(id=null) {
  byId("userModal").style.display = "flex";
  if (!id) {
    byId("userModalTitle").textContent = "Add User";
    byId("userId").value = "";
    byId("userName").value = "";
    byId("userUsername").value = "";
    byId("userPassword").value = "";
    byId("userRole").value = "student";
    byId("userPassword").required = true;
    return;
  }
  const u = appData.users.find(x => x.id === id);
  if (!u) return;
  byId("userModalTitle").textContent = "Edit User";
  byId("userId").value = String(u.id);
  byId("userName").value = u.name;
  byId("userUsername").value = u.username;
  byId("userPassword").value = "";
  byId("userRole").value = u.role;
  byId("userPassword").required = false; // allow keep old
}

function closeUserModal() {
  byId("userModal").style.display = "none";
}

function saveUserFromModal() {
  if (currentUser.role !== "admin") return toast("Admin only", "error");

  const id = byId("userId").value.trim();
  const name = byId("userName").value.trim();
  const username = byId("userUsername").value.trim();
  const password = byId("userPassword").value.trim();
  const role = byId("userRole").value;

  if (!name || !username) return toast("Name + Username required", "error");

  const usernameTaken = appData.users.some(u => u.username === username && String(u.id) !== String(id));
  if (usernameTaken) return toast("Username already exists", "error");

  if (!id) {
    if (!password || password.length < 6) return toast("Password min 6 chars", "error");
    const newUser = {
      id: Date.now(),
      username,
      password,
      name,
      role,
      status: "active",
      faceDescriptor: null,
      createdAt: iso(),
      lastLogin: null
    };
    appData.users.push(newUser);
    saveAppData();
    log("USER_CREATE", `Created user ${username}`);
    toast("User created", "success");
  } else {
    const idx = appData.users.findIndex(u => String(u.id) === String(id));
    if (idx < 0) return;
    const prev = appData.users[idx];
    appData.users[idx] = {
      ...prev,
      name,
      username,
      role,
      password: password ? password : prev.password
    };
    saveAppData();
    log("USER_UPDATE", `Updated user ${username}`);
    toast("User updated", "success");

    // If edited self, refresh
    if (currentUser.id === prev.id) {
      currentUser = appData.users[idx];
      sessionStorage.setItem(APP.sessionKey, JSON.stringify({ id: currentUser.id }));
      showDashboard();
    }
  }

  closeUserModal();
  renderUsers();
}

function deleteUser(id) {
  if (currentUser.role !== "admin") return toast("Admin only", "error");
  if (!confirm("Delete this user?")) return;

  const u = appData.users.find(x => x.id === id);
  if (!u) return;
  if (id === 1) return toast("Cannot delete main admin", "error");

  appData.users = appData.users.filter(x => x.id !== id);
  appData.attendance = appData.attendance.filter(a => a.userId !== id);
  saveAppData();
  log("USER_DELETE", `Deleted user ${u.username}`);
  toast("User deleted", "success");
  renderUsers();
  renderAttendance();
}

// ================================
// FACE MODELS + CAMERA
// ================================
async function ensureModels() {
  if (modelsLoaded) return true;
  if (!window.faceapi) {
    toast("face-api.js not loaded. Add script in <head>.", "error");
    return false;
  }
  try {
    if (APP.face.detector === "tiny") {
      await faceapi.nets.tinyFaceDetector.loadFromUri(APP.modelsBase);
    } else {
      await faceapi.nets.ssdMobilenetv1.loadFromUri(APP.modelsBase);
    }
    await faceapi.nets.faceLandmark68Net.loadFromUri(APP.modelsBase);
    await faceapi.nets.faceRecognitionNet.loadFromUri(APP.modelsBase);
    modelsLoaded = true;
    return true;
  } catch (e) {
    console.error(e);
    toast("Failed to load face models (network/HTTPS issue).", "error");
    return false;
  }
}

function detectorOptions() {
  if (APP.face.detector === "tiny") {
    return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
  }
  return new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 });
}

async function startCamera(videoEl, preferFront = true) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not supported");
  if (!isSecureContextOK()) throw new Error("Camera requires HTTPS (or localhost).");

  videoEl.setAttribute("playsinline", "true");
  videoEl.muted = true;
  videoEl.autoplay = true;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: preferFront ? "user" : "environment",
      width: { ideal: 640 },
      height: { ideal: 480 }
    }
  });

  videoEl.srcObject = stream;

  await new Promise((res) => {
    if (videoEl.readyState >= 2) return res();
    videoEl.onloadeddata = () => res();
  });

  try { await videoEl.play(); } catch (_) {}
  return stream;
}

function stopStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach(t => t.stop());
}

async function captureDescriptor(videoEl) {
  const det = await faceapi
    .detectSingleFace(videoEl, detectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();

  return det?.descriptor || null; // Float32Array(128)
}

function cosineSim(a, b) {
  a = a instanceof Float32Array ? a : new Float32Array(a || []);
  b = b instanceof Float32Array ? b : new Float32Array(b || []);
  if (!a.length || !b.length || a.length !== b.length) return -1;

  let dot=0, na=0, nb=0;
  for (let i=0;i<a.length;i++){
    dot += a[i]*b[i];
    na += a[i]*a[i];
    nb += b[i]*b[i];
  }
  na = Math.sqrt(na); nb = Math.sqrt(nb);
  if (!na || !nb) return -1;
  return dot/(na*nb);
}

function avgDesc(list) {
  if (!list.length) return null;
  const out = new Float32Array(list[0].length);
  for (const d of list) {
    for (let i=0;i<out.length;i++) out[i] += d[i];
  }
  for (let i=0;i<out.length;i++) out[i] /= list.length;
  return out;
}

// ================================
// FACE REGISTRATION (ADMIN)
// ================================
function openFaceModal(userId) {
  if (currentUser.role !== "admin") return toast("Admin only", "error");
  const u = appData.users.find(x => x.id === userId);
  if (!u) return;

  regUserId = userId;
  regSamples = [];
  regCount = 0;
  updateRegUI("Idle", 0);

  byId("regUserName").textContent = u.name;
  byId("faceModal").style.display = "flex";
}

function closeFaceModal() {
  stopFaceRegistration();
  byId("faceModal").style.display = "none";
}

async function testRegCamera() {
  try {
    const ok = await ensureModels();
    if (!ok) return;

    const v = byId("regVideo");
    if (regStream) stopStream(regStream);
    regStream = await startCamera(v, true);
    toast("Camera OK", "success");
  } catch (e) {
    toast(e.message || "Camera test failed", "error");
  }
}

async function startFaceRegistration() {
  try {
    if (currentUser.role !== "admin") return toast("Admin only", "error");
    if (!regUserId) return toast("No user selected", "error");
    if (regTimer) return;

    const ok = await ensureModels();
    if (!ok) return;

    const v = byId("regVideo");
    if (regStream) stopStream(regStream);
    regStream = await startCamera(v, true);

    regSamples = [];
    regCount = 0;
    updateRegUI("Capturing", 0);

    byId("btnStartReg").style.display = "none";
    byId("btnStopReg").style.display = "inline-block";

    regTimer = setInterval(async () => {
      try {
        const d = await captureDescriptor(v);
        if (d) {
          regSamples.push(d);
          regCount++;
          const pct = Math.round((regCount / APP.face.regSamplesTarget) * 100);
          updateRegUI("Capturing", pct);
        }

        if (regCount >= APP.face.regSamplesTarget) {
          await finalizeRegistration();
        }
      } catch (e) {
        console.warn("reg tick", e);
      }
    }, APP.face.regIntervalMs);
  } catch (e) {
    console.error(e);
    toast(e.message || "Registration failed", "error");
    stopFaceRegistration();
  }
}

function stopFaceRegistration() {
  if (regTimer) clearInterval(regTimer);
  regTimer = null;

  byId("btnStartReg").style.display = "inline-block";
  byId("btnStopReg").style.display = "none";

  const v = byId("regVideo");
  if (v) v.srcObject = null;
  stopStream(regStream);
  regStream = null;

  // keep UI status if modal open
}

async function finalizeRegistration() {
  if (regTimer) clearInterval(regTimer);
  regTimer = null;

  const minNeeded = Math.max(8, Math.floor(APP.face.regSamplesTarget * 0.5));
  if (regSamples.length < minNeeded) {
    updateRegUI("Low Samples", 0);
    toast("Face capture not stable. Try better light + steady face.", "error");
    stopFaceRegistration();
    return;
  }

  const averaged = avgDesc(regSamples);
  const user = appData.users.find(u => u.id === regUserId);
  if (!user) return;

  user.faceDescriptor = Array.from(averaged);
  saveAppData();

  updateRegUI("Completed", 100);
  toast("Face registered successfully", "success");
  log("FACE_REGISTER", `Registered face for ${user.username}`);

  stopFaceRegistration();
  renderUsers();
  updateFaceStatus();
  closeFaceModal();
}

function updateRegUI(status, pct) {
  byId("regStatus").textContent = status;
  byId("regCount").textContent = String(regCount);
  byId("regBar").style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

// ================================
// ATTENDANCE (REAL MATCH)
// ================================
async function testFace() {
  try {
    const me = appData.users.find(u => u.id === currentUser.id);
    if (!me?.faceDescriptor) return toast("Face not registered. Ask admin.", "warning");

    const ok = await ensureModels();
    if (!ok) return;

    setAttStatus("Testing…");

    const v = byId("attVideo");
    if (attStream) stopStream(attStream);
    attStream = await startCamera(v, true);

    const d = await captureDescriptor(v);
    const sim = cosineSim(d, me.faceDescriptor);

    stopAttendanceScan();
    if (sim >= APP.face.matchThreshold) {
      toast(`Test PASS (Similarity ${(sim*100).toFixed(1)}%)`, "success");
      setAttStatus("Test Passed");
    } else {
      toast(`Test FAIL (Similarity ${(sim*100).toFixed(1)}%)`, "error");
      setAttStatus("Test Failed");
    }
  } catch (e) {
    console.error(e);
    stopAttendanceScan();
    toast(e.message || "Test failed", "error");
    setAttStatus("Error");
  }
}

async function startAttendanceScan() {
  try {
    const me = appData.users.find(u => u.id === currentUser.id);
    if (!me?.faceDescriptor) return toast("Face not registered. Ask admin.", "warning");

    const ok = await ensureModels();
    if (!ok) return;

    // prevent duplicate
    if (scanTimer) return;

    // already marked today?
    const exists = appData.attendance.some(a => a.userId === currentUser.id && a.date === today());
    if (exists && !confirm("Attendance already marked today. Mark again?")) return;

    byId("btnStartAttendance").style.display = "none";
    byId("btnStopAttendance").style.display = "inline-block";

    bestSim = -1;
    setAttStatus("Scanning…");

    const v = byId("attVideo");
    if (attStream) stopStream(attStream);
    attStream = await startCamera(v, true);

    const start = Date.now();

    const loop = async () => {
      if (!attStream) return;

      const d = await captureDescriptor(v);
      if (d) {
        const sim = cosineSim(d, me.faceDescriptor);
        if (sim > bestSim) bestSim = sim;

        if (sim >= APP.face.matchThreshold) {
          const coords = await getLocationBestEffort();
          markAttendance(coords, sim);
          stopAttendanceScan();
          return;
        }
      }

      if (Date.now() - start > APP.face.scanTimeoutMs) {
        stopAttendanceScan();
        toast(`No match. Best ${(bestSim*100).toFixed(1)}% (need ${(APP.face.matchThreshold*100).toFixed(0)}%).`, "warning");
        setAttStatus("No Match");
        return;
      }

      scanTimer = setTimeout(loop, 250);
    };

    loop();
  } catch (e) {
    console.error(e);
    stopAttendanceScan();
    toast(e.message || "Attendance scan failed", "error");
    setAttStatus("Error");
  }
}

function stopAttendanceScan() {
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;

  byId("btnStartAttendance").style.display = "inline-block";
  byId("btnStopAttendance").style.display = "none";

  const v = byId("attVideo");
  if (v) v.srcObject = null;
  stopStream(attStream);
  attStream = null;

  if (byId("attStatusText").textContent === "Scanning…") setAttStatus("Camera Off");
}

function setAttStatus(s) {
  byId("attStatusText").textContent = s;
}

// ================================
// LOCATION (best effort, optional)
// ================================
function getLocationBestEffort() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ latitude: null, longitude: null, accuracy: null });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve({ latitude: null, longitude: null, accuracy: null }),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 }
    );
  });
}

// ================================
// ATTENDANCE RECORDS
// ================================
function markAttendance(coords, sim) {
  const rec = {
    id: Date.now(),
    userId: currentUser.id,
    date: today(),
    time: nowTime(),
    similarity: Math.round(sim * 1000) / 1000,
    lat: coords?.latitude ?? null,
    lng: coords?.longitude ?? null,
    accuracy: coords?.accuracy ?? null,
    method: "REAL Face Biometric (face-api.js)"
  };

  appData.attendance.push(rec);
  saveAppData();
  log("ATTENDANCE", `Marked (${Math.round(sim*100)}%)`);
  toast(`Attendance marked ✅ (${Math.round(sim*100)}%)`, "success");
  renderAttendance();
}

function renderAttendance() {
  const tbody = byId("attendanceTable");
  tbody.innerHTML = "";

  const rows = appData.attendance
    .filter(a => a.userId === currentUser?.id)
    .slice()
    .sort((a,b) => (b.id - a.id));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="fx-muted">No records yet.</td></tr>`;
    return;
  }

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.date}</td>
      <td>${r.time || ""}</td>
      <td><b>${Math.round((r.similarity || 0) * 100)}%</b></td>
      <td>${r.lat == null ? "—" : Number(r.lat).toFixed(5)}</td>
      <td>${r.lng == null ? "—" : Number(r.lng).toFixed(5)}</td>
      <td>${r.accuracy == null ? "—" : `±${Math.round(r.accuracy)}m`}</td>
      <td>${escapeHtml(r.method || "")}</td>
    `;
    tbody.appendChild(tr);
  }
}

function exportCSV() {
  const rows = appData.attendance.filter(a => a.userId === currentUser.id);
  if (!rows.length) return toast("No records to export", "warning");

  let csv = "Date,Time,Similarity,Lat,Lng,Accuracy,Method\n";
  for (const r of rows) {
    csv += `"${r.date}","${r.time || ""}","${r.similarity ?? ""}",`;
    csv += `"${r.lat ?? ""}","${r.lng ?? ""}","${r.accuracy ?? ""}","${(r.method || "").replace(/"/g,'""')}"\n`;
  }

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance_${currentUser.username}_${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("Exported CSV", "success");
}

// ================================
// LOGS + TOAST + UTILS
// ================================
function log(action, details) {
  appData.logs = appData.logs || [];
  appData.logs.unshift({ id: Date.now(), ts: iso(), userId: currentUser?.id ?? null, action, details });
  if (appData.logs.length > 500) appData.logs = appData.logs.slice(0, 500);
  saveAppData();
}

function toast(msg, type="info") {
  const wrap = byId("toastContainer");
  const el = document.createElement("div");
  el.className = "fx-toast";
  const dot = document.createElement("div");
  dot.className = "fx-dot";
  dot.style.background =
    type === "success" ? "var(--ok)" :
    type === "error" ? "var(--danger)" :
    type === "warning" ? "var(--warn)" : "var(--pri)";
  const text = document.createElement("div");
  text.innerHTML = `<div style="font-weight:800">${escapeHtml(msg)}</div>`;
  el.appendChild(dot);
  el.appendChild(text);
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(6px)";
    el.style.transition = "all .25s ease";
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}. (This JS auto-creates UI; if you removed it, re-check.)`);
  return el;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}