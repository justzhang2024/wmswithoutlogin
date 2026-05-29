export type AppView = 'LOGIN' | 'HOME' | 'STUDENT_MODE' | 'STUDENT_EXAM_ENTRY' | 'STUDENT_EXAM' | 'TEACHER_SETUP' | 'TEACHER_DASHBOARD' | 'LOCKED';

export interface Session {
  startTime: number;
  endTime: number | null;
}

export interface WritingState {
  content: string;
  wordCount: number;
  totalSeconds: number;
  sessions: Session[];
  isRecording: boolean;
  isPad?: boolean;
  examInfo?: {
    name: string;
    roomCode: string;
    title: string;
  };
}

export enum StudentStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  EXCEPTION = 'EXCEPTION',
  SUBMITTED = 'SUBMITTED',
  OFFLINE = 'OFFLINE',
  VIOLATION = 'VIOLATION'
}

export interface StudentInfo {
  name: string;
  title: string;
  wordCount: number;
  status: StudentStatus;
  lastSeen: number;
  lockReason?: string;
}

export interface TeacherRoom {
  roomCode: string;
  createdAt: number;
  students: Record<string, StudentInfo>;
}

// WebSocket Protocol Types
export type WSMessageType = 'JOIN' | 'UPDATE' | 'COMMAND' | 'ERROR' | 'SYNC';

export interface WSMessage {
  type: WSMessageType;
  payload: any;
  sender?: 'STUDENT' | 'TEACHER';
  timestamp: number;
}