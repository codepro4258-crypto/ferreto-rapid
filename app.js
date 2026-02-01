/**
 * FERRETTO EDU PRO v3.0 - ENTERPRISE EDITION (UPDATED)
 * ✅ REAL Biometric Attendance (Camera + face embeddings) working on mobile/desktop
 * Requirements:
 *  1) Serve on HTTPS (or localhost) for camera
 *  2) Add this in HTML <head>:
 *     <script defer src="https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js"></script>
 *  3) Ensure you have these elements in HTML:
 *     - Face Registration Modal: <video id="regVideo" autoplay muted playsinline></video>
 *     - Attendance Section:      <video id="attVideo" autoplay muted playsinline></video>
 * (You can keep your existing UI; only these IDs must exist)
 */

// =========================================
// 1. ENTERPRISE CONFIGURATION
// =========================================
const ENTERPRISE_CONFIG = {
  APP_NAME: "Ferretto Edu Pro v3.0",
  VERSION: "3.0.2",
  BUILD_DATE: "2026-02-01",

  // Biometric Configuration
  FACE: {
    REG_FRAMES: 30,
    VERIFICATION_STEPS: 5,
    // THRESHOLD here is legacy; real matching uses FACE_PATCH.matchThreshold
    THRESHOLD: 0.85,
    HIGH_CONFIDENCE: 0.92,
  },

  // Security
  SESSION_TIMEOUT: 30 * 60 * 1000,
  MAX_LOGIN_ATTEMPTS: 5,

  // Storage
  MAX_STORAGE_MB: 100,
  AUTO_SAVE_INTERVAL: 10000,

  // Features
  ENABLE_REAL_TIME: true,
  ENABLE_ANALYTICS: true,
  ENABLE_BACKUP: true,
};

// =========================================
// 2. GLOBAL VARIABLES
// =========================================
let currentUser = null;
let appData = null;
let mainEditor = null;
let materialEditor = null;
let viewProjectEditor = null;
let currentUpload = null;
let currentViewProject = null;
let activeSessions = new Set();
let currentGroupId = null;
let groupFilter = "";
let registrationInterval = null;
let registrationSamples = 0;
let registrationUserId = null;
let attendanceScanInterval = null;

// =========================================
// 3. REAL BIOMETRIC (FACE) PATCH — WORKS ON MOBILE/DESKTOP
// =========================================
const FACE_PATCH = {
  // "tiny" recommended for mobile (fast). Set "full" for more accuracy.
  detector: "tiny",

  // Cosine similarity threshold (0..1). 0.62 is a good mobile default.
  matchThreshold: 0.62,

  // Registration
  regSamplesTarget: ENTERPRISE_CONFIG.FACE.REG_FRAMES,
  regSampleIntervalMs: 160,

  // Attendance scanning timeout
  scanTimeoutMs: 15000,
};

// Models hosted by the CDN package
const FACE_MODEL_BASE = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";

let faceModelsLoaded = false;
let regStream = null;
let attStream = null;
let regSampleDescriptors = []; // Float32Array[]

// ---- FACE helpers
function isSecureContextOK() {
  return window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

function toFloat32(descLike) {
  if (!descLike) return null;
  if (descLike instanceof Float32Array) return descLike;
  if (Array.isArray(descLike)) return new Float32Array(descLike);
  if (typeof descLike === "object" && Array.isArray(descLike.data)) return new Float32Array(descLike.data);
  return null;
}

function serializeDescriptor(float32) {
  if (!float32) return null;
  return Array.from(float32);
}

function cosineSimilarity(a, b) {
  a = toFloat32(a);
  b = toFloat32(b);
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  na = Math.sqrt(na);
  nb = Math.sqrt(nb);
  if (na === 0 || nb === 0) return -1;
  return dot / (na * nb);
}

function avgDescriptor(list) {
  if (!list.length) return null;
  const len = list[0].length;
  const out = new Float32Array(len);
  for (const d of list) {
    for (let i = 0; i < len; i++) out[i] += d[i];
  }
  for (let i = 0; i < len; i++) out[i] /= list.length;
  return out;
}

async function ensureFaceModels() {
  if (faceModelsLoaded) return true;
  if (!window.faceapi) {
    showToast("face-api.js not loaded. Add the script in <head>.", "error");
    return false;
  }
  try {
    if (FACE_PATCH.detector === "tiny") {
      await faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_BASE);
    } else {
      await faceapi.nets.ssdMobilenetv1.loadFromUri(FACE_MODEL_BASE);
    }
    await faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_BASE);
    await faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_BASE);
    faceModelsLoaded = true;
    return true;
  } catch (e) {
    console.error(e);
    showToast("Failed to load face models. Check network/HTTPS.", "error");
    return false;
  }
}

function getDetectorOptions() {
  if (!window.faceapi) return null;
  if (FACE_PATCH.detector === "tiny") {
    return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
  }
  return new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 });
}

