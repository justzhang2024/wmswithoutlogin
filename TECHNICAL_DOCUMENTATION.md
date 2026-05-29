# Technical Documentation: Writing Monitoring System

## 1. Overview
The **Writing Monitoring System** is a React-based web application designed for proctored writing exams and self-practice. It features real-time synchronization between students and teachers using Firebase, strict environment monitoring (anti-cheating), and automatic PDF generation.

---

## 2. Tech Stack
- **Frontend Framework**: React 19 (ESM via esm.sh)
- **Styling**: Tailwind CSS (CDN-based)
- **Backend/Database**: Firebase Realtime Database
- **PDF Generation**: jsPDF
- **Language**: TypeScript

---

## 3. Project Structure
- `App.tsx`: The core component containing the application logic, state management, and view routing.
- `types.ts`: Centralized TypeScript interfaces and enums (e.g., `StudentStatus`, `WritingState`).
- `utils/monitoring.ts`: Helper functions for word counting, time formatting, and timestamping.
- `index.html`: Entry point including external library scripts (Tailwind, jsPDF) and the React mount point.

---

## 4. Core Architectures

### 4.1. State & View Management
The app uses a central `view` state to navigate between:
- `HOME`: Entry selection.
- `STUDENT_MODE`: Choice between Practice or Exam.
- `TEACHER_DASHBOARD`: Live monitoring view for instructors.
- `LOCKED`: Terminal state for students after submission or violation.

### 4.2. Real-time Synchronization
The application relies on the **Firebase Realtime Database** tree structure:
```json
rooms: {
  "room_code": {
    "createdAt": 123456789,
    "students": {
      "cleaned_student_name": {
        "name": "Original Name",
        "title": "Writing Title",
        "wordCount": 150,
        "status": "ACTIVE",
        "lastSeen": 123456789
      }
    }
  }
}
```
- **Student Side**: Pushes word count and status updates every few seconds or on focus change.
- **Teacher Side**: Subscribes to the room path via `onValue` to receive live updates of all students.

---

## 5. Security & Anti-Cheating Implementation

### 5.1. Environment Focus Tracking
The system monitors if the student leaves the browser tab or window.
- **Mechanism**: Global `window` event listeners for `focus` and `blur`.
- **Action**: If `blur` is detected during an active exam, `handleLockdown` is triggered, setting status to `VIOLATION` and disabling the editor.

### 5.2. Paste Prevention
Pasting text is strictly prohibited to prevent external content injection.
- **Mechanism**: Interception of the `onPaste` React synthetic event on the `textarea`.
- **Action**: Triggers an immediate `VIOLATION` lockdown and generates a PDF of the current progress.

### 5.3. Identity Protection
To prevent session hijacking or duplicates:
- All Room Codes and Student Names are "cleaned" (spaces removed, lowercased) before being used as database keys.
- Before joining, the app performs a **Backend Status Check**. If a student record exists with a status other than `OFFLINE`, entry is blocked.

---

## 6. Key Workflows

### 6.1. Student Submission
1. User clicks "Submit Final".
2. App triggers `handleLockdown('SUBMISSION', ...)`.
3. Database status is updated to `SUBMITTED`.
4. `downloadPDF()` is invoked using `jsPDF` to save the work locally on the student's device.

### 6.2. Teacher Session Termination
1. Teacher clicks "End Session".
2. The entire `rooms/{code}` path is removed from Firebase.
3. Students listening to this path receive a `null` snapshot.
4. Student apps automatically trigger local lockdown/PDF download to ensure work is saved before the connection is severed.

---

## 7. Configuration
The application requires the following environment variables (Firebase):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`

If these variables are missing, the app defaults to **OFFLINE/Practice Mode** functionality only.