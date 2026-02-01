

/**
• FERRETTO EDU PRO v3.0 - ENTERPRISE EDITION
• Complete working system with all functionalities
*/
// =========================================
// 1. ENTERPRISE CONFIGURATION
// =========================================
const ENTERPRISE_CONFIG = {
APP_NAME: "Ferretto Edu Pro v3.0",
VERSION: "3.0.1",
BUILD_DATE: "2023-10-25",
// Biometric Configuration FACE: { REG_FRAMES: 30, VERIFICATION_STEPS: 5, THRESHOLD: 0.85, HIGH_CONFIDENCE: 0.92, }, // Security SESSION_TIMEOUT: 30 * 60 * 1000, MAX_LOGIN_ATTEMPTS: 5, // Storage MAX_STORAGE_MB: 100, AUTO_SAVE_INTERVAL: 10000, // Features ENABLE_REAL_TIME: true, ENABLE_ANALYTICS: true, ENABLE_BACKUP: true 
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
let groupFilter = '';
let registrationInterval = null;
let registrationSamples = 0;
let registrationUserId = null;
let attendanceScanInterval = null;
// =========================================
// 3. INITIALIZATION
// =========================================
function initializeApp() {
loadAppData();
checkAuth();
setupEventListeners();
initGeolocation();
console.log(` 
╔══════════════════════════════════════════════════════════════╗
║ Ferretto Edu Pro v3.0 - Enterprise Edition ║
║ All systems operational ║
╚══════════════════════════════════════════════════════════════╝
`);
}
function loadAppData() {
try {
const stored = localStorage.getItem('ferretto_edu_pro_data');
if (!stored) {
// Create default data
appData = getDefaultData();
localStorage.setItem('ferretto_edu_pro_data', JSON.stringify(appData));
console.log("Initialized with default data");
} else {
appData = JSON.parse(stored);
ensureDataIntegrity();
console.log("Loaded existing data");
}
} catch (error) {
console.error("Failed to load app data:", error);
appData = getDefaultData();
}
}
function saveAppData() {
try {
localStorage.setItem('ferretto_edu_pro_data', JSON.stringify(appData));
return true;
} catch (error) {
console.error("Failed to save app data:", error);
showToast("Failed to save data", "error");
return false;
}
}
function getDefaultData() {
return {
users: [
{
id: 1,
username: 'admin',
password: 'admin12345',
email: 'admin@ferretto.edu',
name: 'System Administrator',
role: 'admin',
courseId: null,
faceDescriptor: null,
createdAt: '2023-01-01',
lastLogin: null,
status: 'active',
preferences: {},
likedProjects: [],
notes: 'System administrator account'
},
{
id: 2,
username: 'student',
password: 'student123',
email: 'student@ferretto.edu',
name: 'John Student',
role: 'student',
courseId: 101,
faceDescriptor: null,
createdAt: '2023-01-01',
lastLogin: null,
status: 'active',
preferences: {},
likedProjects: [],
notes: 'Demo student account'
},
{
id: 3,
username: 'lecturer',
password: 'lecturer123',
email: 'lecturer@ferretto.edu',
name: 'Dr. Sarah Connor',
role: 'lecturer',
courseId: 101,
faceDescriptor: null,
createdAt: '2023-01-01',
lastLogin: null,
status: 'active',
preferences: {},
likedProjects: [],
notes: 'Demo lecturer account'
}
],
courses: [
{
id: 101,
code: 'CS101',
name: 'Introduction to Web Development',
lecturer: 'Dr. Sarah Connor',
schedule: 'Mon, Wed 09:00 AM',
credits: 3,
description: 'Comprehensive introduction to HTML, CSS, and JavaScript. Learn to build modern responsive websites.',
students: [2],
materials: [1, 2],
createdAt: '2023-09-01'
},
{
id: 102,
code: 'CS202',
name: 'Data Structures & Algorithms',
lecturer: 'Prof. Alan Turing',
schedule: 'Tue, Thu 11:00 AM',
credits: 4,
description: 'Advanced study of data structures, algorithms, and computational complexity.',
students: [],
materials: [],
createdAt: '2023-09-01'
}
],
materials: [
{
id: 1,
courseId: 101,
title: 'HTML5 Complete Guide',
type: 'pdf',
content: 'https://example.com/html5-guide.pdf',
description: 'Complete reference guide for HTML5 elements and APIs.',
fileSize: '2.4 MB',
downloads: 0,
tags: ['html', 'web', 'beginners'],
date: '2023-10-01',
author: 'Dr. Sarah Connor'
},
{
id: 2,
courseId: 101,
title: 'CSS Flexbox Examples',
type: 'code',
content: .container {\n display: flex;\n justify-content: center;\n align-items: center;\n}\n\n.item {\n flex: 1;\n margin: 10px;\n},
description: 'Practical examples of CSS Flexbox layouts.',
fileSize: '15 KB',
downloads: 0,
tags: ['css', 'layout', 'flexbox'],
language: 'css',
date: '2023-10-05',
author: 'Dr. Sarah Connor'
},
{
id: 3,
courseId: 101,
title: 'JavaScript Basics Tutorial',
type: 'link',
content: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
description: 'MDN Web Docs JavaScript tutorial for beginners.',
fileSize: 'N/A',
downloads: 0,
tags: ['javascript', 'tutorial', 'mdn'],
date: '2023-10-10',
author: 'Dr. Sarah Connor'
}
],
attendance: [
{
id: 1,
userId: 2,
courseId: 101,
date: new Date().toISOString().split('T')[0],
time: '09:05:22',
lat: 40.7128,
lng: -74.0060,
confidence: 0.94,
status: 'Present',
method: 'Face Scan',
notes: 'On time',
verified: true
}
],
projects: [
{
id: 1,
userId: 2,
name: 'My First Website',
code: `
My Website body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; } .container { max-width: 800px; margin: 0 auto; text-align: center; padding: 40px; background: rgba(255, 255, 255, 0.1); border-radius: 20px; backdrop-filter: blur(10px); } h1 { font-size: 3rem; margin-bottom: 20px; } button { background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 1rem; cursor: pointer; transition: all 0.3s; } button:hover { background: #4338ca; transform: translateY(-2px); } 
Welcome to My Website!
This is my first web project created in Ferretto Edu Pro.
Click Me! 
`, visibility: 'public', category: 'web', tags: ['html', 'css', 'javascript', 'beginners'], description: 'A simple responsive website with modern design', likes: 5, views: 42, forks: 3, createdAt: '2023-10-20T10:00:00', updatedAt: '2023-10-20T10:00:00' } ], groups: [ { id: 1001, name: 'Frontend Builders', description: 'Share UI ideas, snippets, and layout feedback.', createdBy: 1, memberIds: [1, 2, 3], createdAt: '2023-10-18T09:00:00', updatedAt: '2023-10-18T09:00:00' } ], groupMessages: [ { id: 9001, groupId: 1001, userId: 1, content: 'Welcome team! Share HTML/CSS snippets using ``` for code blocks.', createdAt: '2023-10-18T09:10:00' } ], systemLogs: [], analytics: { dailyActiveUsers: {}, attendanceStats: {}, projectStats: {}, materialDownloads: {} }, metadata: { version: ENTERPRISE_CONFIG.VERSION, lastBackup: null, totalUsers: 3, totalProjects: 1, totalAttendance: 1 } }; } 
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
materialDownloads: {}
};
appData.metadata = appData.metadata || {};
}
// =========================================
// 4. AUTHENTICATION & SESSION MANAGEMENT
// =========================================
function checkAuth() {
const storedUser = sessionStorage.getItem('currentUser');
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
const username = document.getElementById('username').value.trim(); const password = document.getElementById('password').value.trim(); if (!username || !password) { showToast('Please enter both username and password', 'error'); return; } const user = appData.users.find(u => u.username === username && u.password === password && u.status === 'active' ); if (user) { currentUser = user; activeSessions.add(user.id); // Update last login const userIndex = appData.users.findIndex(u => u.id === user.id); if (userIndex > -1) { appData.users[userIndex].lastLogin = new Date().toISOString(); saveAppData(); } sessionStorage.setItem('currentUser', JSON.stringify(user)); logSystem('LOGIN', `User ${username} logged in`, user.id); showToast(`Welcome back, ${user.name}!`, 'success'); showDashboard(); } else { logSystem('LOGIN_FAILED', `Failed login attempt for username: ${username}`); showToast('Invalid username or password', 'error'); } 
}
function handleLogout() {
if (currentUser) {
logSystem('LOGOUT', User ${currentUser.username} logged out, currentUser.id);
activeSessions.delete(currentUser.id);
}
currentUser = null; sessionStorage.removeItem('currentUser'); showLogin(); showToast('Logged out successfully', 'info'); 
}
function showLogin() {
document.getElementById('loginPage').style.display = 'flex';
document.getElementById('dashboardPage').classList.remove('active');
document.getElementById('loginForm').reset();
setTimeout(() => { document.getElementById('username').focus(); }, 100); 
}
function showDashboard() {
document.getElementById('loginPage').style.display = 'none';
document.getElementById('dashboardPage').classList.add('active');
// Update user info document.getElementById('userName').textContent = currentUser.name; document.getElementById('userRole').textContent = currentUser.role.toUpperCase(); document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase(); document.getElementById('dropdownUserName').textContent = currentUser.name; document.getElementById('welcomeName').textContent = currentUser.name; // Show/hide admin sections if (currentUser.role === 'admin') { document.getElementById('adminCategory').style.display = 'block'; document.getElementById('adminUsersLink').style.display = 'flex'; document.getElementById('adminCoursesLink').style.display = 'flex'; document.getElementById('adminMaterialsLink').style.display = 'flex'; document.getElementById('adminDashboardLink').style.display = 'flex'; } else { document.getElementById('adminCategory').style.display = 'none'; document.getElementById('adminUsersLink').style.display = 'none'; document.getElementById('adminCoursesLink').style.display = 'none'; document.getElementById('adminMaterialsLink').style.display = 'none'; document.getElementById('adminDashboardLink').style.display = 'none'; } const createGroupBtn = document.getElementById('createGroupBtn'); if (createGroupBtn) { createGroupBtn.style.display = currentUser.role === 'admin' ? 'inline-flex' : 'none'; } // Initialize sidebar initSidebar(); // Initialize CodeMirror editors initCodeEditors(); // Refresh dashboard refreshDashboard(); updateAttendanceFaceStatus(); groupFilter = ''; // Start session timeout monitor startSessionMonitor(); 
}
function startSessionMonitor() {
setInterval(() => {
const lastActivity = sessionStorage.getItem('lastActivity');
if (lastActivity && (Date.now() - parseInt(lastActivity) > ENTERPRISE_CONFIG.SESSION_TIMEOUT)) {
showToast('Session timeout due to inactivity', 'warning');
handleLogout();
}
}, 60000);
}
function updateActivity() {
sessionStorage.setItem('lastActivity', Date.now().toString());
}
// =========================================
// 5. DASHBOARD FUNCTIONS
// =========================================
function refreshDashboard() {
if (!currentUser) return;
// Update course info if (currentUser.courseId) { const course = appData.courses.find(c => c.id == currentUser.courseId); if (course) { document.getElementById('statCourseName').textContent = course.name; document.getElementById('statCourseCode').textContent = course.code; } else { document.getElementById('statCourseName').textContent = 'Unassigned'; document.getElementById('statCourseCode').textContent = 'Contact Admin'; } } else { document.getElementById('statCourseName').textContent = 'No Course'; document.getElementById('statCourseCode').textContent = '-'; } // Update projects count const myProjects = appData.projects.filter(p => p.userId === currentUser.id); document.getElementById('statProjects').textContent = myProjects.length; // Update likes const totalLikes = myProjects.reduce((sum, p) => sum + (p.likes || 0), 0); document.getElementById('statLikes').textContent = totalLikes; // Update attendance const myAttendance = appData.attendance.filter(a => a.userId === currentUser.id); const present = myAttendance.filter(a => a.status === 'Present').length; const rate = myAttendance.length > 0 ? Math.round((present / myAttendance.length) * 100) : 0; document.getElementById('statAttendance').textContent = rate + '%'; const today = new Date().toISOString().split('T')[0]; const todayPresent = myAttendance.filter(a => a.date === today && a.status === 'Present').length > 0; // Update recent activity updateRecentActivity(); // Update attendance badge updateAttendanceBadge(); 
}
function updateRecentActivity() {
const tbody = document.getElementById('recentActivityTable');
tbody.innerHTML = '';
// Get recent activities const activities = []; // Add recent attendance const recentAtt = appData.attendance .filter(a => a.userId === currentUser.id) .slice(-3) .reverse(); recentAtt.forEach(att => { const course = appData.courses.find(c => c.id == att.courseId); activities.push({ date: `${att.date} ${att.time || ''}`, activity: 'Attendance', details: course ? course.name : 'General', status: att.status }); }); // Add recent project saves const recentProjects = appData.projects .filter(p => p.userId === currentUser.id) .slice(-2) .reverse(); recentProjects.forEach(proj => { activities.push({ date: new Date(proj.createdAt).toLocaleDateString(), activity: 'Project Created', details: proj.name, status: proj.visibility === 'public' ? 'Public' : 'Private' }); }); // Display if (activities.length === 0) { tbody.innerHTML = ` <tr> <td colspan="4" class="text-center text-gray py-8"> <i class="fas fa-inbox fa-2x mb-4 opacity-30"></i> <p>No recent activity</p> </td> </tr> `; } else { activities.forEach(act => { const statusClass = act.status === 'Present' || act.status === 'Public' ? 'badge-success' : act.status === 'Absent' ? 'badge-danger' : 'badge-info'; tbody.innerHTML += ` <tr> <td class="font-medium">${act.date}</td> <td>${act.activity}</td> <td>${act.details}</td> <td><span class="badge ${statusClass}">${act.status}</span></td> </tr> `; }); } 
}
function updateAttendanceBadge() {
if (!currentUser) return;
const today = new Date().toISOString().split('T')[0]; const todayAttendance = appData.attendance.filter(a => a.userId === currentUser.id && a.date === today ).length; const badge = document.getElementById('attendanceBadge'); if (badge) { badge.textContent = todayAttendance > 0 ? '✓' : '0'; badge.style.background = todayAttendance > 0 ? 'var(--success)' : 'var(--warning)'; } 
}
// =========================================
// 6. STUDY MATERIALS - COMPLETE WORKING SYSTEM
// =========================================
function loadStudentMaterials() {
const container = document.getElementById('materialContainer');
const user = currentUser;
let materials = []; if (user.role === 'admin') { materials = appData.materials; } else if (user.courseId) { materials = appData.materials.filter(m => m.courseId == user.courseId); } else if (user.role === 'lecturer') { const lecturerCourses = appData.courses.filter(c => c.lecturer === user.name); materials = appData.materials.filter(m => lecturerCourses.some(c => c.id == m.courseId) ); } // Show download all button if there are materials const downloadBtn = document.getElementById('downloadAllBtn'); if (materials.length > 0) { downloadBtn.style.display = 'inline-flex'; } else { downloadBtn.style.display = 'none'; } if (materials.length === 0) { container.innerHTML = ` <div class="empty-state"> <i class="fas fa-folder-open"></i> <h3>No Materials Available</h3> <p>There are no study materials assigned to your course yet.</p> ${user.role === 'admin' || user.role === 'lecturer' ? `<button class="btn btn-primary mt-4" onclick="openMaterialModal()"> <i class="fas fa-plus"></i> Add Materials </button>` : `<p class="text-sm text-gray mt-2">Please contact your lecturer or administrator.</p>` } </div> `; return; } container.innerHTML = ''; materials.forEach(material => { const course = appData.courses.find(c => c.id == material.courseId); const el = document.createElement('div'); el.className = 'material-item'; // Determine icon let iconClass = 'icon-code', faIcon = 'fa-code', typeText = 'Code Snippet'; if (material.type === 'pdf') { iconClass = 'icon-pdf'; faIcon = 'fa-file-pdf'; typeText = 'PDF Document'; } else if (material.type === 'doc' || material.type === 'docx') { iconClass = 'icon-doc'; faIcon = 'fa-file-word'; typeText = 'Word Document'; } else if (material.type === 'ppt' || material.type === 'pptx') { iconClass = 'icon-doc'; faIcon = 'fa-file-powerpoint'; typeText = 'Presentation'; } else if (material.type === 'video') { iconClass = 'icon-doc'; faIcon = 'fa-file-video'; typeText = 'Video'; } else if (material.type === 'link') { iconClass = 'icon-doc'; faIcon = 'fa-link'; typeText = 'External Link'; } // Create material content let contentHtml = ''; if (material.type === 'code') { contentHtml = ` <div class="code-snippet-view"> <div class="code-actions"> <button class="code-btn" onclick="copyMaterialCode(${material.id})"> <i class="fas fa-copy"></i> Copy </button> <button class="code-btn" onclick="downloadMaterial(${material.id})"> <i class="fas fa-download"></i> Download </button> <button class="code-btn" onclick="runMaterialCode(${material.id})"> <i class="fas fa-play"></i> Run </button> </div> <pre><code>${escapeHtml(material.content)}</code></pre> </div> `; } else { contentHtml = ` <div class="flex flex-col gap-2"> <p class="text-gray-600">${material.description || 'No description available.'}</p> <div class="flex gap-2 mt-2"> ${material.type === 'link' ? ` <button class="btn btn-primary btn-sm" onclick="window.open('${material.content}', '_blank')"> <i class="fas fa-external-link-alt"></i> Open Link </button>` : ` <button class="btn btn-primary btn-sm" onclick="downloadMaterial(${material.id})"> <i class="fas fa-download"></i> Download </button> <button class="btn btn-outline btn-sm" onclick="previewMaterial(${material.id})"> <i class="fas fa-eye"></i> Preview </button>`} ${(currentUser.role === 'admin' || currentUser.role === 'lecturer') ? ` <button class="btn btn-outline btn-sm" onclick="shareMaterial(${material.id})"> <i class="fas fa-share"></i> Share </button> ` : ''} </div> </div> `; } el.innerHTML = ` <div class="material-icon ${iconClass}"> <i class="fas ${faIcon}"></i> </div> <div class="material-content"> <div class="material-title">${material.title}</div> <div class="material-meta"> <span class="badge badge-gray">${typeText}</span> <span class="text-gray">•</span> <span>${course ? course.name : 'General'}</span> <span class="text-gray">•</span> <span>${material.date || 'N/A'}</span> ${material.fileSize ? `<span class="text-gray">•</span><span>${material.fileSize}</span>` : ''} ${material.downloads > 0 ? `<span class="text-gray">•</span><span><i class="fas fa-download"></i> ${material.downloads}</span>` : ''} ${material.author ? `<span class="text-gray">•</span><span><i class="fas fa-user"></i> ${material.author}</span>` : ''} </div> ${contentHtml} </div> `; container.appendChild(el); }); 
}
function refreshMaterials() {
loadStudentMaterials();
showToast('Materials refreshed', 'success');
}
function downloadAllMaterials() {
const user = currentUser;
let materials = [];
if (user.role === 'admin') { materials = appData.materials; } else if (user.courseId) { materials = appData.materials.filter(m => m.courseId == user.courseId); } if (materials.length === 0) { showToast('No materials to download', 'warning'); return; } showToast(`Preparing ${materials.length} files for download...`, 'info'); // Create a ZIP file (simulated) setTimeout(() => { // Create a single text file with all material info let content = `Ferretto Edu Pro - Study Materials\n`; content += `Downloaded on: ${new Date().toLocaleDateString()}\n`; content += `User: ${user.name}\n`; content += `Course: ${user.courseId ? appData.courses.find(c => c.id == user.courseId)?.name : 'All Courses'}\n\n`; content += '='.repeat(50) + '\n\n'; materials.forEach((material, index) => { content += `MATERIAL ${index + 1}:\n`; content += `Title: ${material.title}\n`; content += `Type: ${material.type}\n`; content += `Description: ${material.description || 'No description'}\n`; content += `Date: ${material.date || 'N/A'}\n`; content += `Size: ${material.fileSize || 'N/A'}\n`; if (material.type === 'code') { content += `\nCODE CONTENT:\n${material.content}\n`; } else if (material.type === 'link') { content += `\nLINK: ${material.content}\n`; } content += '\n' + '='.repeat(50) + '\n\n'; }); // Create download const blob = new Blob([content], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `ferretto_materials_${new Date().toISOString().split('T')[0]}.txt`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); showToast('All materials downloaded as text file', 'success'); logSystem('DOWNLOAD_ALL', `Downloaded ${materials.length} materials`, user.id); }, 1500); 
}
function downloadMaterial(materialId) {
const material = appData.materials.find(m => m.id == materialId);
if (!material) return;
// Increment download count material.downloads = (material.downloads || 0) + 1; saveAppData(); let content, filename, mimeType; if (material.type === 'code') { content = material.content; filename = `${material.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${material.language || 'txt'}`; mimeType = 'text/plain'; } else if (material.type === 'link') { // Open in new tab window.open(material.content, '_blank'); showToast('Opening link in new tab', 'info'); logSystem('MATERIAL_VIEW', `Viewed link: ${material.title}`, currentUser.id); return; } else { // For other types, create a download file content = `Title: ${material.title}\n`; content += `Type: ${material.type}\n`; content += `Description: ${material.description || 'No description'}\n`; content += `Date: ${material.date || 'N/A'}\n`; content += `Author: ${material.author || 'Unknown'}\n\n`; content += 'NOTE: This is a simulated file. In a real system, this would be the actual file.\n'; content += `Actual file would be: ${material.content || 'Not specified'}`; filename = `${material.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`; mimeType = 'text/plain'; } // Create download link const blob = new Blob([content], { type: mimeType }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); showToast(`Downloaded: ${material.title}`, 'success'); logSystem('MATERIAL_DOWNLOAD', `Downloaded material: ${material.title}`, currentUser.id); 
}
function copyMaterialCode(materialId) {
const material = appData.materials.find(m => m.id == materialId);
if (material && material.content) {
navigator.clipboard.writeText(material.content).then(() => {
showToast('Code copied to clipboard', 'success');
logSystem('CODE_COPY', Copied code from: ${material.title}, currentUser.id);
}).catch(() => {
// Fallback
const textarea = document.createElement('textarea');
textarea.value = material.content;
document.body.appendChild(textarea);
textarea.select();
document.execCommand('copy');
document.body.removeChild(textarea);
showToast('Code copied', 'success');
});
}
}
function runMaterialCode(materialId) {
const material = appData.materials.find(m => m.id == materialId);
if (!material || material.type !== 'code') return;
const newWindow = window.open(); newWindow.document.write(material.content); newWindow.document.close(); showToast('Code running in new window', 'info'); logSystem('CODE_RUN', `Ran code from: ${material.title}`, currentUser.id); 
}
function previewMaterial(materialId) {
const material = appData.materials.find(m => m.id == materialId);
if (!material) return;
if (material.type === 'code') { // Open in code viewer alert(`Code Preview: ${material.title}\n\n${material.content.substring(0, 500)}${material.content.length > 500 ? '...' : ''}`); } else if (material.type === 'link') { window.open(material.content, '_blank'); } else { showToast(`Preview: ${material.title}\n\nDescription: ${material.description || 'No description'}\n\nType: ${material.type}\nDate: ${material.date || 'N/A'}`, 'info'); } 
}
function shareMaterial(materialId) {
const material = appData.materials.find(m => m.id == materialId);
if (!material) return;
const course = appData.courses.find(c => c.id == material.courseId); const shareText = `Check out this study material:\n\n${material.title}\n${material.description || ''}\n\nCourse: ${course ? course.name : 'General'}`; if (navigator.share) { navigator.share({ title: material.title, text: shareText, url: window.location.href }).then(() => { showToast('Material shared successfully', 'success'); }).catch(() => { copyToClipboard(shareText); }); } else { copyToClipboard(shareText); } 
}
// =========================================
// 7. MATERIAL UPLOAD SYSTEM - COMPLETE
// =========================================
function openMaterialModal() {
const form = document.getElementById('materialForm');
form.reset();
document.getElementById('materialId').value = '';
document.getElementById('fileUploadSection').classList.remove('hidden');
document.getElementById('materialCodeGroup').classList.add('hidden');
document.getElementById('materialLinkGroup').classList.add('hidden');
document.getElementById('filePreview').classList.add('hidden');
clearFileUpload();
// Populate course dropdown const courseSelect = document.getElementById('materialCourseId'); courseSelect.innerHTML = appData.courses.map(c => `<option value="${c.id}">${c.code} - ${c.name}</option>` ).join(''); openModal('materialModal'); 
}
function handleFileUpload(files) {
if (!files || files.length === 0) return;
const file = files[0]; const filePreview = document.getElementById('filePreview'); // Validate file type const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'video/mp4', 'text/html', 'text/css', 'text/javascript', 'application/javascript', 'text/x-python', 'text/x-c++src', 'text/plain']; const validExtensions = ['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.mp4', '.html', '.css', '.js', '.py', '.cpp', '.txt']; const isValidType = validTypes.includes(file.type) || validExtensions.some(ext => file.name.toLowerCase().endsWith(ext)); if (!isValidType) { showToast('Invalid file type. Please upload a supported file.', 'error'); return; } // Check file size (max 10MB) if (file.size > 10 * 1024 * 1024) { showToast('File too large. Maximum size is 10MB.', 'error'); return; } // Show file preview filePreview.innerHTML = ` <div class="file-preview"> <div class="file-preview-icon"> <i class="fas fa-file"></i> </div> <div> <div class="font-bold">${file.name}</div> <div class="text-sm text-gray">${formatFileSize(file.size)}</div> <div class="text-xs text-gray">${file.type || 'Unknown type'}</div> </div> <button class="btn btn-danger btn-sm ml-auto" onclick="clearFileUpload()"> <i class="fas fa-times"></i> </button> </div> `; filePreview.classList.remove('hidden'); // Store file reference currentUpload = file; showToast(`File "${file.name}" ready for upload`, 'success'); 
}
function clearFileUpload() {
const filePreview = document.getElementById('filePreview');
filePreview.innerHTML = '';
filePreview.classList.add('hidden');
currentUpload = null;
}
function formatFileSize(bytes) {
if (bytes < 1024) return bytes + ' bytes';
if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
function toggleMaterialInputs() {
const type = document.getElementById('materialType').value;
const fileSection = document.getElementById('fileUploadSection');
const codeGroup = document.getElementById('materialCodeGroup');
const linkGroup = document.getElementById('materialLinkGroup');
fileSection.classList.add('hidden'); codeGroup.classList.add('hidden'); linkGroup.classList.add('hidden'); if (type === 'code') { codeGroup.classList.remove('hidden'); if (materialEditor) { materialEditor.refresh(); } } else if (type === 'link') { linkGroup.classList.remove('hidden'); } else { fileSection.classList.remove('hidden'); } 
}
function uploadMaterialFile() {
document.getElementById('fileInput').click();
}
function handleSaveMaterial(e) {
e.preventDefault();
const materialId = document.getElementById('materialId').value; const title = document.getElementById('materialTitle').value.trim(); const type = document.getElementById('materialType').value; const courseId = document.getElementById('materialCourseId').value; const description = document.getElementById('materialDesc').value.trim(); // Validation if (!title || !type || !courseId) { showToast('Please fill all required fields', 'error'); return; } let content = ''; let fileSize = ''; let language = ''; if (type === 'code') { if (materialEditor) { content = materialEditor.getValue(); } if (!content.trim()) { showToast('Please enter code content', 'error'); return; } language = document.getElementById('codeLanguage').value; fileSize = formatFileSize(new Blob([content]).size); } else if (type === 'link') { content = document.getElementById('materialLink').value.trim(); if (!content.startsWith('http')) { showToast('Please enter a valid URL starting with http:// or https://', 'error'); return; } fileSize = 'N/A'; } else { // For file uploads if (!currentUpload) { showToast('Please upload a file', 'error'); return; } // In a real app, upload to server // For demo, simulate upload content = `File: ${currentUpload.name}\nSize: ${formatFileSize(currentUpload.size)}\nType: ${currentUpload.type}`; fileSize = formatFileSize(currentUpload.size); } if (materialId) { // Update existing material const materialIndex = appData.materials.findIndex(m => m.id == materialId); if (materialIndex === -1) return; const material = appData.materials[materialIndex]; material.title = title; material.type = type; material.courseId = courseId; material.content = content; material.description = description; material.fileSize = fileSize; material.updatedAt = new Date().toISOString(); if (language) material.language = language; appData.materials[materialIndex] = material; showToast('Material updated successfully', 'success'); logSystem('MATERIAL_UPDATE', `Updated material: ${title}`, currentUser.id); } else { // Create new material const newMaterial = { id: Date.now(), courseId, title, type, content, description, fileSize, downloads: 0, date: new Date().toISOString().split('T')[0], tags: [], language: language || null, author: currentUser.name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; appData.materials.push(newMaterial); showToast('Material created successfully', 'success'); logSystem('MATERIAL_CREATE', `Created material: ${title}`, currentUser.id); } saveAppData(); closeModal('materialModal'); loadAdminMaterials(); loadStudentMaterials(); 
}
function editMaterial(materialId) {
const material = appData.materials.find(m => m.id === materialId);
if (!material) return;
const form = document.getElementById('materialForm'); form.reset(); document.getElementById('materialId').value = material.id; document.getElementById('materialTitle').value = material.title; document.getElementById('materialType').value = material.type; document.getElementById('materialCourseId').value = material.courseId; document.getElementById('materialDesc').value = material.description || ''; toggleMaterialInputs(); if (material.type === 'code') { if (materialEditor) { materialEditor.setValue(material.content); } if (material.language) { document.getElementById('codeLanguage').value = material.language; } } else if (material.type === 'link') { document.getElementById('materialLink').value = material.content; } openModal('materialModal'); 
}
function deleteMaterial(materialId) {
const material = appData.materials.find(m => m.id === materialId);
if (!material) return;
if (!confirm(`Delete material "${material.title}"?`)) { return; } appData.materials = appData.materials.filter(m => m.id !== materialId); saveAppData(); showToast('Material deleted', 'info'); logSystem('MATERIAL_DELETE', `Deleted material: ${material.title}`, currentUser.id); loadAdminMaterials(); loadStudentMaterials(); 
}
// =========================================
// 8. CODE EDITOR & PROJECTS
// =========================================
function initCodeEditors() {
// Main code editor
const textarea = document.getElementById('codeEditor');
if (textarea && typeof CodeMirror !== 'undefined') {
mainEditor = CodeMirror.fromTextArea(textarea, {
mode: 'htmlmixed',
theme: 'monokai',
lineNumbers: true,
lineWrapping: true,
autoCloseTags: true,
autoCloseBrackets: true,
matchBrackets: true,
indentUnit: 2,
tabSize: 2,
extraKeys: {
"Ctrl-Space": "autocomplete",
"Ctrl-/": "toggleComment",
"Shift-Tab": "indentLess"
}
});
// Load last saved code const lastCode = localStorage.getItem('ferretto_last_code'); if (lastCode) { mainEditor.setValue(lastCode); } else { mainEditor.setValue(`<!DOCTYPE html> My Project body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; } .container { max-width: 800px; margin: 0 auto; text-align: center; } h1 { margin-bottom: 20px; } button { background: #4f46e5; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 1rem; cursor: pointer; transition: all 0.3s; } button:hover { background: #4338ca; transform: translateY(-2px); } 
Welcome to Ferretto Edu Pro!
Edit this code to create your project.
Click Me 
<script> console.log('Project loaded successfully'); <\/script> `); } mainEditor.on('change', updatePreview); setTimeout(updatePreview, 100); } // Material code editor const materialTextarea = document.getElementById('materialCodeEditor'); if (materialTextarea && typeof CodeMirror !== 'undefined') { materialEditor = CodeMirror.fromTextArea(materialTextarea, { mode: 'htmlmixed', theme: 'monokai', lineNumbers: true, lineWrapping: true, autoCloseTags: true, matchBrackets: true, indentUnit: 2 }); } // Setup auto-save setInterval(() => { if (mainEditor) { const code = mainEditor.getValue(); localStorage.setItem('ferretto_last_code', code); } }, ENTERPRISE_CONFIG.AUTO_SAVE_INTERVAL); 
}
function updatePreview() {
if (!mainEditor) return;
const code = mainEditor.getValue(); const iframe = document.getElementById('previewFrame'); const doc = iframe.contentDocument || iframe.contentWindow.document; try { doc.open(); doc.write(code); doc.close(); } catch (error) { console.error('Preview error:', error); doc.write(`<html><body><h1>Preview Error</h1><p>${error.message}</p></body></html>`); } 
}
function forceRefreshPreview() {
updatePreview();
showToast('Preview refreshed', 'success');
}
function openPreviewInNewTab() {
if (!mainEditor) return;
const code = mainEditor.getValue();
const newWindow = window.open();
newWindow.document.write(code);
newWindow.document.close();
}
function runCode() {
updatePreview();
showToast('Code executed successfully', 'success');
logSystem('CODE_RUN', 'Ran code in playground', currentUser.id);
}
function resetEditor() {
if (confirm('Clear the editor? Your current code will be lost.')) {
mainEditor.setValue(`
New Project body { font-family: Arial, sans-serif; padding: 20px; background: #f0f0f0; } .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); } 
New Project
Start coding here...
`); updatePreview(); showToast('Editor reset', 'info'); } } 
// =========================================
// 9. PROJECT MANAGEMENT
// =========================================
function openProjectModal() {
const form = document.getElementById('projectForm');
form.reset();
openModal('projectModal');
}
function handleSaveProject(e) {
e.preventDefault();
const name = document.getElementById('projectNameInput').value.trim(); const description = document.getElementById('projectDescriptionInput').value.trim(); const visibility = document.getElementById('projectVisibilityInput').value; const category = document.getElementById('projectCategoryInput').value; const tags = document.getElementById('projectTagsInput').value.split(',').map(tag => tag.trim()).filter(tag => tag); if (!name) { showToast('Project name is required', 'error'); return; } const code = mainEditor.getValue(); const newProject = { id: Date.now(), userId: currentUser.id, name, description, code, visibility, category, tags, likes: 0, views: 0, forks: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; appData.projects.push(newProject); saveAppData(); closeModal('projectModal'); showToast('Project saved successfully!', 'success'); logSystem('PROJECT_SAVE', `Saved project: ${name}`, currentUser.id); loadMyProjects(); 
}
function loadMyProjects() {
const grid = document.getElementById('myProjectsGrid');
const myProjects = appData.projects
.filter(p => p.userId === currentUser.id)
.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
if (myProjects.length === 0) { grid.innerHTML = ` <div class="empty-state w-full"> <i class="fas fa-laptop-code"></i> <h3>No Projects Yet</h3> <p>Create your first project using the code editor above.</p> <button class="btn btn-primary mt-4" onclick="showSection('projects')"> <i class="fas fa-code"></i> Start Coding </button> </div> `; return; } grid.innerHTML = ''; myProjects.forEach(project => { const card = document.createElement('div'); card.className = 'card'; const isPublic = project.visibility === 'public'; const isUnlisted = project.visibility === 'unlisted'; const visibilityText = isPublic ? 'Public' : isUnlisted ? 'Unlisted' : 'Private'; const visibilityClass = isPublic ? 'badge-success' : isUnlisted ? 'badge-info' : 'badge-gray'; const lastUpdated = new Date(project.updatedAt); const timeAgo = getTimeAgo(lastUpdated); card.innerHTML = ` <div class="card-header"> <div> <div class="card-title">${project.name}</div> <div class="card-subtitle">${project.description || 'No description'}</div> </div> <span class="badge ${visibilityClass}">${visibilityText}</span> </div> <div class="card-body"> <div class="flex flex-wrap gap-2 mb-3"> <span class="badge badge-primary">${project.category}</span> ${project.tags.slice(0, 3).map(tag => `<span class="badge badge-gray">${tag}</span>`).join('')} ${project.tags.length > 3 ? `<span class="badge badge-gray">+${project.tags.length - 3}</span>` : ''} </div> <div class="flex items-center gap-4 text-sm text-gray"> <div class="flex items-center gap-1"> <i class="fas fa-heart"></i> <span>${project.likes || 0}</span> </div> <div class="flex items-center gap-1"> <i class="fas fa-eye"></i> <span>${project.views || 0}</span> </div> <div class="flex items-center gap-1"> <i class="fas fa-code-branch"></i> <span>${project.forks || 0}</span> </div> <div class="ml-auto text-xs"> Updated ${timeAgo} </div> </div> </div> <div class="card-footer"> <div class="flex gap-2"> <button class="btn btn-sm btn-primary" onclick="loadProjectIntoEditor