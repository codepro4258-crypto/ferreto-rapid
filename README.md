# Ferretto Edu Pro

Ferretto Edu Pro is a front-end learning management system demo with biometric attendance, course materials, project coding, and collaboration features. The app runs entirely in the browser using `localStorage`, making it easy to preview without a backend.

## Highlights

- **Role-based access** for admins, lecturers, and students.
- **User management** with biometric face registration for attendance.
- **Course and study material management** (files, links, or code snippets).
- **Biometric attendance** with status indicators and exportable history.
- **Group collaboration chat** with code-formatted messages.
- **Project leaderboard** and code playground for student projects.

## Getting Started

1. Open `index.html` in your browser.
2. Use the demo credentials below to sign in.

### Demo Credentials

- **Admin**: `admin` / `admin12345`
- **Student**: `student` / `student123`

## Key Workflows

### 1. User Management + Face Registration

1. Sign in as **Admin**.
2. Go to **User Management** → **Add User** or edit an existing user.
3. Click the **shield icon** in the Actions column to register a face.
4. Once registered, the **Attendance** section will display a “Face ID Registered” badge.

### 2. Course & Material Management

1. Go to **Course Management** to create or edit courses.
2. Go to **Materials Library** to add PDFs, docs, videos, links, or code snippets.
3. Students see only the materials for their assigned course.

### 3. Group Collaboration

1. Admins open **Group Chat** → **Create Group**.
2. Select group members and save.
3. Members can chat and include code blocks using triple backticks:

```
const greeting = 'Hello, group!';
```

### 4. Attendance

- Open **Attendance** and click **Start Camera & Verify** to mark attendance.
- Export attendance history to CSV when needed.

## Notes

- All data is stored in the browser’s `localStorage`.
- Clearing site data resets the application to defaults.

---

Built as a demo for the Ferretto educational experience.