async function startCamera(videoEl, preferFront = true) {
  if (!videoEl) throw new Error("Video element missing");
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera not supported on this browser");
  if (!isSecureContextOK()) throw new Error("Camera requires HTTPS (or localhost).");

  videoEl.setAttribute("playsinline", "true");
  videoEl.muted = true;
  videoEl.autoplay = true;

  const constraints = {
    audio: false,
    video: {
      facingMode: preferFront ? "user" : "environment",
      width: { ideal: 640 },
      height: { ideal: 480 },
    },
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  videoEl.srcObject = stream;

  await new Promise((res) => {
    if (videoEl.readyState >= 2) return res();
    videoEl.onloadeddata = () => res();
  });

  try {
    await videoEl.play();
  } catch (_) {}

  return stream;
}

function stopCameraStream(stream) {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}

async function captureDescriptorFromVideo(videoEl) {
  const opts = getDetectorOptions();
  if (!opts) return null;

  const result = await faceapi
    .detectSingleFace(videoEl, opts)
    .withFaceLandmarks()
    .withFaceDescriptor();

  return result?.descriptor || null; // Float32Array(128)
}

function normalizeUserDescriptors() {
  if (!appData?.users) return;
  appData.users = appData.users.map((u) => ({
    ...u,
    faceDescriptor: u.faceDescriptor ? serializeDescriptor(toFloat32(u.faceDescriptor)) : null,
  }));
}

// =========================================
// 4. INITIALIZATION
// =========================================
function initializeApp() {
  loadAppData();
  checkAuth();
  setupEventListeners();
  initGeolocation();

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║ Ferretto Edu Pro v3.0 - Enterprise Edition                  ║
║ REAL Face Attendance enabled                                ║
╚══════════════════════════════════════════════════════════════╝
  `);
}

function loadAppData() {
  try {
    const stored = localStorage.getItem("ferretto_edu_pro_data");
    if (!stored) {
      appData = getDefaultData();
      localStorage.setItem("ferretto_edu_pro_data", JSON.stringify(appData));
      console.log("Initialized with default data");
    } else {
      appData = JSON.parse(stored);
      ensureDataIntegrity();
      console.log("Loaded existing data");
    }

    // Normalize faceDescriptor storage
    normalizeUserDescriptors();
    saveAppData();
  } catch (error) {
    console.error("Failed to load app data:", error);
    appData = getDefaultData();
    normalizeUserDescriptors();
  }
}

function saveAppData() {
  try {
    localStorage.setItem("ferretto_edu_pro_data", JSON.stringify(appData));
    return true;
  } catch (error) {
    console.error("Failed to save app data:", error);
    showToast("Failed to save data", "error");
    return false;
  }
}

// =========================================
// 5. DEFAULT DATA & INTEGRITY
// =========================================
function getDefaultData() {
  return {
    users: [
      {
        id: 1,
        username: "admin",
        password: "admin12345",
        email: "admin@ferretto.edu",
        name: "System Administrator",
        role: "admin",
        courseId: null,
        faceDescriptor: null,
        createdAt: "2023-01-01",
        lastLogin: null,
        status: "active",
        preferences: {},
        likedProjects: [],
        notes: "System administrator account",
      },
      {
        id: 2,
        username: "student",
        password: "student123",
        email: "student@ferretto.edu",
        name: "John Student",
        role: "student",
        courseId: 101,
        faceDescriptor: null,
        createdAt: "2023-01-01",
        lastLogin: null,
        status: "active",
        preferences: {},
        likedProjects: [],
        notes: "Demo student account",
      },
      {
        id: 3,
        username: "lecturer",
        password: "lecturer123",
        email: "lecturer@ferretto.edu",
        name: "Dr. Sarah Connor",
        role: "lecturer",
        courseId: 101,
        faceDescriptor: null,
        createdAt: "2023-01-01",
        lastLogin: null,
        status: "active",
        preferences: {},
        likedProjects: [],
        notes: "Demo lecturer account",
      },
    ],
    courses: [
      {
        id: 101,
        code: "CS101",
        name: "Introduction to Web Development",
        lecturer: "Dr. Sarah Connor",
        schedule: "Mon, Wed 09:00 AM",
        credits: 3,
        description:
          "Comprehensive introduction to HTML, CSS, and JavaScript. Learn to build modern responsive websites.",
        students: [2],
        materials: [1, 2],
        createdAt: "2023-09-01",
      },
      {
        id: 102,
        code: "CS202",
        name: "Data Structures & Algorithms",
        lecturer: "Prof. Alan Turing",
        schedule: "Tue, Thu 11:00 AM",
        credits: 4,
        description: "Advanced study of data structures, algorithms, and computational complexity.",
        students: [],
        materials: [],
        createdAt: "2023-09-01",
      },
    ],
    materials: [
      {
        id: 1,
        courseId: 101,
        title: "HTML5 Complete Guide",
        type: "pdf",
        content: "https://example.com/html5-guide.pdf",
        description: "Complete reference guide for HTML5 elements and APIs.",
        fileSize: "2.4 MB",
        downloads: 0,
        tags: ["html", "web", "beginners"],
        date: "2023-10-01",
        author: "Dr. Sarah Connor",
      },
      {
        id: 2,
        courseId: 101,
        title: "CSS Flexbox Examples",
        type: "code",
        content: `.container {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n}\n\n.item {\n  flex: 1;\n  margin: 10px;\n}`,
        description: "Practical examples of CSS Flexbox layouts.",
        fileSize: "15 KB",
        downloads: 0,
        tags: ["css", "layout", "flexbox"],
        language: "css",
        date: "2023-10-05",
        author: "Dr. Sarah Connor",
      },
      {
        id: 3,
        courseId: 101,
        title: "JavaScript Basics Tutorial",
        type: "link",
        content: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
        description: "MDN Web Docs JavaScript tutorial for beginners.",
        fileSize: "N/A",
        downloads: 0,
        tags: ["javascript", "tutorial", "mdn"],
        date: "2023-10-10",
        author: "Dr. Sarah Connor",
      },
    ],
    attendance: [
      {
        id: 1,
        userId: 2,
        courseId: 101,
        date: new Date().toISOString().split("T")[0],
        time: "09:05:22",
        lat: 40.7128,
        lng: -74.006,
        confidence: 0.94,
        status: "Present",
        method: "Face Scan",
        notes: "On time",
        verified: true,
      },
    ],
    projects: [],
    groups: [
      {
        id: 1001,
        name: "Frontend Builders",
        description: "Share UI ideas, snippets, and layout feedback.",
        createdBy: 1,
        memberIds: [1, 2, 3],
        createdAt: "2023-10-18T09:00:00",
        updatedAt: "2023-10-18T09:00:00",
      },
    ],
    groupMessages: [
      {
        id: 9001,
        groupId: 1001,
        userId: 1,
        content: "Welcome team! Share HTML/CSS snippets using ``` for code blocks.",
        createdAt: "2023-10-18T09:10:00",
      },
    ],
    systemLogs: [],
    analytics: {
      dailyActiveUsers: {},
      attendanceStats: {},
      projectStats: {},
      materialDownloads: {},
    },
    metadata: {
      version: ENTERPRISE_CONFIG.VERSION,
      lastBackup: null,
      totalUsers: 3,
      totalProjects: 0,
      totalAttendance: 1,
    },
  };
}

