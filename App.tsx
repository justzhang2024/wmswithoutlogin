import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { WritingState, AppView, StudentStatus, TeacherRoom, StudentInfo } from './types';
import { formatDuration, countWords, formatTimestamp } from './utils/monitoring';
import { motion, AnimatePresence } from 'framer-motion';

declare const jspdf: any;
declare const process: any;

const getEnv = (key: string): string => {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[key]) {
      return (import.meta as any).env[key];
    }
    if (typeof process !== 'undefined' && process.env?.[key]) {
      return process.env[key] as string;
    }
  } catch (e) {
    console.warn(`Environment access error for ${key}:`, e);
  }
  return "";
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');
const isConfigValid = !!(supabaseUrl && supabaseAnonKey);

const supabase = isConfigValid ? createClient(supabaseUrl, supabaseAnonKey) : null;

const CustomDialog: React.FC<{
  isOpen: boolean;
  title?: string;
  message: string;
  type: 'alert' | 'confirm';
  onConfirm: () => void;
  onCancel?: () => void;
}> = ({ isOpen, title = "System Notification", message, type, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden transform animate-in zoom-in-95 duration-200 border border-slate-100">
        <div className="px-6 py-4 border-b border-slate-50 bg-slate-50/50">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</span>
        </div>
        <div className="px-6 py-8 text-center">
          <p className="text-slate-700 font-medium leading-relaxed">{message}</p>
        </div>
        <div className="px-6 py-4 bg-slate-50 flex gap-3">
          {type === 'confirm' && (
            <button onClick={onCancel} className="flex-1 px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          )}
          <button onClick={onConfirm} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all active:scale-95">Confirm</button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('LOGIN');
  const [isSystemUnlocked, setIsSystemUnlocked] = useState(false);
  const [systemPassword, setSystemPassword] = useState('');
  const [isFocused, setIsFocused] = useState(document.hasFocus());
  const [syncStatus, setSyncStatus] = useState<'CONNECTED' | 'OFFLINE' | 'CONFIG_REQUIRED'>(isConfigValid ? 'CONNECTED' : 'CONFIG_REQUIRED');
  const [lockType, setLockType] = useState<'SUBMISSION' | 'VIOLATION' | 'MANUAL' | null>(null);
  
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [edgeGlow, setEdgeGlow] = useState({ top: false, bottom: false, left: false, right: false });
  const [isMoving, setIsMoving] = useState(false);
  const leaveTimeoutRef = useRef<any>(null);
  const idleTimeoutRef = useRef<any>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const padViolationTimeoutRef = useRef<any>(null);

  const [activeRoom, setActiveRoom] = useState<TeacherRoom | null>(null);
  const [state, setState] = useState<WritingState>({ 
    content: '', wordCount: 0, totalSeconds: 0, sessions: [], isRecording: false 
  });

  const [examEntry, setExamEntry] = useState({ name: '', code: '', title: '' });
  const [isPadEntry, setIsPadEntry] = useState(false);
  const [teacherEntry, setTeacherEntry] = useState('');
  
  const [dialog, setDialog] = useState<{
    isOpen: boolean; 
    title?: string;
    message: string; 
    type: 'alert' | 'confirm'; 
    onConfirm: () => void
  }>({
    isOpen: false, message: '', type: 'alert', onConfirm: () => {}
  });

  const studentChannelRef = useRef<any>(null);
  const teacherChannelRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef(state.content);
  const wordCountRef = useRef(state.wordCount);

  const [dashboardTicker, setDashboardTicker] = useState(Date.now());

  useEffect(() => {
    contentRef.current = state.content;
    wordCountRef.current = state.wordCount;
  }, [state.content, state.wordCount]);

  // Check sessionStorage on mount for system password bypass
  useEffect(() => {
    const unlocked = sessionStorage.getItem('wms_system_unlocked') === 'true';
    if (unlocked) {
      setIsSystemUnlocked(true);
      setView('HOME');
    } else {
      setView('LOGIN');
    }
  }, []);

  const safeFirebaseKey = (str: string) => 
    str.replace(/\s+/g, '').toLowerCase().replace(/[.#$[\]/]/g, "_");

  const cleanRoomCode = (code: string) => safeFirebaseKey(code);
  const cleanStudentName = (name: string) => safeFirebaseKey(name);

  /**
   * Helper to check student offline state dynamically on Teacher Dashboard
   */
  const isStudentOffline = useCallback((student: StudentInfo) => {
    if (student.status === StudentStatus.SUBMITTED || student.status === StudentStatus.VIOLATION) {
      return false;
    }
    return Date.now() - student.lastSeen > 15000;
  }, []);

  /**
   * Teacher Dashboard dynamic offline evaluation ticker
   */
  useEffect(() => {
    if (view !== 'TEACHER_DASHBOARD') return;
    const interval = setInterval(() => {
      setDashboardTicker(Date.now());
    }, 3000);
    return () => clearInterval(interval);
  }, [view]);

  /**
   * Enhanced PDF download with multi-page support
   */
  const downloadPDF = useCallback(() => {
    if (!state.examInfo) return;
    try {
      const { jsPDF } = jspdf;
      const doc = new jsPDF();
      const margin = 20;
      const pageHeight = doc.internal.pageSize.getHeight();
      const bottomMargin = 20;
      const now = new Date();
      
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
      const timestampLabel = `${dateStr}_${timeStr}`;
      
      // Header Section
      doc.setFontSize(18);
      doc.text(state.examInfo.title, margin, 20);
      
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(`Student: ${state.examInfo.name}`, margin, 30);
      doc.text(`Room: ${state.examInfo.roomCode.toUpperCase()}`, margin, 36);
      doc.text(`Words: ${state.wordCount}`, margin, 42);
      doc.text(`Date: ${formatTimestamp(now.getTime())}`, margin, 48);
      doc.line(margin, 52, 190, 52);
      
      // Content Section with Multi-page handling
      doc.setTextColor(0);
      doc.setFontSize(12);
      const splitContent = doc.splitTextToSize(state.content, 170);
      const lineHeight = 7;
      let cursorY = 62;

      splitContent.forEach((line: string) => {
        if (cursorY + lineHeight > pageHeight - bottomMargin) {
          doc.addPage();
          cursorY = 20; 
        }
        doc.text(line, margin, cursorY);
        cursorY += lineHeight;
      });
      
      const safeName = safeFirebaseKey(state.examInfo.name);
      doc.save(`${safeName}_${timestampLabel}.pdf`);
    } catch (e) {
      console.error("PDF Generation Failed:", e);
    }
  }, [state.content, state.examInfo, state.wordCount]);

  /**
   * Update student status, word count, draft content, and last seen inside Supabase
   */
  const updateRealtimeStatus = useCallback(async (status: StudentStatus, reason?: string) => {
    if (supabase && state.examInfo && syncStatus === 'CONNECTED') {
      const cleanedCode = cleanRoomCode(state.examInfo.roomCode);
      const cleanedName = cleanStudentName(state.examInfo.name);
      
      const updateData: any = {
        word_count: wordCountRef.current,
        content: contentRef.current,
        status: status,
        last_seen: new Date().toISOString()
      };
      if (reason) updateData.lock_reason = reason;
      
      const { error } = await supabase
        .from('students')
        .update(updateData)
        .eq('room_code', cleanedCode)
        .eq('student_key', cleanedName);

      if (error) {
        console.error("Supabase Sync Failed:", error);
      }
    }
  }, [state.examInfo, syncStatus]);

  /**
   * Lockdown handler
   */
  const handleLockdown = useCallback((type: 'SUBMISSION' | 'VIOLATION' | 'MANUAL', message: string) => {
    if (view === 'LOCKED') return; 
    
    localStorage.setItem('writing_exam_draft', contentRef.current);

    setLockType(type);
    setState(prev => ({ ...prev, isRecording: false }));
    
    const status = type === 'VIOLATION' ? StudentStatus.VIOLATION : StudentStatus.SUBMITTED;
    
    let shortReason = "";
    if (type === 'VIOLATION') {
      if (message.includes("Window focus")) shortReason = "Focus Lost";
      else if (message.includes("Page visibility")) shortReason = "Page Hidden";
      else if (message.includes("Escape key")) shortReason = "Escape Key";
      else if (message.includes("Command key")) shortReason = "Command Key";
      else if (message.includes("Copy/Paste")) shortReason = "Copy/Paste";
      else if (message.includes("Fullscreen")) shortReason = "Fullscreen Exit";
      else if (message.includes("Mouse left")) shortReason = "Mouse Left";
      else if (message.includes("Viewport height")) shortReason = "Height Change";
      else if (message.includes("Paste operation")) shortReason = "Paste Detected";
      else if (message.includes("Copy operation")) shortReason = "Copy Detected";
      else shortReason = "Violation";
    } else if (type === 'SUBMISSION') {
      shortReason = "Submitted";
    } else {
      shortReason = "Manual End";
    }

    updateRealtimeStatus(status, shortReason);

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    setView('LOCKED');
    
    setDialog({
      isOpen: true,
      message,
      type: 'alert',
      onConfirm: () => setDialog(d => ({ ...d, isOpen: false }))
    });
  }, [view, updateRealtimeStatus]);

  /**
   * Subscribe to student's database updates (for room termination and teacher unlocks)
   */
  const subscribeToStudentRow = useCallback((roomCode: string, studentName: string) => {
    if (!supabase) return;
    const cleanedCode = cleanRoomCode(roomCode);
    const cleanedName = cleanStudentName(studentName);

    if (studentChannelRef.current) {
      supabase.removeChannel(studentChannelRef.current);
    }

    studentChannelRef.current = supabase
      .channel(`student-track:${cleanedName}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'students',
        filter: `room_code=eq.${cleanedCode}`
      }, (payload) => {
        const { eventType, new: newRow, old: oldRow } = payload;
        
        if (eventType === 'DELETE' && oldRow.student_key === cleanedName) {
          // Room/Student was deleted (Teacher ended session)
          setState(prev => {
            if (prev.isRecording) {
              handleLockdown('MANUAL', "The teacher has ended the session. Your work has been automatically saved and downloaded.");
            }
            return prev;
          });
        } else if (eventType === 'UPDATE' && newRow.student_key === cleanedName) {
          // If status changes to OFFLINE (Teacher clicked Reset Access), unlock student instantly
          if (newRow.status === StudentStatus.OFFLINE) {
            setView('STUDENT_EXAM');
            setLockType(null);
            setState(prev => ({
              ...prev,
              content: newRow.content || '',
              wordCount: countWords(newRow.content || ''),
              isRecording: true
            }));
          }
        }
      })
      .subscribe();
  }, [handleLockdown]);

  /**
   * Student cleanup on unmount/disconnect
   */
  const handleStudentOfflineOnExit = async () => {
    if (supabase && state.examInfo) {
      const cleanedCode = cleanRoomCode(state.examInfo.roomCode);
      const cleanedName = cleanStudentName(state.examInfo.name);
      await supabase
        .from('students')
        .update({ status: StudentStatus.OFFLINE, last_seen: new Date().toISOString() })
        .eq('room_code', cleanedCode)
        .eq('student_key', cleanedName);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      handleStudentOfflineOnExit();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [state.examInfo]);

  /**
   * Reset student access (Teacher action)
   */
  const resetStudentStatus = async (studentKey: string) => {
    if (!supabase || !activeRoom) return;
    const code = cleanRoomCode(activeRoom.roomCode);
    const cleanKey = cleanStudentName(studentKey);
    try {
      await supabase
        .from('students')
        .update({
          status: StudentStatus.OFFLINE,
          last_seen: new Date().toISOString(),
          lock_reason: null
        })
        .eq('room_code', code)
        .eq('student_key', cleanKey);
    } catch (e) {
      console.error("Failed to reset student:", e);
    }
  };

  /**
   * End session and terminate room (Teacher action)
   */
  const stopExam = useCallback(async () => {
    if (!supabase || !activeRoom) return;
    const code = cleanRoomCode(activeRoom.roomCode);
    try {
      // Deleting the room will automatically delete all student sessions cascadingly in postgres
      await supabase
        .from('rooms')
        .delete()
        .eq('room_code', code);

      if (teacherChannelRef.current) {
        supabase.removeChannel(teacherChannelRef.current);
      }
      setActiveRoom(null);
      setView('HOME');
    } catch (e) {
      console.error("Failed to end exam:", e);
    }
  }, [activeRoom]);

  const confirmStopExam = () => {
    setDialog({
      isOpen: true,
      title: "Terminate Session",
      message: "Are you sure you want to end the session? Please verify that ALL students have finished and submitted. Active students will be forcefully archived.",
      type: 'confirm',
      onConfirm: () => {
        setDialog(d => ({ ...d, isOpen: false }));
        stopExam();
      }
    });
  };

  /**
   * Teacher joins room and monitors in real-time
   */
  const joinRoomAsTeacher = async (roomCode: string) => {
    if (!supabase || !roomCode) return;
    const code = cleanRoomCode(roomCode);
    
    try {
      // Check if room exists
      const { data: existingRoom, error: checkError } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', code)
        .maybeSingle();

      if (existingRoom) {
        setDialog({
          isOpen: true,
          message: 'This room code is already active. Please use a unique code.',
          type: 'alert',
          onConfirm: () => setDialog(d => ({ ...d, isOpen: false }))
        });
        return;
      }

      // Create new room
      const { error: roomError } = await supabase
        .from('rooms')
        .insert({ room_code: code });

      if (roomError) {
        console.error("Room launch failed:", roomError);
        return;
      }

      // Fetch initial students
      const { data: initialStudents } = await supabase
        .from('students')
        .select('*')
        .eq('room_code', code);

      const studentsMap: Record<string, StudentInfo> = {};
      if (initialStudents) {
        initialStudents.forEach(s => {
          studentsMap[s.student_key] = {
            name: s.name,
            title: s.title,
            wordCount: s.word_count,
            status: s.status as StudentStatus,
            lastSeen: new Date(s.last_seen).getTime(),
            lockReason: s.lock_reason
          };
        });
      }

      setActiveRoom({
        roomCode: roomCode.toUpperCase(), 
        createdAt: Date.now(),
        students: studentsMap
      });

      // Subscribe to student changes for this room
      if (teacherChannelRef.current) {
        supabase.removeChannel(teacherChannelRef.current);
      }

      teacherChannelRef.current = supabase
        .channel(`room-monitor:${code}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'students',
          filter: `room_code=eq.${code}`
        }, (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          
          setActiveRoom(prev => {
            if (!prev) return null;
            const updatedStudents = { ...prev.students };
            if (eventType === 'DELETE') {
              delete updatedStudents[oldRow.student_key];
            } else {
              updatedStudents[newRow.student_key] = {
                name: newRow.name,
                title: newRow.title,
                wordCount: newRow.word_count,
                status: newRow.status as StudentStatus,
                lastSeen: new Date(newRow.last_seen).getTime(),
                lockReason: newRow.lock_reason
              };
            }
            return { ...prev, students: updatedStudents };
          });
        })
        .subscribe();
      
      setSyncStatus('CONNECTED');
      setView('TEACHER_DASHBOARD');
    } catch (error) {
      console.error("Teacher Setup Failed:", error);
    }
  };

  /**
   * System Gateway password check
   */
  const handleSystemPasswordGate = () => {
    const correctPassword = getEnv('VITE_SYSTEM_PASSWORD') || 'niswms2026';
    if (systemPassword === correctPassword) {
      sessionStorage.setItem('wms_system_unlocked', 'true');
      setIsSystemUnlocked(true);
      setView('HOME');
    } else {
      setDialog({
        isOpen: true,
        message: 'Invalid access code. Please check with your supervisor.',
        type: 'alert',
        onConfirm: () => setDialog(d => ({ ...d, isOpen: false }))
      });
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('wms_system_unlocked');
    setIsSystemUnlocked(false);
    setSystemPassword('');
    setView('LOGIN');
  };

  /**
   * Timer ticking
   */
  useEffect(() => {
    if (state.isRecording) {
      sessionStartTimeRef.current = Date.now();
    } else {
      sessionStartTimeRef.current = 0;
    }
  }, [state.isRecording]);

  useEffect(() => {
    let interval: number;
    if (state.isRecording && isFocused) {
      interval = window.setInterval(() => {
        setState(prev => ({ ...prev, totalSeconds: prev.totalSeconds + 1 }));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [state.isRecording, isFocused]);

  /**
   * Student focus dynamic sync updates
   */
  useEffect(() => {
    if (view === 'STUDENT_EXAM' && syncStatus === 'CONNECTED' && state.isRecording) {
      const status = isFocused ? StudentStatus.ACTIVE : StudentStatus.PAUSED;
      updateRealtimeStatus(status);
    }
  }, [isFocused, view, syncStatus, updateRealtimeStatus, state.isRecording]);

  /**
   * Periodic auto-save & heartbeat to Supabase database (every 5 seconds)
   */
  useEffect(() => {
    if (!state.isRecording || view !== 'STUDENT_EXAM' || syncStatus !== 'CONNECTED') return;
    const heartbeatTimer = setInterval(() => {
      const status = isFocused ? StudentStatus.ACTIVE : StudentStatus.PAUSED;
      updateRealtimeStatus(status);
    }, 5000);
    return () => clearInterval(heartbeatTimer);
  }, [state.isRecording, view, syncStatus, isFocused, updateRealtimeStatus]);

  /**
   * Tablet/Pad optimization & focus monitoring
   */
  useEffect(() => {
    if (view !== 'STUDENT_EXAM' || !state.isRecording) return;

    if (state.isPad) {
      if (!isFocused || document.visibilityState === 'hidden') {
        if (!padViolationTimeoutRef.current) {
          padViolationTimeoutRef.current = setTimeout(() => {
            if (!document.hasFocus() && document.visibilityState === 'hidden') {
              handleLockdown('VIOLATION', "Security Violation: Page hidden and focus lost.");
            }
            padViolationTimeoutRef.current = null;
          }, 100);
        }
      } else {
        if (padViolationTimeoutRef.current) {
          clearTimeout(padViolationTimeoutRef.current);
          padViolationTimeoutRef.current = null;
        }
      }
    } else {
      if (!isFocused) {
        handleLockdown('VIOLATION', "Security Violation: Window focus was lost. Session locked and work downloaded.");
      }
    }

    return () => {
      if (padViolationTimeoutRef.current) {
        clearTimeout(padViolationTimeoutRef.current);
        padViolationTimeoutRef.current = null;
      }
    };
  }, [isFocused, view, state.isRecording, state.isPad, handleLockdown]);

  /**
   * Core Anti-Cheating Event Listeners
   */
  useEffect(() => {
    if (view === 'STUDENT_EXAM' && state.isRecording) {
      const isGracePeriod = () => {
        return state.isPad && sessionStartTimeRef.current !== 0 && (Date.now() - sessionStartTimeRef.current) < 2000;
      };

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          if (state.isPad) {
            if (!padViolationTimeoutRef.current) {
              padViolationTimeoutRef.current = setTimeout(() => {
                if (!document.hasFocus() && document.visibilityState === 'hidden') {
                  handleLockdown('VIOLATION', "Security Violation: Page hidden and focus lost.");
                }
                padViolationTimeoutRef.current = null;
              }, 100);
            }
          } else {
            handleLockdown('VIOLATION', "Security Violation: Page visibility lost. Session locked and work downloaded.");
          }
        } else if (state.isPad && padViolationTimeoutRef.current) {
          clearTimeout(padViolationTimeoutRef.current);
          padViolationTimeoutRef.current = null;
        }
      };

      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (isGracePeriod()) return;
        
        if (e.key === 'Escape') {
          e.preventDefault();
          handleLockdown('VIOLATION', "Security Violation: Escape key detected. Session locked and work downloaded.");
        }
        if (e.metaKey) {
          e.preventDefault();
          handleLockdown('VIOLATION', "Security Violation: Command key detected. Session locked and work downloaded.");
        }
        if (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'x')) {
          e.preventDefault();
          handleLockdown('VIOLATION', "Security Violation: Copy/Paste shortcut detected. Session locked and work downloaded.");
        }
      };

      const handleFullscreenChange = () => {
        if (state.isPad) return;
        const check = () => {
          if (!document.fullscreenElement && view === 'STUDENT_EXAM' && state.isRecording) {
            handleLockdown('VIOLATION', "Security Violation: Fullscreen mode exited. Session locked and work downloaded.");
          }
        };
        check();
      };

      const handleMouseLeave = (e: MouseEvent) => {
        if (state.isPad) return;
        if (!e.relatedTarget && !((e as any).toElement)) {
          if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
          leaveTimeoutRef.current = setTimeout(() => {
            handleLockdown('VIOLATION', "Security Violation: Mouse left the window. Session locked and work downloaded.");
          }, 500);
        }
      };

      const handleMouseEnter = () => {
        if (state.isPad) return;
        if (leaveTimeoutRef.current) {
          clearTimeout(leaveTimeoutRef.current);
          leaveTimeoutRef.current = null;
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!state.isRecording) return;
        if (state.isPad) return;
        
        if (leaveTimeoutRef.current) {
          clearTimeout(leaveTimeoutRef.current);
          leaveTimeoutRef.current = null;
        }

        setMousePos({ x: e.clientX, y: e.clientY });
        
        const margin = 50;
        setEdgeGlow({
          top: e.clientY < margin,
          bottom: e.clientY > window.innerHeight - margin,
          left: e.clientX < margin,
          right: e.clientX > window.innerWidth - margin
        });

        setIsMoving(true);
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = setTimeout(() => {
          setIsMoving(false);
        }, 150);
      };

      let lastHeight = window.innerHeight;
      const handleResize = () => {
        if (!state.isRecording) return;
        const currentHeight = window.innerHeight;

        if (state.isPad) {
          lastHeight = currentHeight;
          return;
        }

        if (document.fullscreenElement && currentHeight > lastHeight) {
          lastHeight = currentHeight;
          return;
        }
        
        if (currentHeight < lastHeight - 50) {
          handleLockdown('VIOLATION', "Security Violation: Viewport height reduced significantly. Session locked and work downloaded.");
        }
        lastHeight = currentHeight;
      };

      const handleSelectionChange = () => {
        if (state.isPad && textareaRef.current) {
          const el = textareaRef.current;
          if (el.selectionStart !== el.selectionEnd) {
            el.selectionStart = el.selectionEnd;
          }
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('contextmenu', handleContextMenu);
      document.addEventListener('selectionchange', handleSelectionChange);
      window.addEventListener('keydown', handleKeyDown);
      document.addEventListener('fullscreenchange', handleFullscreenChange);
      document.addEventListener('mouseleave', handleMouseLeave);
      document.addEventListener('mouseenter', handleMouseEnter);
      document.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('resize', handleResize);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        document.removeEventListener('contextmenu', handleContextMenu);
        document.removeEventListener('selectionchange', handleSelectionChange);
        window.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('mouseleave', handleMouseLeave);
        document.removeEventListener('mouseenter', handleMouseEnter);
        document.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('resize', handleResize);
        if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        if (padViolationTimeoutRef.current) clearTimeout(padViolationTimeoutRef.current);
      };
    }
  }, [view, state.isRecording, state.isPad, handleLockdown]);

  useEffect(() => {
    if (view === 'STUDENT_EXAM' && state.isRecording) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [view, state.isRecording]);

  useEffect(() => {
    const onFocus = () => setIsFocused(true);
    const onBlur = () => setIsFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  /**
   * Start Exam Flow
   */
  const startExam = async () => {
    if (!examEntry.name || !examEntry.code || !examEntry.title) {
      setDialog({ 
        isOpen: true, 
        message: 'Name, Room Code, and Title are all required.', 
        type: 'alert', 
        onConfirm: () => setDialog(d => ({ ...d, isOpen: false })) 
      });
      return;
    }

    const cleanedCode = cleanRoomCode(examEntry.code);
    const cleanedName = cleanStudentName(examEntry.name);
    
    if (!supabase) return;

    try {
      // 1. Verify Room Exists
      const { data: roomSnapshot, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', cleanedCode)
        .maybeSingle();

      if (!roomSnapshot) {
        setDialog({
          isOpen: true,
          message: 'Room not found. Please wait for the teacher to start the session.',
          type: 'alert',
          onConfirm: () => setDialog(d => ({ ...d, isOpen: false }))
        });
        return;
      }

      // 2. Verify Student Status
      const { data: studentSnapshot, error: studentError } = await supabase
        .from('students')
        .select('*')
        .eq('room_code', cleanedCode)
        .eq('student_key', cleanedName)
        .maybeSingle();

      if (studentSnapshot) {
        const status = studentSnapshot.status as StudentStatus;

        if (status === StudentStatus.SUBMITTED) {
          setDialog({
            isOpen: true,
            message: 'Access Denied: You have already submitted your exam. Ask teacher to reset if this is an error.',
            type: 'alert',
            onConfirm: () => setDialog(d => ({ ...d, isOpen: false }))
          });
          return;
        }

        if (status === StudentStatus.VIOLATION) {
          setDialog({
            isOpen: true,
            message: 'Access Denied: Your account is locked due to an environment violation.',
            type: 'alert',
            onConfirm: () => setDialog(d => ({ ...d, isOpen: false }))
          });
          return;
        }

        if (status === StudentStatus.ACTIVE || status === StudentStatus.PAUSED) {
          // If the student heartbeat shows they are active, block duplicate joins!
          const lastSeenDiff = Date.now() - new Date(studentSnapshot.last_seen).getTime();
          if (lastSeenDiff < 15000) {
            setDialog({
              isOpen: true,
              message: 'Access Denied: This student name is already active or joined in this room. Please use a different name or ask your teacher to reset access.',
              type: 'alert',
              onConfirm: () => setDialog(d => ({ ...d, isOpen: false }))
            });
            return;
          }
        }

        // If status is OFFLINE, allow resuming work
        setDialog({
          isOpen: true,
          message: 'Previous session detected. Resuming work...',
          type: 'alert',
          onConfirm: () => {
            setDialog(d => ({...d, isOpen: false}));
            executeJoin(studentSnapshot.content || '');
          }
        });
        return;
      }

      // 3. Insert Brand New Student Session
      const { error: insertError } = await supabase
        .from('students')
        .insert({
          room_code: cleanedCode,
          name: examEntry.name,
          student_key: cleanedName,
          title: examEntry.title,
          word_count: 0,
          content: '',
          status: StudentStatus.ACTIVE,
          last_seen: new Date().toISOString()
        });

      if (insertError) {
        console.error("Failed to register student:", insertError);
        return;
      }

      executeJoin('');
    } catch (error) {
      console.error("Validation Error:", error);
    }

    function executeJoin(draftContent: string) {
      const draft = draftContent || localStorage.getItem('writing_exam_draft');
      sessionStartTimeRef.current = Date.now();
      setIsFocused(true);
      setState(prev => ({
        ...prev,
        content: draft || '',
        wordCount: draft ? countWords(draft) : 0,
        totalSeconds: 0,
        isRecording: true,
        isPad: isPadEntry,
        examInfo: { name: examEntry.name, roomCode: examEntry.code, title: examEntry.title }
      }));
      
      subscribeToStudentRow(examEntry.code, examEntry.name);
      
      // Mark as ACTIVE inside DB
      supabase?.from('students')
        .update({ status: StudentStatus.ACTIVE, last_seen: new Date().toISOString() })
        .eq('room_code', cleanedCode)
        .eq('student_key', cleanedName)
        .then();

      setView('STUDENT_EXAM');
      
      if (!isPadEntry && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(e => {
          console.error("Fullscreen request failed:", e);
        });
      }
    }
  };

  const submitExam = () => {
    downloadPDF();
    handleLockdown('SUBMISSION', "Submission Successful: Your work has been saved and downloaded.");
    localStorage.removeItem('writing_exam_draft');
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (view === 'STUDENT_EXAM') {
      e.preventDefault();
      handleLockdown('VIOLATION', "Security Violation: Paste operation detected. Session locked and work downloaded.");
    }
  };

  const handleCopy = (e: React.ClipboardEvent) => {
    if (view === 'STUDENT_EXAM') {
      e.preventDefault();
      handleLockdown('VIOLATION', "Security Violation: Copy operation detected. Session locked and work downloaded.");
    }
  };

  const dashboardStats = useMemo(() => {
    if (!activeRoom) return { online: 0, manual: 0, passive: 0 };
    const students = Object.values(activeRoom.students) as StudentInfo[];
    return {
      online: students.filter(s => !isStudentOffline(s) && (s.status === StudentStatus.ACTIVE || s.status === StudentStatus.PAUSED)).length,
      manual: students.filter(s => s.status === StudentStatus.SUBMITTED).length,
      passive: students.filter(s => isStudentOffline(s) || s.status === StudentStatus.VIOLATION).length
    };
  }, [activeRoom, isStudentOffline, dashboardTicker]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8 md:mb-12">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Writing Monitoring System</h1>
            <p className="text-slate-500 font-medium text-sm">Professional Exam Monitor & Document Archiver</p>
          </div>
          <div className="flex items-center gap-4">
            {isSystemUnlocked && (
              <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-xs font-bold text-slate-600">Authorized Session</span>
                <button onClick={handleLogout} className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-700">Lock</button>
              </div>
            )}
            <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
              syncStatus === 'CONNECTED' ? 'bg-indigo-50 text-indigo-600 border-indigo-100 shadow-sm' : 
              syncStatus === 'CONFIG_REQUIRED' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-100 text-slate-400 border-slate-200'
            }`}>
              {syncStatus === 'CONNECTED' ? '● SYNC CONNECTED' : syncStatus === 'OFFLINE' ? '○ OFFLINE MODE' : '! CONFIG MISSING'}
            </div>
          </div>
        </header>

        {view === 'LOGIN' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-in fade-in zoom-in-95 duration-500">
            <div className="max-w-md w-full bg-white p-12 rounded-[3.5rem] shadow-2xl border border-slate-100 text-center space-y-8">
              <div className="w-20 h-20 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto">
                <svg className="w-10 h-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                </svg>
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">System Gate</h2>
                <p className="text-slate-400 font-medium">Please enter the platform assigned access password to proceed.</p>
              </div>
              <div className="space-y-4">
                <input 
                  type="password" 
                  placeholder="Access Password" 
                  className="w-full p-4 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none transition-all text-center font-bold text-lg" 
                  value={systemPassword} 
                  onChange={e => setSystemPassword(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && handleSystemPasswordGate()}
                />
              </div>
              <button 
                onClick={handleSystemPasswordGate}
                className="w-full flex items-center justify-center gap-3 py-5 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 transition-all shadow-xl active:scale-95"
              >
                Access System
              </button>
            </div>
          </div>
        )}

        {view === 'HOME' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
              <button onClick={() => setView('STUDENT_MODE')} className="group p-8 bg-white rounded-[2.5rem] shadow-sm border border-slate-200 text-left hover:shadow-2xl hover:border-indigo-500 transition-all duration-300">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </div>
                <h3 className="text-xl font-black mb-2">Student Portal</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Join a proctored room or start a local practice session.</p>
              </button>
              <button onClick={() => setView('TEACHER_SETUP')} className="group p-8 bg-white rounded-[2.5rem] shadow-sm border border-slate-200 text-left hover:shadow-2xl hover:border-indigo-500 transition-all duration-300">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <h3 className="text-xl font-black mb-2">Teacher Hub</h3>
                <p className="text-slate-400 text-sm leading-relaxed">Create rooms and monitor student progress in real-time.</p>
              </button>
            </div>
          </div>
        )}

        {view === 'STUDENT_MODE' && (
          <div className="max-w-md mx-auto space-y-4 animate-in zoom-in-95">
             <button 
               onClick={() => { 
                 const ua = navigator.userAgent;
                 const isPad = /iPad|Android|Tablet/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                 if (isPad) {
                   setDialog({
                     isOpen: true,
                     message: 'Device Mismatch: You are using a Pad/Tablet. Please use the "Enter Proctored Exam(With Pad)" mode instead.',
                     type: 'alert',
                     onConfirm: () => setDialog(d => ({ ...d, isOpen: false }))
                   });
                   return;
                 }
                 setIsPadEntry(false); 
                 setView('STUDENT_EXAM_ENTRY'); 
               }} 
               className="w-full p-6 bg-white rounded-2xl border-2 border-slate-100 font-black text-slate-700 hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
             >
               Enter Proctored Exam
             </button>
             <button 
               onClick={() => { 
                 const ua = navigator.userAgent;
                 const isPad = /iPad|Android|Tablet/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
                 if (!isPad) {
                   setDialog({
                     isOpen: true,
                     message: 'Access Denied: This mode is exclusively for iPad or Tablet devices.',
                     type: 'alert',
                     onConfirm: () => setDialog(d => ({ ...d, isOpen: false }))
                   });
                   return;
                 }
                 setIsPadEntry(true); 
                 setView('STUDENT_EXAM_ENTRY'); 
               }} 
               className="w-full p-6 bg-white rounded-2xl border-2 border-slate-100 font-black text-slate-700 hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm"
             >
               Enter Proctored Exam(With Pad)
             </button>
             <button onClick={() => setView('HOME')} className="w-full p-4 text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-slate-600">Cancel</button>
          </div>
        )}

        {view === 'STUDENT_EXAM_ENTRY' && (
          <div className="max-w-md mx-auto bg-white p-8 md:p-12 rounded-[3rem] shadow-2xl border border-slate-100 space-y-8 animate-in fade-in">
            <div>
              <h3 className="text-2xl font-black mb-1">Session Entrance {isPadEntry && <span className="text-indigo-600 text-sm ml-2">(Pad Mode)</span>}</h3>
              <p className="text-slate-400 text-sm">Please provide your credentials.</p>
            </div>
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Full Student Name" 
                className="w-full p-4 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none transition-all font-bold text-slate-800" 
                value={examEntry.name} 
                onChange={e => setExamEntry(v => ({...v, name: e.target.value}))}
                onKeyDown={e => e.key === 'Enter' && startExam()}
              />
              <input 
                type="text" 
                placeholder="Room Code" 
                className="w-full p-4 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none transition-all uppercase font-mono font-bold" 
                value={examEntry.code} 
                onChange={e => setExamEntry(v => ({...v, code: e.target.value.toUpperCase()}))} 
                onKeyDown={e => e.key === 'Enter' && startExam()}
              />
              <input 
                type="text" 
                placeholder="Writing Prompt/Title" 
                className="w-full p-4 bg-slate-50 rounded-xl border-2 border-transparent focus:border-indigo-500 outline-none transition-all" 
                value={examEntry.title} 
                onChange={e => setExamEntry(v => ({...v, title: e.target.value}))} 
                onKeyDown={e => e.key === 'Enter' && startExam()}
              />
            </div>
            <button onClick={startExam} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95">Start Exam</button>
          </div>
        )}

        {(view === 'STUDENT_EXAM') && (
          <div className="space-y-6 animate-in fade-in relative">
            <style>{`
              @keyframes pulse-ring {
                0% { transform: scale(0.8); opacity: 0.5; }
                50% { transform: scale(1.2); opacity: 0.2; }
                100% { transform: scale(0.8); opacity: 0.5; }
              }
              @keyframes pulse-core {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
              }
              .pulse-ring {
                animation: pulse-ring 2s infinite ease-in-out;
              }
              .pulse-core {
                animation: pulse-core 2s infinite ease-in-out;
              }
            `}</style>

            {state.isRecording && !state.isPad && (
              <>
                {edgeGlow.top && <div className="fixed top-0 left-0 right-0 h-24 bg-gradient-to-b from-rose-500/20 to-transparent pointer-events-none z-[60] animate-in fade-in duration-300" />}
                {edgeGlow.bottom && <div className="fixed bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-rose-500/20 to-transparent pointer-events-none z-[60] animate-in fade-in duration-300" />}
                {edgeGlow.left && <div className="fixed top-0 bottom-0 left-0 w-24 bg-gradient-to-r from-rose-500/20 to-transparent pointer-events-none z-[60] animate-in fade-in duration-300" />}
                {edgeGlow.right && <div className="fixed top-0 bottom-0 right-0 w-24 bg-gradient-to-l from-rose-500/20 to-transparent pointer-events-none z-[60] animate-in fade-in duration-300" />}
                
                <div 
                  className="fixed pointer-events-none z-[70] transition-transform duration-150 ease-out"
                  style={{ 
                    left: mousePos.x, 
                    top: mousePos.y,
                    transform: `translate(-50%, -50%) scale(${isMoving ? 0.7 : 1})`
                  }}
                >
                  <div className="absolute inset-0 w-12 h-12 -ml-6 -mt-6 rounded-full border-2 border-indigo-400/30 pulse-ring" />
                  <div className="w-2 h-2 rounded-full bg-indigo-500 pulse-core shadow-[0_0_8px_rgba(99,102,241,0.6)]" />
                </div>
              </>
            )}

            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm gap-4">
              <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
                <div className="flex gap-8 border-r border-slate-100 pr-8">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Session Duration</span>
                    <span className="font-mono text-2xl font-black text-indigo-600">{formatDuration(state.totalSeconds)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Word Count</span>
                    <span className="font-mono text-2xl font-black text-indigo-600">{state.wordCount}</span>
                  </div>
                </div>
                {view === 'STUDENT_EXAM' && state.examInfo && (
                  <div className="text-sm">
                    <p className="font-bold text-slate-700 uppercase text-[10px] tracking-widest mb-1 text-slate-400">Identity {state.isPad && <span className="text-indigo-500">(PAD)</span>}</p>
                    <p className="font-black text-slate-800">{state.examInfo.name} | <span className="text-indigo-600">{state.examInfo.roomCode}</span></p>
                    <p className="text-slate-500 italic truncate max-w-[200px]">{state.examInfo.title}</p>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-emerald-500 animate-pulse bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-100">CLOUD SYNCING</span>
                <button onClick={submitExam} className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all">
                  Submit Final
                </button>
              </div>
            </div>
            <textarea 
              ref={textareaRef}
              className="w-full min-h-[500px] h-[calc(100vh-280px)] p-8 md:p-16 bg-white rounded-[3.5rem] border border-slate-200 shadow-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/5 text-xl leading-relaxed text-slate-800 font-serif"
              placeholder="Begin writing here... Do NOT switch tabs or windows during proctored sessions."
              value={state.content}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onPaste={handlePaste}
              onCopy={handleCopy}
              onChange={e => {
                const content = e.target.value;
                setState(prev => ({ ...prev, content, wordCount: countWords(content) }));
              }}
            />
          </div>
        )}

        {view === 'TEACHER_SETUP' && (
          <div className="max-w-md mx-auto bg-white p-12 rounded-[3.5rem] shadow-2xl border border-slate-100 space-y-8 text-center animate-in fade-in">
            <h3 className="text-2xl font-black">Teacher Portal</h3>
            <p className="text-slate-400 text-sm">Create a room code to start monitoring.</p>
            <input 
              type="text" 
              placeholder="E.G. CLASS-A" 
              className="w-full p-6 bg-slate-50 rounded-[1.5rem] border-2 border-transparent focus:border-indigo-500 outline-none text-center font-black text-4xl tracking-tighter uppercase" 
              value={teacherEntry} 
              onChange={e => setTeacherEntry(e.target.value.toUpperCase())} 
              onKeyDown={e => {
                if (e.key === 'Enter' && teacherEntry) {
                  joinRoomAsTeacher(teacherEntry);
                }
              }}
            />
            <button onClick={() => teacherEntry && joinRoomAsTeacher(teacherEntry)} className="w-full py-6 bg-indigo-600 text-white rounded-[1.5rem] font-black shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Launch Dashboard</button>
            <button onClick={() => setView('HOME')} className="w-full p-4 text-slate-400 font-bold text-xs uppercase tracking-widest">Back</button>
          </div>
        )}

        {view === 'TEACHER_DASHBOARD' && activeRoom && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm gap-8">
               <div>
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Active Room</span>
                 <h2 className="text-4xl font-black text-indigo-600 leading-none">{activeRoom.roomCode}</h2>
               </div>
               
               <div className="flex flex-1 gap-6 justify-center">
                 <div className="text-center px-6 border-r border-slate-100">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Writing</p>
                   <p className="text-2xl font-black text-emerald-600">{dashboardStats.online}</p>
                 </div>
                 <div className="text-center px-6 border-r border-slate-100">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Submitted</p>
                   <p className="text-2xl font-black text-indigo-600">{dashboardStats.manual}</p>
                 </div>
                 <div className="text-center px-6">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Offline/Locked</p>
                   <p className="text-2xl font-black text-rose-600">{dashboardStats.passive}</p>
                 </div>
               </div>

               <div className="flex gap-4">
                 <button onClick={confirmStopExam} className="px-8 py-4 bg-rose-600 text-white rounded-2xl font-black hover:bg-rose-700 shadow-xl shadow-rose-100 transition-all">End Session</button>
               </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {Object.keys(activeRoom.students).length === 0 ? (
                <div className="col-span-full py-32 text-center text-slate-400 font-medium italic bg-white rounded-[2.5rem] border border-dashed border-slate-200">Waiting for students to join...</div>
              ) : (
                (Object.entries(activeRoom.students) as [string, StudentInfo][]).map(([key, student]) => {
                  const isOffline = isStudentOffline(student);
                  return (
                    <div key={key} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all flex flex-col">
                      <div className={`absolute top-0 right-0 w-2 h-full ${
                        isOffline ? 'bg-slate-300 animate-pulse' :
                        student.status === StudentStatus.ACTIVE ? 'bg-emerald-500' : 
                        student.status === StudentStatus.VIOLATION ? 'bg-rose-600 animate-pulse' :
                        student.status === StudentStatus.SUBMITTED ? 'bg-indigo-500' :
                        student.status === StudentStatus.PAUSED ? 'bg-amber-400' : 'bg-slate-200'
                      }`} />
                      <h4 className="font-black text-slate-900 text-xl truncate mb-1">{student.name}</h4>
                      <p className="text-xs text-slate-400 mb-6 truncate font-bold uppercase tracking-wide">{student.title}</p>
                      <div className="flex justify-between items-end mt-auto">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Words</span>
                          <span className="text-4xl font-black text-indigo-600 leading-none">{student.wordCount}</span>
                        </div>
                        <div className="text-right">
                          <span className={`text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest ${
                            isOffline ? 'bg-slate-100 text-slate-400' :
                            student.status === StudentStatus.ACTIVE ? 'bg-emerald-50 text-emerald-600' : 
                            student.status === StudentStatus.VIOLATION ? 'bg-rose-50 text-rose-600' :
                            student.status === StudentStatus.SUBMITTED ? 'bg-indigo-50 text-indigo-600' :
                            'bg-slate-100 text-slate-400'
                          }`}>
                            {isOffline ? 'OFFLINE' : student.status === StudentStatus.ACTIVE ? 'LIVE' : student.status}
                          </span>
                          {student.lockReason && (
                            <p className="text-[9px] font-bold text-rose-500 mt-2 uppercase tracking-tighter">
                              {student.lockReason}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-300 mt-3 font-mono">Last Seen: {new Date(student.lastSeen).toLocaleTimeString()}</p>
                        </div>
                      </div>
                      { (isOffline || student.status === StudentStatus.SUBMITTED || student.status === StudentStatus.VIOLATION || student.status === StudentStatus.PAUSED) && (
                        <button 
                          onClick={() => resetStudentStatus(key)}
                          className="mt-6 w-full py-3 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-black transition-all shadow-lg shadow-slate-200"
                        >
                          Reset Access
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {view === 'LOCKED' && (
          <div className="max-w-md mx-auto py-24 text-center space-y-8 animate-in zoom-in-95">
             <div className={`w-24 h-24 ${lockType === 'SUBMISSION' ? 'bg-indigo-50' : 'bg-rose-50'} rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl`}>
                <svg className={`w-12 h-12 ${lockType === 'SUBMISSION' ? 'text-indigo-600' : 'text-rose-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
             </div>
             <div>
                <h2 className="text-4xl font-black text-slate-900 mb-4">
                  {lockType === 'SUBMISSION' ? 'Submitted' : lockType === 'VIOLATION' ? 'Account Locked' : 'Session Ended'}
                </h2>
                <p className="text-slate-500 leading-relaxed font-medium">
                  {lockType === 'SUBMISSION' 
                    ? 'Your exam is complete. Your content has been securely saved and downloaded.' 
                    : lockType === 'VIOLATION'
                    ? 'The session was locked due to an environment violation. Your current draft was saved, but further editing is disabled.'
                    : 'The teacher has ended the session. Your work has been automatically downloaded.'}
                </p>
             </div>
             <button onClick={() => setView('HOME')} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black transition-all hover:bg-black shadow-xl">Return to Portal</button>
          </div>
        )}
      </div>

      <CustomDialog 
        isOpen={dialog.isOpen}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
        onConfirm={dialog.onConfirm}
        onCancel={() => setDialog(d => ({...d, isOpen: false}))}
      />
    </div>
  );
};

export default App;
