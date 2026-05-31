# Technical Documentation: Writing Monitoring System (Supabase & No-Login Edition)

## 1. Overview
The **Writing Monitoring System** is a React-based web application designed for proctored writing exams and self-practice. It features real-time synchronization between students and teachers using Supabase, strict environment monitoring (anti-cheating), automatic PDF generation, a platform-allocated system password gate, and a pure no-login flow.

---

## 2. Tech Stack
- **Frontend Framework**: React 19
- **Styling**: Tailwind CSS (CDN-based) & Framer Motion
- **Backend/Database**: Supabase (PostgreSQL Database & Realtime Subscription Engine)
- **PDF Generation**: jsPDF
- **Language**: TypeScript

---

## 3. Project Structure
- `App.tsx`: The core component containing the application logic, state management, view routing, database client, and real-time subscription managers.
- `types.ts`: Centralized TypeScript interfaces and enums (e.g., `StudentStatus`, `WritingState`).
- `utils/monitoring.ts`: Helper functions for word counting, time formatting, and timestamping.
- `index.html`: Entry point including external library scripts (Tailwind, jsPDF) and the React mount point.

---

## 4. Database Schema & Configurations (PostgreSQL)

To run the system on Supabase, the following database schema must be initialized in your Supabase SQL Editor.

```sql
-- ========================================================
-- 1. Create Rooms Table
-- ========================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  room_code VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================================
-- 2. Create Students Session Table
-- ========================================================
CREATE TABLE IF NOT EXISTS public.students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code VARCHAR(255) NOT NULL REFERENCES public.rooms(room_code) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  student_key VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  word_count INTEGER DEFAULT 0,
  content TEXT DEFAULT '',
  status VARCHAR(50) DEFAULT 'ACTIVE',
  lock_reason VARCHAR(255),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_student_per_room UNIQUE (room_code, student_key)
);

-- ========================================================
-- 3. Enable Realtime Subscriptions
-- ========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.students;
```

---

## 5. Core Architectures

### 5.1. State & View Management
The app uses a central `view` state to navigate between:
- `LOGIN`: Platform system password gate.
- `HOME`: Main portal entry (Student Portal / Teacher Hub).
- `STUDENT_MODE`: Choice between Practice or Exam.
- `STUDENT_EXAM_ENTRY`: Input room code, student name, and title.
- `STUDENT_EXAM`: Writing environment with active anti-cheating tracking.
- `TEACHER_DASHBOARD`: Live monitoring view for instructors.
- `LOCKED`: Terminal state for students after submission or violation.

### 5.2. Real-time Synchronization
The application leverages Supabase Realtime Channels:
- **Student Side**: Auto-saves and heartbeat updates every 5 seconds to the `students` table. Subscribes to changes on their specific row for instant unlock/reset (`status === 'OFFLINE'`) and session ending (`DELETE`).
- **Teacher Side**: Fetches initial room states from the `students` table, and subscribes to realtime `postgres_changes` on the `students` table filtered by `room_code`. Updates the dashboard UI instantly.

### 5.3. System Passcode Authorization
To replace Google OAuth and secure WMS access without forced user sign-in:
- A passcode gate is rendered at launch (`view === 'LOGIN'`).
- Checks user input against `VITE_SYSTEM_PASSWORD` (defaults to `niswms2026`).
- Stores a validation key in `sessionStorage` to maintain session access during reload.

---

## 6. Security & Anti-Cheating Implementation

### 6.1. Environment Focus Tracking
The system monitors if the student leaves the browser tab or window.
- **Action**: If `blur` is detected during an active exam, `handleLockdown` is triggered, setting status to `VIOLATION` and disabling the editor.

### 6.2. Paste & Copy Prevention
- **Action**: Interception of `onPaste` and `onCopy` synthetic events. Triggers an immediate `VIOLATION` lockdown and generates a PDF of the current progress.

### 6.3. Duplicate Join Protection
- Before joining a room, the app queries the database. If a student with the same name already exists:
  - If status is `ACTIVE` or `PAUSED`, duplicate entrance is blocked.
  - If status is `OFFLINE`, they are allowed to resume their previous session, restoring their draft content directly from PostgreSQL.

### 6.4. heartbeats & Offline Detection
- Student updates `last_seen` every 5 seconds.
- Teacher dashboard re-evaluates student online status every 3 seconds. If `Date.now() - student.lastSeen > 15000`, the student is visually flagged as `OFFLINE` (Disconnected).

---

## 7. Key Workflows

### 7.1. Student Submission
1. User clicks "Submit Final".
2. App triggers `handleLockdown('SUBMISSION', ...)`.
3. Database status is updated to `SUBMITTED`.
4. `downloadPDF()` is invoked to save work locally on the student's device.

### 7.2. Teacher Session Termination
1. Teacher clicks "End Session".
2. The room record in `rooms` table is deleted.
3. Due to SQL Foreign Key `ON DELETE CASCADE`, all related student rows are deleted.
4. Student realtime subscription detects the `DELETE` event and automatically triggers lockdown and downloads their final draft.

---

## 8. Configuration
The application requires the following environment variables (Supabase):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SYSTEM_PASSWORD` (Optional system access passcode, defaults to `niswms2026`)