function ensureDataIntegrity() {
  appData.users = appData.users || [];
  appData.courses = appData.courses || [];
  appData.materials = appData.materials || [];
  appData.attendance = appData.attendance || [];
  appData.projects = appData.projects || [];
  appData.groups = appData.groups || [];
  appData.groupMessages = appData.groupMessages || [];
  appData.systemLogs = appData.systemLogs || [];
  appData.analytics = appData.analytics || {
    dailyActiveUsers: {},
    attendanceStats: {},
    projectStats: {},
    materialDownloads: {},
  };
  appData.metadata = appData.metadata || {};
}

// =========================================
// 6. AUTHENTICATION & SESSION MANAGEMENT
// =========================================
function checkAuth() {
  const storedUser = sessionStorage.getItem("currentUser");
  if (storedUser) {
    currentUser = JSON.parse(storedUser);
    activeSessions.add(currentUser.id);
    showDashboard();
  } else {
    showLogin();
  }
}

function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    showToast("Please enter both username and password", "error");
    return;
  }

  const user = appData.users.find(
    (u) => u.username === username && u.password === password && u.status === "active"
  );

  if (user) {
    currentUser = user;
    activeSessions.add(user.id);

    const userIndex = appData.users.findIndex((u) => u.id === user.id);
    if (userIndex > -1) {
      appData.users[userIndex].lastLogin = new Date().toISOString();
      saveAppData();
    }

    sessionStorage.setItem("currentUser", JSON.stringify(user));
    logSystem("LOGIN", `User ${username} logged in`, user.id);

    showToast(`Welcome back, ${user.name}!`, "success");
    showDashboard();
  } else {
    logSystem("LOGIN_FAILED", `Failed login attempt for username: ${username}`);
    showToast("Invalid username or password", "error");
  }
}

function handleLogout() {
  try {
    stopAttendanceScanner();
    stopRegistrationProcess();
  } catch (_) {}

  if (currentUser) {
    logSystem("LOGOUT", `User ${currentUser.username} logged out`, currentUser.id);
    activeSessions.delete(currentUser.id);
  }

  currentUser = null;
  sessionStorage.removeItem("currentUser");
  showLogin();
  showToast("Logged out successfully", "info");
}

