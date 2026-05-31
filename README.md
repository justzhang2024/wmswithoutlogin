# Writing Monitoring System (Supabase & No-Login Edition)

A professional web application designed for proctored writing exams and self-practice. It ensures a fair environment for students and gives teachers real-time control, now powered by Supabase with a secure, login-free system architecture.

## 🌟 Key Features

*   **Real-time Monitoring**: Teachers see student word counts, connection statuses, and lock events live.
*   **No User Sign-In Required**: Eliminates authentication barriers; students and teachers enter the system using room codes and names, guarded by a central platform access passcode.
*   **Anti-Cheating Security**:
    *   **Focus Tracking**: The system locks the exam if a student switches tabs or windows.
    *   **Copy/Paste Blocking**: Copying and pasting text is strictly forbidden and results in an immediate session lock.
    *   **Viewport & Mouse Monitoring**: Detects if the mouse leaves the browser or if developer tools are opened.
*   **Automatic Archiving**: When an exam ends or a violation occurs, the system automatically saves the work as a professional PDF.
*   **Cloud Draft Backups & Resuming**: Student drafts are automatically saved to Supabase every 5 seconds. If a student is disconnected or reset by the teacher, they can seamlessly resume writing from their last backed-up draft.
*   **Teacher Control**: Teachers can open rooms and reset access for students who were locked out by mistake.

---

## 📖 How to Use

### Access Gate
1.  Open the web application.
2.  Enter the **Platform Access Password** (provided by your administrator) to unlock WMS portals.

### For Teachers (Supervisors)
1.  **Launch Dashboard**: Choose "Teacher Hub" and enter a unique **Room Code** (e.g., `CLASS-101`).
2.  **Monitor Students**: View the live list of students, word counts, and connection statuses (LIVE, OFFLINE, VIOLATION, SUBMITTED).
3.  **Manage Access**: If a student is locked out due to a violation or browser restart, click **"Reset Access"** on their card. The student's portal will automatically unlock and let them continue typing.
4.  **End Session**: When the exam is over, click **"End Session"**. This closes the room and automatically triggers final PDF archiving for all remaining active student sessions.

### For Students
1.  **Enter Portal**: Choose "Student Portal" -> "Enter Proctored Exam".
2.  **Entrance Info**: Enter your **Full Name**, the **Room Code** from your teacher, and the **Writing Title**.
3.  **Exam Rules**:
    *   **Stay Focused**: Do not leave the browser tab or window.
    *   **No Copying/Pasting**: Keyboard copy/paste and right-click paste operations will immediately lock your exam.
4.  **Submission**: Click **"Submit Final"** when you are done. Your work is automatically saved, and downloaded as a PDF.

### For Practice
1.  **Self-Practice**: Use "Self-Practice Mode" to write privately. Your work is saved only on your computer, and no monitor rules apply.

---

## 🛠️ Configuration & Database Setup

Refer to `TECHNICAL_DOCUMENTATION.md` for PostgreSQL schema definitions and Supabase Realtime configurations.

Configure the following environment variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SYSTEM_PASSWORD` (Access password gate; defaults to `niswms2026` if blank)