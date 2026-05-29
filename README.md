# Writing Monitoring System

A professional web application designed for exams and writing practice. It ensures a fair environment for students and gives teachers real-time control.

## 🌟 Key Features

*   **Real-time Monitoring**: Teachers see student word counts and activity status live.
*   **Anti-Cheating Security**:
    *   **Focus Tracking**: The system locks the exam if a student switches tabs or windows.
    *   **Paste Blocking**: Copying and pasting text is forbidden and results in an immediate session lock.
*   **Automatic Archiving**: When an exam ends or a violation happens, the system automatically saves the work as a professional PDF.
*   **Teacher Control**: Teachers can open/close rooms and reset access for students who were locked out by mistake.
*   **Cloud Sync**: Progress is saved to a database to prevent data loss.

---

## 📖 How to Use

### For Teachers (Supervisors)
1.  **Launch Dashboard**: Go to "Teacher Hub" and enter a unique **Room Code** (e.g., `CLASS-101`).
2.  **Monitor Students**: View the live list of students. You can see their word counts and current status.
3.  **Manage Access**: If a student is locked out (Violation or accidental Submission), click the **"Reset Access"** button on their card to let them log back in.
4.  **End Session**: When the exam is over, click **"End Session"**. This downloads all students' work and closes the room.

### For Students
1.  **Enter Exam**: Choose "Student Portal" -> "Enter Proctored Exam".
2.  **Login**: Enter your **Full Name**, the **Room Code** from your teacher, and the **Writing Title**.
3.  **Writing Rules**:
    *   **Stay Focused**: Do not leave the browser tab. Switching windows will lock your exam.
    *   **No Pasting**: Do not try to paste text. This will end your session immediately.
4.  **Submission**: Click **"Submit Final"** when you are done. Your work will be downloaded as a PDF automatically.

### For Practice
1.  **Self-Practice**: Use "Self-Practice Mode" to write privately. Your work is saved only on your computer, and no monitor rules apply.