function showLogin() {
  document.getElementById("loginPage").style.display = "flex";
  document.getElementById("dashboardPage").classList.remove("active");
  document.getElementById("loginForm").reset();

  setTimeout(() => document.getElementById("username").focus(), 100);
}

function showDashboard() {
  document.getElementById("loginPage").style.display = "none";
  document.getElementById("dashboardPage").classList.add("active");

  document.getElementById("userName").textContent = currentUser.name;
  document.getElementById("userRole").textContent = currentUser.role.toUpperCase();
  document.getElementById("userAvatar").textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById("dropdownUserName").textContent = currentUser.name;
  document.getElementById("welcomeName").textContent = currentUser.name;

  if (currentUser.role === "admin") {
    document.getElementById("adminCategory").style.display = "block";
    document.getElementById("adminUsersLink").style.display = "flex";
    document.getElementById("adminCoursesLink").style.display = "flex";
    document.getElementById("adminMaterialsLink").style.display = "flex";
    document.getElementById("adminDashboardLink").style.display = "flex";
  } else {
    document.getElementById("adminCategory").style.display = "none";
    document.getElementById("adminUsersLink").style.display = "none";
    document.getElementById("adminCoursesLink").style.display = "none";
    document.getElementById("adminMaterialsLink").style.display = "none";
    document.getElementById("adminDashboardLink").style.display = "none";
  }

  const createGroupBtn = document.getElementById("createGroupBtn");
  if (createGroupBtn) createGroupBtn.style.display = currentUser.role === "admin" ? "inline-flex" : "none";

  initSidebar();
  initCodeEditors();

  refreshDashboard();
  updateAttendanceFaceStatus();
  groupFilter = "";

  startSessionMonitor();
}

function startSessionMonitor() {
  setInterval(() => {
    const lastActivity = sessionStorage.getItem("lastActivity");
    if (lastActivity && Date.now() - parseInt(lastActivity) > ENTERPRISE_CONFIG.SESSION_TIMEOUT) {
      showToast("Session timeout due to inactivity", "warning");
      handleLogout();
    }
  }, 60000);
}

function updateActivity() {
  sessionStorage.setItem("lastActivity", Date.now().toString());
}

// =========================================
// 7. DASHBOARD (KEEP YOUR ORIGINAL OR EXTEND)
// =========================================
function refreshDashboard() {
  if (!currentUser) return;

  if (currentUser.courseId) {
    const course = appData.courses.find((c) => c.id == currentUser.courseId);
    if (course) {
      document.getElementById("statCourseName").textContent = course.name;
      document.getElementById("statCourseCode").textContent = course.code;
    } else {
      document.getElementById("statCourseName").textContent = "Unassigned";
      document.getElementById("statCourseCode").textContent = "Contact Admin";
    }
  } else {
    document.getElementById("statCourseName").textContent = "No Course";
    document.getElementById("statCourseCode").textContent = "-";
  }

  const myProjects = appData.projects.filter((p) => p.userId === currentUser.id);
  document.getElementById("statProjects").textContent = myProjects.length;

  const totalLikes = myProjects.reduce((sum, p) => sum + (p.likes || 0), 0);
  document.getElementById("statLikes").textContent = totalLikes;

  const myAttendance = appData.attendance.filter((a) => a.userId === currentUser.id);
  const present = myAttendance.filter((a) => a.status === "Present").length;
  const rate = myAttendance.length > 0 ? Math.round((present / myAttendance.length) * 100) : 0;
  document.getElementById("statAttendance").textContent = rate + "%";

  updateRecentActivity();
  updateAttendanceBadge();
}

// =========================================
// 8. GEOLOCATION
// =========================================
function initGeolocation() {
  if (!("geolocation" in navigator)) return;

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const geoStatus = document.getElementById("geoStatus");
      if (geoStatus) {
        geoStatus.innerHTML = `
          <i class="fas fa-map-marker-alt text-success"></i>
          Location: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}
        `;
      }
    },
    (error) => console.warn("Geolocation error:", error),
    { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 }
  );
}

// =========================================
// 9. ATTENDANCE SYSTEM (REAL FACE MATCH)
// =========================================
async function testFaceVerification() {
  try {
    const me = appData.users.find((u) => u.id === currentUser.id);
    if (!me?.faceDescriptor) return showToast("Face ID not registered.", "warning");

    const ok = await ensureFaceModels();
    if (!ok) return;

    updateAttendanceScannerStatus("Testing", true);

    const v = document.getElementById("attVideo");
    attStream = await startCamera(v, true);

    const live = await captureDescriptorFromVideo(v);
    const sim = cosineSimilarity(live, me.faceDescriptor);

    stopAttendanceScanner();

    if (sim >= FACE_PATCH.matchThreshold) {
      showToast(`Test Passed (Similarity ${(sim * 100).toFixed(1)}%)`, "success");
      updateAttendanceScannerStatus("Test Passed", false);
    } else {
      showToast(`Test Failed (Similarity ${(sim * 100).toFixed(1)}%)`, "error");
      updateAttendanceScannerStatus("Test Failed", false);
    }
  } catch (e) {
    console.error(e);
    stopAttendanceScanner();
    showToast(e.message || "Verification test failed", "error");
  }
}

async function startAttendanceScanner() {
  try {
    const me = appData.users.find((u) => u.id === currentUser.id);
    if (!me?.faceDescriptor) {
      showToast("Face ID not registered. Contact admin.", "warning");
      return;
    }

    const ok = await ensureFaceModels();
    if (!ok) return;

    const today = new Date().toISOString().split("T")[0];
    const alreadyMarked = appData.attendance.some(
      (a) => a.userId === currentUser.id && a.date === today && a.status === "Present"
    );
    if (alreadyMarked && !confirm("Attendance already marked today. Mark again?")) return;

    showToast("Starting camera…", "info");
    updateAttendanceScannerStatus("Scanning", true);

    document.getElementById("btnStartAttendance")?.classList.add("hidden");
    document.getElementById("btnStopAttendance")?.classList.remove("hidden");

    const v = document.getElementById("attVideo");
    attStream = await startCamera(v, true);

    const start = Date.now();
    let bestSim = -1;

    const scanLoop = async () => {
      if (!attStream) return;

      const live = await captureDescriptorFromVideo(v);
      if (live) {
        const sim = cosineSimilarity(live, me.faceDescriptor);
        if (sim > bestSim) bestSim = sim;

        if (sim >= FACE_PATCH.matchThreshold) {
          const coords = await new Promise((res) => {
            if (!navigator.geolocation) return res({ latitude: null, longitude: null, accuracy: null });
            navigator.geolocation.getCurrentPosition(
              (p) => res({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
              () => res({ latitude: null, longitude: null, accuracy: null }),
              { enableHighAccuracy: true, timeout: 5000, maximumAge: 1000 }
            );
          });

          markAttendanceSuccess(coords, sim);
          stopAttendanceScanner();
          return;
        }
      }

      if (Date.now() - start > FACE_PATCH.scanTimeoutMs) {
        stopAttendanceScanner();
        showToast(
          `Face not matched. Best ${(bestSim * 100).toFixed(1)}% (need ${(FACE_PATCH.matchThreshold * 100).toFixed(0)}%).`,
          "warning"
        );
        updateAttendanceScannerStatus("No Match", false);
        return;
      }

      attendanceScanInterval = setTimeout(scanLoop, 250);
    };

    scanLoop();
  } catch (e) {
    console.error(e);
    stopAttendanceScanner();
    showToast(e.message || "Attendance scanner failed", "error");
  }
}

function stopAttendanceScanner() {
  if (attendanceScanInterval) {
    clearTimeout(attendanceScanInterval);
    attendanceScanInterval = null;
  }

  updateAttendanceScannerStatus("Camera Off", false);

  document.getElementById("btnStartAttendance")?.classList.remove("hidden");
  document.getElementById("btnStopAttendance")?.classList.add("hidden");

  const v = document.getElementById("attVideo");
  if (v) v.srcObject = null;

  stopCameraStream(attStream);
  attStream = null;
}

function markAttendanceSuccess(coords, confidence) {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0];

  const attendanceRecord = {
    id: Date.now(),
    userId: currentUser.id,
    courseId: currentUser.courseId,
    date: dateStr,
    time: timeStr,
    lat: coords?.latitude ?? null,
    lng: coords?.longitude ?? null,
    locationAccuracy: coords?.accuracy ?? null,
    confidence: Math.round(confidence * 100) / 100,
    status: "Present",
    method: "REAL Face Biometric (face-api.js)",
    notes: "Live camera face verification",
    verified: true,
    device: navigator.userAgent,
  };

  appData.attendance.push(attendanceRecord);
  saveAppData();

  showToast(`Attendance marked successfully at ${timeStr}`, "success");
  logSystem(
    "ATTENDANCE",
    `Marked attendance (similarity ${Math.round(confidence * 100)}%)`,
    currentUser.id
  );

  updateAttendanceBadge();
  loadAttendanceHistory();
  refreshDashboard();

  setTimeout(() => {
    alert(`✅ Attendance Confirmed!\n\nDate: ${dateStr}\nTime: ${timeStr}\nSimilarity: ${Math.round(confidence * 100)}%`);
  }, 400);
}

function updateAttendanceScannerStatus(label, isActive) {
  const statusDot = document.getElementById("attendanceStatusDot");
  const statusText = document.getElementById("attendanceStatusText");
  const hudStatus = document.getElementById("attHudStatus");

  if (statusDot && statusText) {
    statusText.textContent = label;
    statusDot.classList.toggle("active", isActive);
  }
  if (hudStatus) hudStatus.textContent = `STATUS: ${label.toUpperCase()}`;
}

function updateAttendanceFaceStatus() {
  const statusWrap = document.getElementById("attendanceFaceStatus");
  if (!statusWrap) return;

  // Use fresh data from appData (because session stored user may be stale)
  const me = appData?.users?.find((u) => u.id === currentUser?.id) || currentUser;
  const registered = Boolean(me?.faceDescriptor);

  statusWrap.innerHTML = registered
    ? `<span class="badge badge-success"><i class="fas fa-user-check"></i> Face ID Registered</span>`
    : `<span class="badge badge-warning"><i class="fas fa-user-shield"></i> Face ID Not Registered</span>`;
}

// =========================================
// 10. BIOMETRIC REGISTRATION (REAL CAMERA + EMBEDDING)
// =========================================
function openFaceRegistration(userId) {
  const user = appData.users.find((u) => u.id === userId);
  if (!user) return;

  registrationUserId = userId;
  registrationSamples = 0;
  regSampleDescriptors = [];
  updateRegistrationUI("Idle", 0);

  const nameEl = document.getElementById("regUserName");
  if (nameEl) nameEl.textContent = user.name;

  const samplesGrid = document.getElementById("registrationSamplesGrid");
  if (samplesGrid) {
    samplesGrid.innerHTML = "";
    samplesGrid.style.display = "none";
  }

  openModal("faceRegistrationModal");
}

async function testRegistrationCamera() {
  try {
    const ok = await ensureFaceModels();
    if (!ok) return;

    const v = document.getElementById("regVideo");
    regStream = await startCamera(v, true);
    showToast("Camera + Face models OK", "success");
  } catch (e) {
    showToast(e.message || "Camera test failed", "error");
  }
}

async function startRegistrationProcess() {
  try {
    if (!registrationUserId) return showToast("Select a user to register", "warning");
    if (registrationInterval) return;

    const ok = await ensureFaceModels();
    if (!ok) return;

    const v = document.getElementById("regVideo");
    regSampleDescriptors = [];
    registrationSamples = 0;

    regStream = await startCamera(v, true);

    updateRegistrationUI("Capturing", 0);
    document.getElementById("btnStartReg")?.classList.add("hidden");
    document.getElementById("btnStopReg")?.classList.remove("hidden");

    const total = FACE_PATCH.regSamplesTarget;

    registrationInterval = setInterval(async () => {
      try {
        const desc = await captureDescriptorFromVideo(v);
        if (desc) {
          regSampleDescriptors.push(desc);
          registrationSamples += 1;

          const progress = Math.min(100, Math.round((registrationSamples / total) * 100));
          updateRegistrationUI("Capturing", progress);
        }

        if (registrationSamples >= total) {
          await finalizeFaceRegistration();
        }
      } catch (err) {
        console.warn("registration tick", err);
      }
    }, FACE_PATCH.regSampleIntervalMs);
  } catch (e) {
    console.error(e);
    showToast(e.message || "Registration failed to start", "error");
    stopRegistrationProcess();
  }
}

function stopRegistrationProcess() {
  if (registrationInterval) {
    clearInterval(registrationInterval);
    registrationInterval = null;
  }
  registrationSamples = 0;
  regSampleDescriptors = [];
  updateRegistrationUI("Cancelled", 0);

  document.getElementById("btnStartReg")?.classList.remove("hidden");
  document.getElementById("btnStopReg")?.classList.add("hidden");

  const v = document.getElementById("regVideo");
  if (v) v.srcObject = null;

  stopCameraStream(regStream);
  regStream = null;

  showToast("Face registration cancelled", "warning");
}

async function finalizeFaceRegistration() {
  if (registrationInterval) {
    clearInterval(registrationInterval);
    registrationInterval = null;
  }

  // need some minimum valid captures
  const minNeeded = Math.max(6, Math.floor(FACE_PATCH.regSamplesTarget * 0.5));
  if (regSampleDescriptors.length < minNeeded) {
    updateRegistrationUI("Low Samples", 0);
    showToast("Face not captured reliably. Improve light + keep face steady.", "error");
    stopRegistrationProcess();
    return;
  }

  const avg = avgDescriptor(regSampleDescriptors);
  const userIndex = appData.users.findIndex((u) => u.id === registrationUserId);
  if (userIndex === -1) return;

  appData.users[userIndex].faceDescriptor = serializeDescriptor(avg);
  appData.users[userIndex].updatedAt = new Date().toISOString();

  saveAppData();

  updateRegistrationUI("Completed", 100);
  document.getElementById("btnStartReg")?.classList.remove("hidden");
  document.getElementById("btnStopReg")?.classList.add("hidden");

  const v = document.getElementById("regVideo");
  if (v) v.srcObject = null;
  stopCameraStream(regStream);
  regStream = null;

  showToast("Face registration completed (REAL)", "success");

  // If current user registered, update session user too
  if (currentUser?.id === registrationUserId) {
    currentUser = { ...appData.users[userIndex] };
    sessionStorage.setItem("currentUser", JSON.stringify(currentUser));
  }

  loadAdminUsers?.();
  updateAttendanceFaceStatus();
}

function updateRegistrationUI(status, progress) {
  const regStatusText = document.getElementById("regStatusText");
  const regStatusDot = document.getElementById("regStatusDot");
  const regHudSamples = document.getElementById("regHudSamples");
  const regProgressWrap = document.getElementById("regProgressWrap");
  const regProgressBar = document.getElementById("regProgressBar");

  if (regStatusText) regStatusText.textContent = status;
  if (regStatusDot) regStatusDot.classList.toggle("active", status === "Capturing");
  if (regHudSamples)
    regHudSamples.textContent = `SAMPLES: ${registrationSamples}/${ENTERPRISE_CONFIG.FACE.REG_FRAMES}`;
  if (regProgressWrap) regProgressWrap.classList.toggle("hidden", progress === 0);
  if (regProgressBar) regProgressBar.style.width = `${progress}%`;
}

// =========================================
// 11. (YOUR ORIGINAL FEATURES)
// IMPORTANT: Keep your existing implementations for:
// - Study materials
// - Projects
// - Groups
// - Admin users/courses/materials
// - UI rendering helpers
// This file focuses on delivering a working real biometric patch.
// If you want, paste your remaining code and I will merge it 100% end-to-end.
// =========================================

// =========================================
// 12. ATTENDANCE TABLE + EXPORT (KEEP YOUR ORIGINAL)
// =========================================
function loadAttendanceHistory() {
  const tbody = document.getElementById("fullAttendanceTable");
  if (!tbody) return;

  const records = appData.attendance.filter((a) => a.userId === currentUser.id);

  records.sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time || "00:00:00"}`);
    const dateB = new Date(`${b.date}T${b.time || "00:00:00"}`);
    return dateB - dateA;
  });

  if (records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-8">
          <i class="fas fa-calendar-times fa-2x mb-4 text-gray-300"></i>
          <p class="text-gray-500">No attendance records found.</p>
          <button class="btn btn-primary mt-4" onclick="startAttendanceScanner()">
            <i class="fas fa-camera"></i> Mark First Attendance
          </button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";
  records.forEach((record) => {
    const course = appData.courses.find((c) => c.id == record.courseId);
    const locStr =
      record.lat != null && record.lng != null ? `${Number(record.lat).toFixed(4)}, ${Number(record.lng).toFixed(4)}` : "N/A";

    const confidence =
      record.confidence != null
        ? `<span class="font-bold ${
            record.confidence > 0.75 ? "text-success" : record.confidence > 0.6 ? "text-warning" : "text-danger"
          }">${Math.round(record.confidence * 100)}%</span>`
        : "N/A";

    const statusClass =
      record.status === "Present"
        ? "badge-success"
        : record.status === "Absent"
        ? "badge-danger"
        : record.status === "Late"
        ? "badge-warning"
        : "badge-info";

    tbody.innerHTML += `
      <tr>
        <td>
          <div class="font-medium">${record.date}</div>
          <div class="text-xs text-gray">${record.time || ""}</div>
        </td>
        <td>${course ? course.name : "General"}</td>
        <td>
          <div class="text-sm">${locStr}</div>
          ${record.locationAccuracy ? `<div class="text-xs text-gray">±${Math.round(record.locationAccuracy)}m</div>` : ""}
        </td>
        <td><span class="badge badge-info">${record.method}</span></td>
        <td>${confidence}</td>
        <td><span class="badge ${statusClass}">${record.status}</span></td>
      </tr>
    `;
  });
}

function exportAttendanceCSV() {
  const records = appData.attendance.filter((a) => a.userId === currentUser.id);
  if (!records.length) return showToast("No attendance records to export", "warning");

  let csv = "Date,Time,Course,Latitude,Longitude,Accuracy,Method,Similarity,Status\n";
  records.forEach((record) => {
    const course = appData.courses.find((c) => c.id === record.courseId);
    const courseName = course ? course.name : "General";

    csv += `"${record.date}","${record.time || ""}","${courseName}",`;
    csv += `${record.lat ?? ""},${record.lng ?? ""},${record.locationAccuracy ?? ""},"${record.method}",`;
    csv += `${record.confidence ?? ""},"${record.status}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance_${currentUser.username}_${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast("Attendance data exported as CSV", "success");
  logSystem("EXPORT", "Exported attendance CSV", currentUser.id);
}

// =========================================
// 13. SIDEBAR / SECTIONS (MINIMAL — KEEP YOUR ORIGINAL IF EXISTS)
// =========================================
function showSection(sectionId) {
  document.querySelectorAll(".menu-item").forEach((item) => item.classList.remove("active"));
  const activeLink = document.querySelector(`.menu-item[data-section="${sectionId}"]`);
  if (activeLink) activeLink.classList.add("active");

  document.querySelectorAll(".content-section").forEach((section) => section.classList.remove("active"));
  const activeSection = document.getElementById(sectionId);
  if (activeSection) activeSection.classList.add("active");
}

function initSidebar() {
  updateAttendanceBadge?.();
  document.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      const section = item.getAttribute("data-section");
      showSection(section);
      document.getElementById("sidebar")?.classList.remove("mobile-open");
    });
  });
}

function toggleSidebar() {
  document.getElementById("sidebar")?.classList.toggle("mobile-open");
}

function toggleUserDropdown() {
  const dropdown = document.getElementById("userDropdown");
  if (!dropdown) return;
  dropdown.classList.toggle("show");

  document.addEventListener("click", function closeDropdown(e) {
    if (!dropdown.contains(e.target) && e.target.id !== "userAvatar") {
      dropdown.classList.remove("show");
      document.removeEventListener("click", closeDropdown);
    }
  });
}

// =========================================
// 14. BADGES + RECENT ACTIVITY (SAFE DEFAULTS)
// =========================================
function updateAttendanceBadge() {
  if (!currentUser) return;
  const today = new Date().toISOString().split("T")[0];
  const todayAttendance = appData.attendance.filter((a) => a.userId === currentUser.id && a.date === today).length;

  const badge = document.getElementById("attendanceBadge");
  if (!badge) return;
  badge.textContent = todayAttendance > 0 ? "✓" : "0";
  badge.style.background = todayAttendance > 0 ? "var(--success)" : "var(--warning)";
}

function updateRecentActivity() {
  const tbody = document.getElementById("recentActivityTable");
  if (!tbody) return;
  tbody.innerHTML = "";

  const activities = [];
  const recentAtt = appData.attendance.filter((a) => a.userId === currentUser.id).slice(-3).reverse();

  recentAtt.forEach((att) => {
    const course = appData.courses.find((c) => c.id == att.courseId);
    activities.push({
      date: `${att.date} ${att.time || ""}`,
      activity: "Attendance",
      details: course ? course.name : "General",
      status: att.status,
    });
  });

  if (!activities.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-gray py-8">
          <i class="fas fa-inbox fa-2x mb-4 opacity-30"></i>
          <p>No recent activity</p>
        </td>
      </tr>
    `;
    return;
  }

  activities.forEach((act) => {
    const statusClass =
      act.status === "Present" || act.status === "Public"
        ? "badge-success"
        : act.status === "Absent"
        ? "badge-danger"
        : "badge-info";

    tbody.innerHTML += `
      <tr>
        <td class="font-medium">${act.date}</td>
        <td>${act.activity}</td>
        <td>${act.details}</td>
        <td><span class="badge ${statusClass}">${act.status}</span></td>
      </tr>
    `;
  });
}

// =========================================
// 15. CODE EDITORS (KEEP YOUR ORIGINAL IF NEEDED)
// =========================================
function initCodeEditors() {
  // Keep your existing CodeMirror init here (unchanged).
  // This placeholder prevents runtime errors if you call it.
}

// =========================================
// 16. MODALS + TOASTS + LOGS (KEEP)
// =========================================
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("open");
    document.body.style.overflow = "hidden";
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove("open");
    document.body.style.overflow = "";
  }
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) {
    // fallback
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let icon = "fa-check-circle";
  if (type === "error") icon = "fa-exclamation-circle";
  if (type === "warning") icon = "fa-exclamation-triangle";
  if (type === "info") icon = "fa-info-circle";

  toast.innerHTML = `
    <div class="toast-icon"><i class="fas ${icon}"></i></div>
    <div class="flex-1"><div class="font-medium">${message}</div></div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "slideInRight 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function logSystem(action, details, userId = null) {
  const log = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    action,
    details,
    userId: userId || currentUser?.id,
    ip: "local",
    userAgent: navigator.userAgent,
  };

  appData.systemLogs.unshift(log);
  if (appData.systemLogs.length > 1000) appData.systemLogs = appData.systemLogs.slice(0, 1000);
  saveAppData();
  return log;
}

// =========================================
// 17. EVENT LISTENERS SETUP (KEEP YOUR ORIGINAL; SAFE VERSION)
// =========================================
function setupEventListeners() {
  document.getElementById("loginForm")?.addEventListener("submit", handleLogin);

  // modal close on overlay click
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", function (e) {
      if (e.target === this) this.classList.remove("open");
    });
  });

  // Escape closes modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach((modal) => modal.classList.remove("open"));
      document.body.style.overflow = "";
    }
  });

  // Activity monitoring
  document.addEventListener("mousemove", updateActivity);
  document.addEventListener("keypress", updateActivity);
}

// =========================================
// 18. OPTIONAL: HOOK ON DOM READY
// =========================================
document.addEventListener("DOMContentLoaded", initializeApp);