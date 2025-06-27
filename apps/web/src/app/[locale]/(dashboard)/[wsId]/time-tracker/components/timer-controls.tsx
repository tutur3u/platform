'use client';

import type { TimeTrackingCategory, WorkspaceTask } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  Tag,
  Timer,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
  TaskFilters,
} from '../types';
import {
  generateAssigneeInitials,
  getFilteredAndSortedTasks,
  useTaskCounts,
} from '../utils';

interface SessionTemplate {
  title: string;
  description?: string;
  category_id?: string;
  task_id?: string;
  tags?: string[];
  category?: TimeTrackingCategory;
  task?: WorkspaceTask;
  usage_count: number;
}

interface TaskBoard {
  id: string;
  name: string;
  created_at: string;
  task_lists: TaskList[];
}

interface TaskList {
  id: string;
  name: string;
  status: string;
  color: string;
  position: number;
}

interface TimerControlsProps {
  wsId: string;
  currentSession: SessionWithRelations | null;
  // eslint-disable-next-line no-unused-vars
  setCurrentSession: (session: SessionWithRelations | null) => void;
  elapsedTime: number;
  // eslint-disable-next-line no-unused-vars
  setElapsedTime: (time: number) => void;
  isRunning: boolean;
  // eslint-disable-next-line no-unused-vars
  setIsRunning: (running: boolean) => void;
  categories: TimeTrackingCategory[];
  tasks: ExtendedWorkspaceTask[];
  onSessionUpdate: () => void;
  // eslint-disable-next-line no-unused-vars
  formatTime: (seconds: number) => string;
  // eslint-disable-next-line no-unused-vars
  formatDuration: (seconds: number) => string;
  // eslint-disable-next-line no-unused-vars
  apiCall: <T>(url: string, options?: RequestInit) => Promise<T>;
  isDraggingTask?: boolean;
  onGoToTasksTab?: () => void;
  currentUserId?: string;
}

// Pomodoro timer types and interfaces
interface PomodoroSettings {
  focusTime: number; // in minutes
  shortBreakTime: number; // in minutes
  longBreakTime: number; // in minutes
  sessionsUntilLongBreak: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  enableNotifications: boolean;
  enable2020Rule: boolean; // 20-20-20 eye rest rule
  enableMovementReminder: boolean;
}

type TimerMode = 'stopwatch' | 'pomodoro' | 'custom';
type SessionType = 'focus' | 'short-break' | 'long-break';
type CustomTimerType = 'enhanced-stopwatch' | 'traditional-countdown';

interface CountdownState {
  targetTime: number; // in seconds
  remainingTime: number; // in seconds
  sessionType: SessionType;
  pomodoroSession: number; // current session number (1-4)
  cycleCount: number; // number of completed pomodoro cycles
}

interface CustomTimerSettings {
  type: CustomTimerType;

  // Enhanced Stopwatch Settings
  targetDuration?: number; // in minutes - goal to reach
  enableIntervalBreaks?: boolean;
  intervalBreakDuration?: number; // in minutes (default: 5)
  intervalFrequency?: number; // break every X minutes (default: 25)
  showProgressToTarget?: boolean;
  enableTargetNotification?: boolean;
  autoStopAtTarget?: boolean;

  // Traditional Countdown Settings
  countdownDuration?: number; // in minutes
  autoRestart?: boolean;
  showTimeRemaining?: boolean;

  // Shared Settings
  enableBreakReminders?: boolean;
  playCompletionSound?: boolean;
  showNotifications?: boolean;
  enableMotivationalMessages?: boolean;
}

interface StopwatchSettings {
  enableBreakReminders?: boolean;
  enable2020Rule?: boolean; // 20-20-20 eye rest rule
  enableMovementReminder?: boolean;
  showProductivityInsights?: boolean;
  enableNotifications?: boolean;
  enableSessionMilestones?: boolean; // notifications at 30min, 1hr, 2hr etc
  playCompletionSound?: boolean;
}

// Separate break time tracking for each timer mode
interface BreakTimeState {
  lastEyeBreakTime: number;
  lastMovementBreakTime: number;
  lastIntervalBreakTime: number;
  intervalBreaksCount: number;
}

// Session state for each timer mode to prevent data corruption
interface TimerModeSession {
  mode: TimerMode;
  sessionId: string | null;
  startTime: Date | null;
  elapsedTime: number;
  breakTimeState: BreakTimeState;
  // Mode-specific data
  pomodoroState?: CountdownState;
  customTimerState?: {
    hasReachedTarget: boolean;
    targetProgress: number;
  };
}

// Active session protection
interface SessionProtection {
  isActive: boolean;
  currentMode: TimerMode;
  canSwitchModes: boolean;
  canModifySettings: boolean;
}

interface PausedSessionData {
  sessionId: string;
  elapsed: number;
  pauseTime: string; // ISO string
  timerMode: TimerMode;
}

// Default Pomodoro settings
const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusTime: 25,
  shortBreakTime: 5,
  longBreakTime: 15,
  sessionsUntilLongBreak: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  enableNotifications: true,
  enable2020Rule: true,
  enableMovementReminder: true,
};

// Default Stopwatch settings
const DEFAULT_STOPWATCH_SETTINGS: StopwatchSettings = {
  enableBreakReminders: true,
  enable2020Rule: true,
  enableMovementReminder: true,
  showProductivityInsights: true,
  enableNotifications: true,
  enableSessionMilestones: true,
  playCompletionSound: true,
};

export function TimerControls({
  wsId,
  currentSession,
  setCurrentSession,
  elapsedTime,
  setElapsedTime,
  isRunning,
  setIsRunning,
  categories,
  tasks,
  onSessionUpdate,
  formatTime,
  formatDuration,
  apiCall,
  isDraggingTask = false,
  onGoToTasksTab,
  currentUserId,
}: TimerControlsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDescription, setNewSessionDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('none');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('none');
  const [sessionMode, setSessionMode] = useState<'task' | 'manual'>('task');
  const [showTaskSuggestion, setShowTaskSuggestion] = useState(false);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [justCompleted, setJustCompleted] =
    useState<SessionWithRelations | null>(null);

  // Enhanced pause/resume state
  const [pausedSession, setPausedSession] =
    useState<SessionWithRelations | null>(null);
  const [pausedElapsedTime, setPausedElapsedTime] = useState(0);
  const [pauseStartTime, setPauseStartTime] = useState<Date | null>(null);

  // Pomodoro and timer mode state
  const [timerMode, setTimerMode] = useState<TimerMode>('stopwatch');
  const [pomodoroSettings, setPomodoroSettings] = useState<PomodoroSettings>(
    DEFAULT_POMODORO_SETTINGS
  );
  const [countdownState, setCountdownState] = useState<CountdownState>({
    targetTime: 25 * 60, // 25 minutes in seconds
    remainingTime: 25 * 60,
    sessionType: 'focus',
    pomodoroSession: 1,
    cycleCount: 0,
  });

  const [customTimerSettings, setCustomTimerSettings] =
    useState<CustomTimerSettings>({
      type: 'enhanced-stopwatch',

      // Enhanced Stopwatch defaults
      targetDuration: 60, // 1 hour goal
      enableIntervalBreaks: true,
      intervalBreakDuration: 5,
      intervalFrequency: 25, // break every 25 minutes
      showProgressToTarget: true,
      enableTargetNotification: true,
      autoStopAtTarget: false,

      // Traditional Countdown defaults
      countdownDuration: 25,
      autoRestart: false,
      showTimeRemaining: true,

      // Shared defaults
      enableBreakReminders: true,
      playCompletionSound: true,
      showNotifications: true,
      enableMotivationalMessages: true,
    });
  const [showPomodoroSettings, setShowPomodoroSettings] = useState(false);
  const [showCustomSettings, setShowCustomSettings] = useState(false);
  const [showStopwatchSettings, setShowStopwatchSettings] = useState(false);

  // Enhanced stopwatch state (legacy - kept for hasReachedTarget)
  const [hasReachedTarget, setHasReachedTarget] = useState<boolean>(false);

  // Stopwatch settings state
  const [stopwatchSettings, setStopwatchSettings] = useState<StopwatchSettings>(
    DEFAULT_STOPWATCH_SETTINGS
  );

  // Session protection state
  const [sessionProtection, setSessionProtection] = useState<SessionProtection>(
    {
      isActive: false,
      currentMode: 'stopwatch',
      canSwitchModes: true,
      canModifySettings: true,
    }
  );

  // Separate break time tracking for each timer mode
  const [stopwatchBreakState, setStopwatchBreakState] =
    useState<BreakTimeState>({
      lastEyeBreakTime: Date.now(),
      lastMovementBreakTime: Date.now(),
      lastIntervalBreakTime: Date.now(),
      intervalBreaksCount: 0,
    });

  const [pomodoroBreakState, setPomodoroBreakState] = useState<BreakTimeState>({
    lastEyeBreakTime: Date.now(),
    lastMovementBreakTime: Date.now(),
    lastIntervalBreakTime: Date.now(),
    intervalBreaksCount: 0,
  });

  const [customBreakState, setCustomBreakState] = useState<BreakTimeState>({
    lastEyeBreakTime: Date.now(),
    lastMovementBreakTime: Date.now(),
    lastIntervalBreakTime: Date.now(),
    intervalBreaksCount: 0,
  });

  // Timer mode sessions for persistence
  const [timerModeSessions, setTimerModeSessions] = useState<{
    [key in TimerMode]: TimerModeSession | null;
  }>({
    stopwatch: null,
    pomodoro: null,
    custom: null,
  });

  // Legacy break reminders state (kept for lastNotificationTime only)
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(0);

  // localStorage keys for persistence
  const PAUSED_SESSION_KEY = `paused-session-${wsId}-${currentUserId || 'user'}`;
  const TIMER_MODE_SESSIONS_KEY = `timer-mode-sessions-${wsId}-${currentUserId || 'user'}`;

  const clearPausedSessionFromStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(PAUSED_SESSION_KEY);
      } catch (error) {
        console.warn(
          'Failed to clear paused session from localStorage:',
          error
        );
      }
    }
  }, [PAUSED_SESSION_KEY]);

  // Helper function to re-fetch session details by ID
  const fetchSessionById = useCallback(
    async (sessionId: string): Promise<SessionWithRelations | null> => {
      try {
        const response = await apiCall(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionId}`
        );
        return response.session || null;
      } catch (error) {
        console.warn('Failed to fetch session details:', error);
        return null;
      }
    },
    [apiCall, wsId]
  );

  // Helper functions for localStorage persistence (storing only minimal data)
  const savePausedSessionToStorage = useCallback(
    (session: SessionWithRelations, elapsed: number, pauseTime: Date) => {
      if (typeof window !== 'undefined') {
        try {
          const pausedData: PausedSessionData = {
            sessionId: session.id,
            elapsed,
            pauseTime: pauseTime.toISOString(),
            timerMode,
          };
          localStorage.setItem(PAUSED_SESSION_KEY, JSON.stringify(pausedData));
        } catch (error) {
          console.warn('Failed to save paused session to localStorage:', error);
        }
      }
    },
    [PAUSED_SESSION_KEY, timerMode]
  );

  const loadPausedSessionFromStorage = useCallback(async () => {
    if (typeof window !== 'undefined') {
      try {
        const pausedDataStr = localStorage.getItem(PAUSED_SESSION_KEY);

        if (pausedDataStr) {
          const pausedData: PausedSessionData = JSON.parse(pausedDataStr);

          // Re-fetch the full session details by ID
          const session = await fetchSessionById(pausedData.sessionId);

          if (session) {
            const elapsed = pausedData.elapsed;
            const pauseTime = new Date(pausedData.pauseTime);

            setPausedSession(session);
            setPausedElapsedTime(elapsed);
            setPauseStartTime(pauseTime);

            // Restore timer mode if different
            if (pausedData.timerMode !== timerMode) {
              setTimerMode(pausedData.timerMode);
            }

            return { session, elapsed, pauseTime };
          } else {
            // Session not found, clear invalid data
            clearPausedSessionFromStorage();
          }
        }
      } catch (error) {
        console.warn('Failed to load paused session from localStorage:', error);
        clearPausedSessionFromStorage();
      }
    }
    return null;
  }, [
    PAUSED_SESSION_KEY,
    fetchSessionById,
    timerMode,
    clearPausedSessionFromStorage,
  ]);

  // Session protection utilities
  const updateSessionProtection = useCallback(
    (isActive: boolean, mode: TimerMode) => {
      setSessionProtection({
        isActive,
        currentMode: mode,
        canSwitchModes: !isActive,
        canModifySettings: !isActive,
      });
    },
    []
  );

  const getCurrentBreakState = useCallback(() => {
    switch (timerMode) {
      case 'stopwatch':
        return stopwatchBreakState;
      case 'pomodoro':
        return pomodoroBreakState;
      case 'custom':
        return customBreakState;
      default:
        return stopwatchBreakState;
    }
  }, [timerMode, stopwatchBreakState, pomodoroBreakState, customBreakState]);

  const updateCurrentBreakState = useCallback(
    (updates: Partial<BreakTimeState>) => {
      switch (timerMode) {
        case 'stopwatch':
          setStopwatchBreakState((prev) => ({ ...prev, ...updates }));
          break;
        case 'pomodoro':
          setPomodoroBreakState((prev) => ({ ...prev, ...updates }));
          break;
        case 'custom':
          setCustomBreakState((prev) => ({ ...prev, ...updates }));
          break;
      }
    },
    [timerMode]
  );

  // Safe timer mode switching with validation
  const handleTimerModeChange = useCallback(
    (newMode: TimerMode) => {
      // Prevent mode switching if session is active
      if (sessionProtection.isActive) {
        toast.error('Cannot switch timer modes during an active session', {
          description: 'Please stop or pause your current timer first.',
          duration: 4000,
        });
        return;
      }

      // Save current mode session state if exists
      if (currentSession) {
        const currentBreakState = getCurrentBreakState();
        const sessionData: TimerModeSession = {
          mode: timerMode,
          sessionId: currentSession.id,
          startTime: currentSession.start_time
            ? new Date(currentSession.start_time)
            : null,
          elapsedTime: elapsedTime,
          breakTimeState: currentBreakState,
          pomodoroState: timerMode === 'pomodoro' ? countdownState : undefined,
          customTimerState:
            timerMode === 'custom'
              ? {
                  hasReachedTarget,
                  targetProgress:
                    elapsedTime /
                    ((customTimerSettings.targetDuration || 60) * 60),
                }
              : undefined,
        };

        setTimerModeSessions((prev) => ({
          ...prev,
          [timerMode]: sessionData,
        }));
      }

      // Switch to new mode
      setTimerMode(newMode);

      // Restore previous session for new mode if exists
      const previousSession = timerModeSessions[newMode];
      if (previousSession?.sessionId) {
        // Restore the session state
        setElapsedTime(previousSession.elapsedTime);

        // Restore break state for new mode
        switch (newMode) {
          case 'stopwatch':
            setStopwatchBreakState(previousSession.breakTimeState);
            break;
          case 'pomodoro':
            setPomodoroBreakState(previousSession.breakTimeState);
            if (previousSession.pomodoroState) {
              setCountdownState(previousSession.pomodoroState);
            }
            break;
          case 'custom':
            setCustomBreakState(previousSession.breakTimeState);
            if (previousSession.customTimerState) {
              setHasReachedTarget(
                previousSession.customTimerState.hasReachedTarget
              );
            }
            break;
        }

        toast.success(`Switched to ${newMode} mode`, {
          description: `Restored previous session with ${formatDuration(previousSession.elapsedTime)} tracked`,
          duration: 3000,
        });
      } else {
        toast.success(`Switched to ${newMode} mode`, {
          description: 'Ready to start a new session',
          duration: 2000,
        });
      }
    },
    [
      sessionProtection.isActive,
      currentSession,
      timerMode,
      elapsedTime,
      getCurrentBreakState,
      countdownState,
      hasReachedTarget,
      customTimerSettings.targetDuration,
      timerModeSessions,
      setElapsedTime,
      formatDuration,
    ]
  );

  // Persistence for timer mode sessions
  const saveTimerModeSessionsToStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          TIMER_MODE_SESSIONS_KEY,
          JSON.stringify(timerModeSessions)
        );
      } catch (error) {
        console.warn(
          'Failed to save timer mode sessions to localStorage:',
          error
        );
      }
    }
  }, [TIMER_MODE_SESSIONS_KEY, timerModeSessions]);

  const loadTimerModeSessionsFromStorage = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        const sessionsData = localStorage.getItem(TIMER_MODE_SESSIONS_KEY);
        if (sessionsData) {
          const sessions = JSON.parse(sessionsData);
          setTimerModeSessions(sessions);
          return sessions;
        }
      } catch (error) {
        console.warn(
          'Failed to load timer mode sessions from localStorage:',
          error
        );
      }
    }
    return null;
  }, [TIMER_MODE_SESSIONS_KEY]);

  // Load paused session on component mount
  useEffect(() => {
    const loadData = async () => {
      const pausedData = await loadPausedSessionFromStorage();
      if (pausedData) {
        console.log(
          'Restored paused session from localStorage:',
          pausedData.session.title
        );

        // Show a toast to let user know their paused session was restored
        toast.success('Paused session restored!', {
          description: `${pausedData.session.title} - ${formatDuration(pausedData.elapsed)} tracked`,
          duration: 5000,
        });
      }

      // Load timer mode sessions
      loadTimerModeSessionsFromStorage();
    };

    loadData();
  }, [
    loadPausedSessionFromStorage,
    loadTimerModeSessionsFromStorage,
    formatDuration,
  ]);

  // Update session protection when timer state changes
  useEffect(() => {
    const isActive = isRunning || !!currentSession || !!pausedSession;
    updateSessionProtection(isActive, timerMode);
  }, [
    isRunning,
    currentSession,
    pausedSession,
    timerMode,
    updateSessionProtection,
  ]);

  // Save timer mode sessions when they change
  useEffect(() => {
    saveTimerModeSessionsToStorage();
  }, [saveTimerModeSessionsToStorage]);

  // Cleanup paused session if user changes or component unmounts
  useEffect(() => {
    return () => {
      // Only clear if we have a different user or workspace
      const keys = Object.keys(localStorage).filter(
        (key) =>
          key.startsWith('paused-session-') &&
          !key.includes(`-${wsId}-${currentUserId}`)
      );
      keys.forEach((key) => {
        // Also clean up legacy keys (paused-elapsed and pause-time)
        const relatedKeys = [
          key,
          key.replace('paused-session-', 'paused-elapsed-'),
          key.replace('paused-session-', 'pause-time-'),
        ];
        relatedKeys.forEach((k) => localStorage.removeItem(k));
      });
    };
  }, [wsId, currentUserId]);

  // Cleanup AudioContext on component unmount
  useEffect(() => {
    return () => {
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== 'closed'
      ) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Task search and filter state
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [taskFilters, setTaskFilters] = useState<TaskFilters>({
    priority: 'all',
    status: 'all',
    board: 'all',
    list: 'all',
    assignee: 'all',
  });
  const [isTaskDropdownOpen, setIsTaskDropdownOpen] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);

  // Dropdown positioning state
  const [dropdownPosition, setDropdownPosition] = useState<'below' | 'above'>(
    'below'
  );

  // Refs for positioning
  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const dropdownContentRef = useRef<HTMLDivElement>(null);

  // Refs for timer state to avoid interval recreation
  const elapsedTimeRef = useRef(elapsedTime);
  const hasReachedTargetRef = useRef(hasReachedTarget);
  const getCurrentBreakStateRef = useRef(getCurrentBreakState);
  const updateCurrentBreakStateRef = useRef(updateCurrentBreakState);

  // Ref for singleton AudioContext to prevent resource leaks
  const audioContextRef = useRef<AudioContext | null>(null);

  // Update refs when values change
  useEffect(() => {
    elapsedTimeRef.current = elapsedTime;
  }, [elapsedTime]);

  useEffect(() => {
    hasReachedTargetRef.current = hasReachedTarget;
  }, [hasReachedTarget]);

  useEffect(() => {
    getCurrentBreakStateRef.current = getCurrentBreakState;
  }, [getCurrentBreakState]);

  useEffect(() => {
    updateCurrentBreakStateRef.current = updateCurrentBreakState;
  }, [updateCurrentBreakState]);

  // Task creation state
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [showTaskCreation, setShowTaskCreation] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Use memoized task counts
  const { myTasksCount, unassignedCount } = useTaskCounts(tasks);

  // Notification and sound functions
  const playNotificationSound = useCallback(() => {
    if ('Audio' in window) {
      try {
        // Lazily create a singleton AudioContext to prevent resource leaks
        if (!audioContextRef.current) {
          audioContextRef.current = new (
            window.AudioContext ||
            (window as unknown as Window).webkitAudioContext
          )();
        }

        const audioContext = audioContextRef.current;

        // Resume context if suspended (required for some browsers)
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(
          600,
          audioContext.currentTime + 0.1
        );

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          0.01,
          audioContext.currentTime + 0.5
        );

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
      } catch (error) {
        console.warn('Could not play notification sound:', error);
      }
    }
  }, []);

  const showNotification = useCallback(
    (
      title: string,
      body: string,
      actions?: { title: string; action: () => void }[]
    ) => {
      // Check if notifications are enabled and supported
      if (
        !pomodoroSettings.enableNotifications ||
        !('Notification' in window)
      ) {
        return;
      }

      // Request permission if needed
      if (Notification.permission === 'default') {
        Notification.requestPermission();
        return;
      }

      if (Notification.permission === 'granted') {
        const notification = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: 'pomodoro-timer',
          requireInteraction: true,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        // Auto-close after 10 seconds
        setTimeout(() => notification.close(), 10000);
      }

      // Also show a toast notification
      toast.info(title, {
        description: body,
        duration: 5000,
        action: actions?.[0]
          ? {
              label: actions[0].title,
              onClick: actions[0].action,
            }
          : undefined,
      });

      playNotificationSound();
    },
    [pomodoroSettings.enableNotifications, playNotificationSound]
  );

  // Pomodoro timer logic
  const startPomodoroSession = useCallback(
    (sessionType: SessionType) => {
      let duration: number;

      switch (sessionType) {
        case 'focus':
          duration = pomodoroSettings.focusTime * 60;
          break;
        case 'short-break':
          duration = pomodoroSettings.shortBreakTime * 60;
          break;
        case 'long-break':
          duration = pomodoroSettings.longBreakTime * 60;
          break;
      }

      setCountdownState((prev) => ({
        ...prev,
        targetTime: duration,
        remainingTime: duration,
        sessionType,
      }));

      const sessionName =
        sessionType === 'focus'
          ? 'Focus Session'
          : sessionType === 'short-break'
            ? 'Short Break'
            : 'Long Break';

      showNotification(
        `${sessionName} Started!`,
        `${Math.floor(duration / 60)} minutes of ${sessionType === 'focus' ? 'focused work' : 'break time'}`
      );
    },
    [pomodoroSettings, showNotification]
  );

  const handlePomodoroComplete = useCallback(() => {
    const { sessionType, pomodoroSession } = countdownState;

    if (sessionType === 'focus') {
      // Focus session completed
      const nextSession = pomodoroSession + 1;
      const isTimeForLongBreak =
        nextSession > pomodoroSettings.sessionsUntilLongBreak;

      setCountdownState((prev) => ({
        ...prev,
        pomodoroSession: isTimeForLongBreak ? 1 : nextSession,
        cycleCount: isTimeForLongBreak ? prev.cycleCount + 1 : prev.cycleCount,
      }));

      showNotification(
        'Focus Session Complete! 🎉',
        `Great work! Time for a ${isTimeForLongBreak ? 'long' : 'short'} break.`,
        [
          {
            title: 'Start Break',
            action: () =>
              startPomodoroSession(
                isTimeForLongBreak ? 'long-break' : 'short-break'
              ),
          },
        ]
      );

      if (!pomodoroSettings.autoStartBreaks) {
        // Pause timer and wait for user action
        setIsRunning(false);
      } else {
        startPomodoroSession(isTimeForLongBreak ? 'long-break' : 'short-break');
      }
    } else {
      // Break completed
      showNotification('Break Complete! ⚡', 'Ready to focus again?', [
        {
          title: 'Start Focus',
          action: () => startPomodoroSession('focus'),
        },
      ]);

      if (!pomodoroSettings.autoStartFocus) {
        setIsRunning(false);
      } else {
        startPomodoroSession('focus');
      }
    }
  }, [
    countdownState,
    pomodoroSettings,
    showNotification,
    startPomodoroSession,
    setIsRunning,
  ]);

  // Break reminder logic - mode-aware
  const checkBreakReminders = useCallback(() => {
    const now = Date.now();
    const currentBreakState = getCurrentBreakState();

    // Get settings based on current timer mode
    let enableEyeBreaks = false;
    let enableMovementBreaks = false;

    switch (timerMode) {
      case 'stopwatch':
        enableEyeBreaks = stopwatchSettings.enable2020Rule || false;
        enableMovementBreaks =
          stopwatchSettings.enableMovementReminder || false;
        break;
      case 'pomodoro':
        enableEyeBreaks = pomodoroSettings.enable2020Rule;
        enableMovementBreaks = pomodoroSettings.enableMovementReminder;
        break;
      case 'custom':
        enableEyeBreaks = customTimerSettings.enableBreakReminders || false;
        enableMovementBreaks =
          customTimerSettings.enableBreakReminders || false;
        break;
    }

    // 20-20-20 rule: Every 20 minutes, look at something 20 feet away for 20 seconds
    if (
      enableEyeBreaks &&
      now - currentBreakState.lastEyeBreakTime > 20 * 60 * 1000 && // 20 minutes
      isRunning &&
      (timerMode === 'stopwatch' || countdownState.sessionType === 'focus')
    ) {
      if (now - lastNotificationTime > 5 * 60 * 1000) {
        // Don't spam notifications
        showNotification(
          'Eye Break Time! 👁️',
          'Look at something 20 feet away for 20 seconds'
        );
        updateCurrentBreakState({ lastEyeBreakTime: now });
        setLastNotificationTime(now);
      }
    }

    // Movement reminder: Every 60 minutes
    if (
      enableMovementBreaks &&
      now - currentBreakState.lastMovementBreakTime > 60 * 60 * 1000 && // 60 minutes
      isRunning &&
      (timerMode === 'stopwatch' || countdownState.sessionType === 'focus')
    ) {
      if (now - lastNotificationTime > 5 * 60 * 1000) {
        showNotification(
          'Movement Break! 🚶',
          'Time to stand up and stretch for a few minutes'
        );
        updateCurrentBreakState({ lastMovementBreakTime: now });
        setLastNotificationTime(now);
      }
    }

    // Session milestones for stopwatch mode
    if (
      timerMode === 'stopwatch' &&
      stopwatchSettings.enableSessionMilestones &&
      isRunning
    ) {
      const elapsedMinutes = Math.floor(elapsedTimeRef.current / 60);
      const milestones = [30, 60, 120, 180, 240]; // 30min, 1hr, 2hr, 3hr, 4hr

      for (const milestone of milestones) {
        if (
          elapsedMinutes === milestone &&
          now - lastNotificationTime > 5 * 60 * 1000
        ) {
          const hours = Math.floor(milestone / 60);
          const mins = milestone % 60;
          const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

          showNotification(
            `🎯 Session Milestone! (${timeStr})`,
            stopwatchSettings.showProductivityInsights
              ? `Great focus! You've been working for ${timeStr}. Consider taking a break soon.`
              : `You've reached ${timeStr} of focused work.`
          );
          setLastNotificationTime(now);
          break;
        }
      }
    }
  }, [
    timerMode,
    getCurrentBreakState,
    updateCurrentBreakState,
    stopwatchSettings,
    pomodoroSettings,
    customTimerSettings,
    lastNotificationTime,
    isRunning,
    countdownState.sessionType,
    showNotification,
  ]);

  // Update countdown timer (for pomodoro and traditional countdown modes)
  useEffect(() => {
    if (
      (timerMode === 'pomodoro' ||
        (timerMode === 'custom' &&
          customTimerSettings.type === 'traditional-countdown')) &&
      isRunning &&
      countdownState.remainingTime > 0
    ) {
      const interval = setInterval(() => {
        setCountdownState((prev) => {
          const newRemainingTime = prev.remainingTime - 1;

          if (newRemainingTime <= 0) {
            if (timerMode === 'pomodoro') {
              handlePomodoroComplete();
            } else if (
              timerMode === 'custom' &&
              customTimerSettings.type === 'traditional-countdown'
            ) {
              // Handle traditional countdown completion
              showNotification(
                'Countdown Complete! ⏰',
                customTimerSettings.enableMotivationalMessages
                  ? "Great work! You've completed your custom countdown timer."
                  : 'Your countdown has finished.',
                customTimerSettings.autoRestart
                  ? [
                      {
                        title: 'Auto-restart in 3s...',
                        action: () => {},
                      },
                    ]
                  : undefined
              );

              if (customTimerSettings.playCompletionSound) {
                playNotificationSound();
              }

              if (customTimerSettings.autoRestart) {
                // Auto-restart after 3 seconds
                setTimeout(() => {
                  const restartDuration =
                    (customTimerSettings.countdownDuration || 25) * 60;
                  setCountdownState((prev) => ({
                    ...prev,
                    targetTime: restartDuration,
                    remainingTime: restartDuration,
                  }));
                }, 3000);
              } else {
                setIsRunning(false);
              }
            }
            return { ...prev, remainingTime: 0 };
          }

          return { ...prev, remainingTime: newRemainingTime };
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [
    timerMode,
    isRunning,
    countdownState.remainingTime,
    customTimerSettings,
    handlePomodoroComplete,
    showNotification,
    playNotificationSound,
    setIsRunning,
  ]);

  // Enhanced stopwatch interval breaks and target monitoring
  useEffect(() => {
    if (
      timerMode === 'custom' &&
      customTimerSettings.type === 'enhanced-stopwatch' &&
      isRunning
    ) {
      const interval = setInterval(() => {
        const currentTime = Date.now();
        const elapsedMinutes = Math.floor(elapsedTimeRef.current / 60);
        const targetMinutes = customTimerSettings.targetDuration || 60;

        // Check for interval breaks
        if (customTimerSettings.enableIntervalBreaks) {
          const intervalFreq = customTimerSettings.intervalFrequency || 25;
          const currentBreakState = getCurrentBreakStateRef.current();
          const timeSinceLastBreak = Math.floor(
            (currentTime - currentBreakState.lastIntervalBreakTime) /
              (1000 * 60)
          );

          if (timeSinceLastBreak >= intervalFreq) {
            const breakDuration =
              customTimerSettings.intervalBreakDuration || 5;
            const newBreaksCount = currentBreakState.intervalBreaksCount + 1;

            updateCurrentBreakStateRef.current({
              intervalBreaksCount: newBreaksCount,
              lastIntervalBreakTime: currentTime,
            });

            showNotification(
              `🕒 Interval Break Time! (${newBreaksCount})`,
              `Take a ${breakDuration}-minute break - you've been working for ${intervalFreq} minutes`,
              [
                {
                  title: 'Got it!',
                  action: () => {},
                },
              ]
            );

            if (customTimerSettings.playCompletionSound) {
              playNotificationSound();
            }
          }
        }

        // Check for target achievement
        if (!hasReachedTargetRef.current && elapsedMinutes >= targetMinutes) {
          setHasReachedTarget(true);

          if (customTimerSettings.enableTargetNotification) {
            showNotification(
              `🎯 Target Achieved! (${targetMinutes} min)`,
              customTimerSettings.enableMotivationalMessages
                ? "Congratulations! You've reached your target duration. Keep going or take a well-deserved break!"
                : `You've completed your ${targetMinutes}-minute goal.`,
              [
                {
                  title: customTimerSettings.autoStopAtTarget
                    ? 'Timer Stopped'
                    : 'Keep Going',
                  action: () => {},
                },
              ]
            );

            if (customTimerSettings.playCompletionSound) {
              playNotificationSound();
            }

            if (customTimerSettings.autoStopAtTarget) {
              setIsRunning(false);
              // Optionally stop the session completely
              // stopTimer();
            }
          }
        }

        // Check for break reminders (if enabled)
        if (customTimerSettings.enableBreakReminders) {
          checkBreakReminders();
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [
    timerMode,
    customTimerSettings,
    isRunning,
    showNotification,
    playNotificationSound,
    checkBreakReminders,
    setIsRunning,
  ]);

  // Fetch boards with lists
  const fetchBoards = useCallback(async () => {
    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/boards-with-lists`
      );
      setBoards(response.boards || []);
    } catch (error) {
      console.error('Error fetching boards:', error);
      toast.error('Failed to load boards');
    }
  }, [wsId, apiCall]);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/templates`
      );
      setTemplates(response.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  }, [wsId, apiCall]);

  useEffect(() => {
    fetchTemplates();
    fetchBoards();
  }, [fetchTemplates, fetchBoards]);

  // Handle task selection change
  const handleTaskSelectionChange = useCallback(
    (taskId: string) => {
      setSelectedTaskId(taskId);
      if (taskId && taskId !== 'none') {
        const selectedTask = tasks.find((t) => t.id === taskId);
        if (selectedTask) {
          // Set task mode and populate fields (same as drag & drop)
          setSessionMode('task');
          setNewSessionTitle(`Working on: ${selectedTask.name}`);
          setNewSessionDescription(selectedTask.description || '');

          // Show success feedback (same as drag & drop)
          toast.success(`Task "${selectedTask.name}" ready to track!`, {
            description:
              'Click Start Timer to begin tracking time for this task.',
            duration: 3000,
          });

          // Close dropdown and exit search mode
          setIsTaskDropdownOpen(false);
          setIsSearchMode(false);
          setTaskSearchQuery('');
        }
      } else {
        // Reset when no task selected
        setNewSessionTitle('');
        setNewSessionDescription('');
        setIsSearchMode(true);
      }
    },
    [tasks]
  );

  // Handle session mode change with cleanup
  const handleSessionModeChange = (mode: 'task' | 'manual') => {
    const previousMode = sessionMode;
    setSessionMode(mode);

    // Clear form state when switching modes for better UX
    setNewSessionTitle('');
    setNewSessionDescription('');
    setSelectedTaskId('none');
    setShowTaskSuggestion(false);

    // Reset any temporary states
    setSelectedCategoryId('none');
    setIsSearchMode(true);
    setTaskSearchQuery('');
    setIsTaskDropdownOpen(false);

    // Provide helpful feedback
    if (previousMode !== mode) {
      if (mode === 'manual') {
        toast.success('Switched to manual mode - start typing freely!', {
          duration: 2000,
        });
      } else {
        toast.success(
          'Switched to task-based mode - select or create a task!',
          {
            duration: 2000,
          }
        );
      }
    }
  };

  // Handle manual title change with task suggestion
  const handleManualTitleChange = (title: string) => {
    setNewSessionTitle(title);

    // Check if title matches any existing task
    const matchingTask = tasks.find(
      (task) =>
        task.name?.toLowerCase().includes(title.toLowerCase()) &&
        title.length > 2
    );

    if (matchingTask && title.length > 2) {
      setSelectedTaskId(matchingTask.id);
      setShowTaskSuggestion(false);
    } else if (
      title.length > 2 &&
      (selectedTaskId === 'none' || !selectedTaskId)
    ) {
      // Suggest creating a new task if title doesn't match any existing task
      setShowTaskSuggestion(true);
    } else {
      setShowTaskSuggestion(false);
    }
  };

  // Create task from manual session
  const createTaskFromManualSession = async () => {
    setNewTaskName(newSessionTitle);
    setShowTaskCreation(true);
    setShowTaskSuggestion(false);
  };

  // Create new task
  const createTask = async () => {
    if (!newTaskName.trim()) {
      toast.error('Please enter a task name');
      return;
    }

    if (!selectedListId) {
      toast.error('Please select a list');
      return;
    }

    setIsCreatingTask(true);

    try {
      const response = await apiCall(`/api/v1/workspaces/${wsId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          name: newTaskName,
          description: newTaskDescription || null,
          listId: selectedListId,
        }),
      });

      const newTask = response.task;
      setSelectedTaskId(newTask.id);

      // In task mode, set the title to the working format
      // In manual mode, keep the user's original title
      if (sessionMode === 'task') {
        setNewSessionTitle(`Working on: ${newTask.name}`);
      }

      setShowTaskCreation(false);
      setNewTaskName('');
      setNewTaskDescription('');
      setSelectedBoardId('');
      setSelectedListId('');
      setShowTaskSuggestion(false);

      toast.success(`Task "${newTask.name}" created successfully!`);

      // In task mode, start timer automatically
      // In manual mode, just link the task and let user start manually
      if (sessionMode === 'task') {
        await startTimerWithTask(newTask.id, newTask.name);
      }
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    } finally {
      setIsCreatingTask(false);
    }
  };

  // Start timer with task
  const startTimerWithTask = useCallback(
    async (taskId: string, taskName: string) => {
      setIsLoading(true);

      try {
        const response = await apiCall(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
          {
            method: 'POST',
            body: JSON.stringify({
              title: `Working on: ${taskName}`,
              description: newSessionDescription || null,
              categoryId:
                selectedCategoryId === 'none'
                  ? null
                  : selectedCategoryId || null,
              taskId: taskId,
            }),
          }
        );

        setCurrentSession(response.session);
        setIsRunning(true);
        setElapsedTime(0);
        setNewSessionTitle('');
        setNewSessionDescription('');
        setSelectedCategoryId('none');
        setSelectedTaskId('none');

        onSessionUpdate();
        toast.success('Timer started!');
      } catch (error) {
        console.error('Error starting timer:', error);
        toast.error('Failed to start timer');
      } finally {
        setIsLoading(false);
      }
    },
    [
      apiCall,
      wsId,
      newSessionDescription,
      selectedCategoryId,
      setCurrentSession,
      setIsRunning,
      setElapsedTime,
      onSessionUpdate,
    ]
  );

  // Start timer
  const startTimer = useCallback(async () => {
    if (sessionMode === 'task' && selectedTaskId && selectedTaskId !== 'none') {
      const selectedTask = tasks.find((t) => t.id === selectedTaskId);
      if (selectedTask) {
        await startTimerWithTask(selectedTaskId, selectedTask.name);
        return;
      }
    }

    if (
      sessionMode === 'task' &&
      (selectedTaskId === 'none' || !selectedTaskId)
    ) {
      setShowTaskCreation(true);
      return;
    }

    if (!newSessionTitle.trim()) {
      toast.error('Please enter a title for your time session');
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: newSessionTitle,
            description: newSessionDescription || null,
            categoryId:
              selectedCategoryId === 'none' ? null : selectedCategoryId || null,
            taskId: selectedTaskId === 'none' ? null : selectedTaskId || null,
          }),
        }
      );

      setCurrentSession(response.session);
      setIsRunning(true);
      setElapsedTime(0);

      // Update session protection - timer is now active
      updateSessionProtection(true, timerMode);

      // Initialize timer mode specific settings
      if (timerMode === 'pomodoro') {
        // Start first Pomodoro focus session
        startPomodoroSession('focus');
      } else if (timerMode === 'custom') {
        // Initialize custom timer based on type
        if (customTimerSettings.type === 'traditional-countdown') {
          const countdownDuration =
            (customTimerSettings.countdownDuration || 25) * 60;
          setCountdownState((prev) => ({
            ...prev,
            targetTime: countdownDuration,
            remainingTime: countdownDuration,
            sessionType: 'focus',
          }));
        } else if (customTimerSettings.type === 'enhanced-stopwatch') {
          // Reset enhanced stopwatch tracking
          updateCurrentBreakState({
            lastIntervalBreakTime: Date.now(),
            intervalBreaksCount: 0,
          });
          setHasReachedTarget(false);

          // No countdown for enhanced stopwatch - it counts up
          setCountdownState((prev) => ({
            ...prev,
            targetTime: 0,
            remainingTime: 0,
            sessionType: 'focus',
          }));
        }
      }

      setNewSessionTitle('');
      setNewSessionDescription('');
      setSelectedCategoryId('none');
      setSelectedTaskId('none');

      onSessionUpdate();
      toast.success(
        `Timer started${timerMode === 'pomodoro' ? ' - Focus time!' : ''}`
      );
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error('Failed to start timer');
    } finally {
      setIsLoading(false);
    }
  }, [
    sessionMode,
    selectedTaskId,
    tasks,
    newSessionTitle,
    newSessionDescription,
    selectedCategoryId,
    wsId,
    apiCall,
    setCurrentSession,
    setIsRunning,
    setElapsedTime,
    updateSessionProtection,
    timerMode,
    startPomodoroSession,
    customTimerSettings,
    updateCurrentBreakState,
    onSessionUpdate,
    startTimerWithTask,
  ]);

  // Stop timer - handle both active and paused sessions
  const stopTimer = useCallback(async () => {
    const sessionToStop = currentSession || pausedSession;
    if (!sessionToStop) return;

    setIsLoading(true);

    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToStop.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'stop' }),
        }
      );

      const completedSession = response.session;
      setJustCompleted(completedSession);

      // Clear all session states
      setCurrentSession(null);
      setPausedSession(null);
      setIsRunning(false);
      setElapsedTime(0);
      setPausedElapsedTime(0);
      setPauseStartTime(null);

      // Clear session protection - timer is no longer active
      updateSessionProtection(false, timerMode);

      // Clear from localStorage since session is completed
      clearPausedSessionFromStorage();

      // Show completion celebration
      setTimeout(() => setJustCompleted(null), 3000);

      onSessionUpdate();
      toast.success(
        `Session completed! Tracked ${formatDuration(completedSession.duration_seconds || 0)}`,
        {
          duration: 4000,
        }
      );
    } catch (error) {
      console.error('Error stopping timer:', error);
      toast.error('Failed to stop timer');
    } finally {
      setIsLoading(false);
    }
  }, [
    currentSession,
    pausedSession,
    apiCall,
    wsId,
    setCurrentSession,
    setIsRunning,
    setElapsedTime,
    updateSessionProtection,
    timerMode,
    clearPausedSessionFromStorage,
    onSessionUpdate,
    formatDuration,
  ]);

  // Pause timer - properly maintain session state
  const pauseTimer = useCallback(async () => {
    if (!currentSession) return;

    setIsLoading(true);

    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${currentSession.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'pause' }),
        }
      );

      const pauseTime = new Date();

      // Store paused session data instead of clearing it
      setPausedSession(currentSession);
      setPausedElapsedTime(elapsedTime);
      setPauseStartTime(pauseTime);

      // Save to localStorage for persistence across sessions
      savePausedSessionToStorage(currentSession, elapsedTime, pauseTime);

      // Clear active session but keep paused state
      setCurrentSession(null);
      setIsRunning(false);
      setElapsedTime(0);

      onSessionUpdate();
      toast.success('Timer paused - Click Resume to continue', {
        description: `Session: ${currentSession.title}`,
        duration: 4000,
      });
    } catch (error) {
      console.error('Error pausing timer:', error);
      toast.error('Failed to pause timer');
    } finally {
      setIsLoading(false);
    }
  }, [
    currentSession,
    apiCall,
    wsId,
    savePausedSessionToStorage,
    setCurrentSession,
    setIsRunning,
    setElapsedTime,
    onSessionUpdate,
    elapsedTime,
  ]);

  // Resume paused timer
  const resumeTimer = useCallback(async () => {
    if (!pausedSession) return;

    setIsLoading(true);

    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${pausedSession.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'resume' }),
        }
      );

      // Restore session from paused state
      setCurrentSession(response.session || pausedSession);
      setElapsedTime(pausedElapsedTime);
      setIsRunning(true);

      // Restore session protection - timer is active again
      updateSessionProtection(true, timerMode);

      // Clear paused state
      setPausedSession(null);
      setPausedElapsedTime(0);
      setPauseStartTime(null);

      // Clear from localStorage since session is now active
      clearPausedSessionFromStorage();

      const pauseDuration = pauseStartTime
        ? Math.floor((Date.now() - pauseStartTime.getTime()) / 1000)
        : 0;

      onSessionUpdate();
      toast.success('Timer resumed!', {
        description:
          pauseDuration > 0
            ? `Paused for ${formatDuration(pauseDuration)}`
            : 'Welcome back to your session',
        duration: 3000,
      });
    } catch (error) {
      console.error('Error resuming timer:', error);
      toast.error('Failed to resume timer');
    } finally {
      setIsLoading(false);
    }
  }, [
    pausedSession,
    apiCall,
    wsId,
    setCurrentSession,
    setElapsedTime,
    setIsRunning,
    updateSessionProtection,
    timerMode,
    clearPausedSessionFromStorage,
    pauseStartTime,
    onSessionUpdate,
    formatDuration,
    pausedElapsedTime,
  ]);

  // Start from template
  const startFromTemplate = async (template: SessionTemplate) => {
    setNewSessionTitle(template.title);
    setNewSessionDescription(template.description || '');
    setSelectedCategoryId(template.category_id || 'none');
    setSelectedTaskId(template.task_id || 'none');
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // Keep the drag over state active
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;

    // Only set isDragOver to false when counter reaches 0
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'task' && data.task) {
        const task = data.task;

        // Set task mode and populate fields
        setSessionMode('task');
        setSelectedTaskId(task.id);
        setNewSessionTitle(`Working on: ${task.name}`);
        setNewSessionDescription(task.description || '');

        // Exit search mode and show selected task
        setIsSearchMode(false);
        setTaskSearchQuery('');
        setIsTaskDropdownOpen(false);

        // Show success feedback
        toast.success(`Task "${task.name}" ready to track!`, {
          description:
            'Click Start Timer to begin tracking time for this task.',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Error handling dropped task:', error);
      toast.error('Failed to process dropped task');
    }
  };

  const getCategoryColor = (color: string) => {
    const colorMap: Record<string, string> = {
      RED: 'bg-dynamic-red/80',
      BLUE: 'bg-dynamic-blue/80',
      GREEN: 'bg-dynamic-green/80',
      YELLOW: 'bg-dynamic-yellow/80',
      ORANGE: 'bg-dynamic-orange/80',
      PURPLE: 'bg-dynamic-purple/80',
      PINK: 'bg-dynamic-pink/80',
      INDIGO: 'bg-dynamic-indigo/80',
      CYAN: 'bg-dynamic-cyan/80',
      GRAY: 'bg-dynamic-gray/80',
    };
    return colorMap[color] || 'bg-dynamic-blue/80';
  };

  // Get lists for selected board
  const selectedBoard = boards.find((board) => board.id === selectedBoardId);
  const availableLists = selectedBoard?.task_lists || [];

  // Memoized filtered tasks to avoid O(N) work on every render
  const filteredTasks = useMemo(() => {
    return getFilteredAndSortedTasks(tasks, taskSearchQuery, taskFilters);
  }, [tasks, taskSearchQuery, taskFilters]);

  // Get unique boards and lists for filter options (memoized)
  const uniqueBoards = useMemo(
    () => [
      ...new Set(
        tasks
          .map((task) => task.board_name)
          .filter((name): name is string => Boolean(name))
      ),
    ],
    [tasks]
  );

  const uniqueLists = useMemo(
    () => [
      ...new Set(
        tasks
          .map((task) => task.list_name)
          .filter((name): name is string => Boolean(name))
      ),
    ],
    [tasks]
  );

  // Calculate dropdown position
  const calculateDropdownPosition = useCallback(() => {
    if (!dropdownContainerRef.current) return;

    const container = dropdownContainerRef.current;
    const rect = container.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 400; // max-height of dropdown
    const buffer = 20; // Buffer from viewport edges

    // Calculate available space
    const spaceBelow = viewportHeight - rect.bottom - buffer;
    const spaceAbove = rect.top - buffer;

    // Prefer below unless there's significantly more space above
    if (
      spaceBelow >= Math.min(dropdownHeight, 200) ||
      spaceBelow >= spaceAbove
    ) {
      setDropdownPosition('below');
    } else {
      setDropdownPosition('above');
    }
  }, []);

  // Check if dropdown is visible in viewport
  const isDropdownVisible = useCallback(() => {
    if (!dropdownContainerRef.current) return true;

    const rect = dropdownContainerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Check if the container is still reasonably visible
    const isVerticallyVisible = rect.bottom >= 0 && rect.top <= viewportHeight;
    const isHorizontallyVisible = rect.right >= 0 && rect.left <= viewportWidth;
    const hasMinimumVisibility = rect.height > 0 && rect.width > 0;

    return isVerticallyVisible && isHorizontallyVisible && hasMinimumVisibility;
  }, []);

  // Open dropdown with position calculation
  const openDropdown = useCallback(() => {
    setIsTaskDropdownOpen(true);
    // Use requestAnimationFrame to ensure DOM is ready for position calculation
    requestAnimationFrame(() => {
      calculateDropdownPosition();
    });
  }, [calculateDropdownPosition]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      // Check if click is outside the dropdown container
      if (
        !target.closest('[data-task-dropdown]') &&
        !target.closest('.absolute.z-\\[100\\]')
      ) {
        setIsTaskDropdownOpen(false);
        setIsSearchMode(false);
      }
    };

    if (isTaskDropdownOpen) {
      // Use capture phase to ensure we catch the event before other handlers
      document.addEventListener('mousedown', handleClickOutside, true);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside, true);
    }
  }, [isTaskDropdownOpen]);

  // Handle scroll and resize events
  useEffect(() => {
    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      if (isTaskDropdownOpen) {
        // Clear previous timeout
        clearTimeout(scrollTimeout);

        // Throttle scroll handling
        scrollTimeout = setTimeout(() => {
          if (!isDropdownVisible()) {
            setIsTaskDropdownOpen(false);
            setIsSearchMode(false);
          } else {
            calculateDropdownPosition();
          }
        }, 16); // ~60fps
      }
    };

    const handleResize = () => {
      if (isTaskDropdownOpen) {
        calculateDropdownPosition();
      }
    };

    if (isTaskDropdownOpen) {
      // Calculate initial position
      calculateDropdownPosition();

      // Add event listeners
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);

      return () => {
        clearTimeout(scrollTimeout);
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [isTaskDropdownOpen, calculateDropdownPosition, isDropdownVisible]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const isInputFocused =
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable') === 'true';

      // Escape to close dropdown or cancel drag
      if (event.key === 'Escape') {
        if (isTaskDropdownOpen) {
          setIsTaskDropdownOpen(false);
          return;
        }
        if (isDraggingTask) {
          // Note: This won't actually cancel the drag since it's controlled by parent
          // But it provides visual feedback
          toast.info(
            'Press ESC while dragging to cancel (drag outside to cancel)'
          );
          return;
        }
      }

      // Skip other shortcuts if typing in input
      if (isInputFocused) return;

      // Ctrl/Cmd + Enter to start/stop timer
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (isRunning) {
          stopTimer();
        } else if (newSessionTitle.trim()) {
          startTimer();
        }
      }

      // Ctrl/Cmd + P to pause/resume
      if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
        event.preventDefault();
        if (isRunning) {
          pauseTimer();
        } else if (pausedSession) {
          resumeTimer();
        }
      }

      // Ctrl/Cmd + T to open task dropdown
      if ((event.ctrlKey || event.metaKey) && event.key === 't' && !isRunning) {
        event.preventDefault();
        setIsTaskDropdownOpen(!isTaskDropdownOpen);
      }

      // Ctrl/Cmd + M to switch between task/manual mode
      if ((event.ctrlKey || event.metaKey) && event.key === 'm' && !isRunning) {
        event.preventDefault();
        setSessionMode(sessionMode === 'task' ? 'manual' : 'task');
        toast.success(
          `Switched to ${sessionMode === 'task' ? 'manual' : 'task'} mode`
        );
      }

      // Arrow keys for task navigation when dropdown is open
      if (
        isTaskDropdownOpen &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      ) {
        event.preventDefault();
        // filteredTasks is already memoized
        if (filteredTasks.length === 0) return;

        const currentIndex = filteredTasks.findIndex(
          (task) => task.id === selectedTaskId
        );
        let nextIndex: number | undefined;

        if (event.key === 'ArrowDown') {
          nextIndex =
            currentIndex < filteredTasks.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex =
            currentIndex > 0 ? currentIndex - 1 : filteredTasks.length - 1;
        }

        const nextTask = filteredTasks[nextIndex];
        if (nextTask?.id) {
          setSelectedTaskId(nextTask.id);
        }
      }

      // Enter to select highlighted task when dropdown is open
      if (
        isTaskDropdownOpen &&
        event.key === 'Enter' &&
        selectedTaskId !== 'none'
      ) {
        event.preventDefault();
        handleTaskSelectionChange(selectedTaskId);
      }

      // Space to start timer with current selection
      if (event.key === ' ' && !isRunning && !isInputFocused) {
        event.preventDefault();
        if (newSessionTitle.trim()) {
          startTimer();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isRunning,
    newSessionTitle,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    pausedSession,
    isTaskDropdownOpen,
    isDraggingTask,
    selectedTaskId,
    sessionMode,
    filteredTasks.findIndex,
    filteredTasks[nextIndex],
    handleTaskSelectionChange,
  ]);

  return (
    <>
      {/* Custom Timer Advanced Settings Dialog */}
      <Dialog open={showCustomSettings} onOpenChange={setShowCustomSettings}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>⚙️ Advanced Custom Timer Settings</DialogTitle>
            <DialogDescription>
              Fine-tune your custom timer experience with advanced options
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Timer Type Specific Settings */}
            {customTimerSettings.type === 'enhanced-stopwatch' && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">
                  Enhanced Stopwatch Settings
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Target Duration (min)</Label>
                    <Input
                      type="number"
                      min="10"
                      max="480"
                      value={customTimerSettings.targetDuration}
                      onChange={(e) =>
                        setCustomTimerSettings((prev) => ({
                          ...prev,
                          targetDuration: parseInt(e.target.value) || 60,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Break Frequency (min)</Label>
                    <Input
                      type="number"
                      min="5"
                      max="120"
                      value={customTimerSettings.intervalFrequency}
                      onChange={(e) =>
                        setCustomTimerSettings((prev) => ({
                          ...prev,
                          intervalFrequency: parseInt(e.target.value) || 25,
                        }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Break Duration (min)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={customTimerSettings.intervalBreakDuration}
                    onChange={(e) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        intervalBreakDuration: parseInt(e.target.value) || 5,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Auto-stop at target</Label>
                  <input
                    type="checkbox"
                    checked={customTimerSettings.autoStopAtTarget}
                    onChange={(e) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        autoStopAtTarget: e.target.checked,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Target notifications</Label>
                  <input
                    type="checkbox"
                    checked={customTimerSettings.enableTargetNotification}
                    onChange={(e) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        enableTargetNotification: e.target.checked,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            {customTimerSettings.type === 'traditional-countdown' && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium">
                  Traditional Countdown Settings
                </h4>
                <div>
                  <Label>Countdown Duration (min)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="480"
                    value={customTimerSettings.countdownDuration}
                    onChange={(e) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        countdownDuration: parseInt(e.target.value) || 25,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Auto-restart</Label>
                  <input
                    type="checkbox"
                    checked={customTimerSettings.autoRestart}
                    onChange={(e) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        autoRestart: e.target.checked,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Show time remaining</Label>
                  <input
                    type="checkbox"
                    checked={customTimerSettings.showTimeRemaining}
                    onChange={(e) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        showTimeRemaining: e.target.checked,
                      }))
                    }
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Break Reminders</h4>
              <div className="flex items-center justify-between">
                <Label>Enable break reminders</Label>
                <input
                  type="checkbox"
                  checked={customTimerSettings.enableBreakReminders}
                  onChange={(e) =>
                    setCustomTimerSettings((prev) => ({
                      ...prev,
                      enableBreakReminders: e.target.checked,
                    }))
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Get reminded to take eye breaks (20-20-20 rule) and movement
                breaks during long sessions
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Audio & Notifications</h4>
              <div className="flex items-center justify-between">
                <Label>Play completion sound</Label>
                <input
                  type="checkbox"
                  checked={customTimerSettings.playCompletionSound}
                  onChange={(e) =>
                    setCustomTimerSettings((prev) => ({
                      ...prev,
                      playCompletionSound: e.target.checked,
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Browser notifications</Label>
                <input
                  type="checkbox"
                  checked={customTimerSettings.showNotifications}
                  onChange={(e) =>
                    setCustomTimerSettings((prev) => ({
                      ...prev,
                      showNotifications: e.target.checked,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Motivation & Feedback</h4>
              <div className="flex items-center justify-between">
                <Label>Motivational messages</Label>
                <input
                  type="checkbox"
                  checked={customTimerSettings.enableMotivationalMessages}
                  onChange={(e) =>
                    setCustomTimerSettings((prev) => ({
                      ...prev,
                      enableMotivationalMessages: e.target.checked,
                    }))
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Receive encouraging messages and productivity tips during your
                sessions
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setCustomTimerSettings({
                    type: 'enhanced-stopwatch',

                    // Enhanced Stopwatch defaults
                    targetDuration: 60, // 1 hour goal
                    enableIntervalBreaks: true,
                    intervalBreakDuration: 5,
                    intervalFrequency: 25,
                    showProgressToTarget: true,
                    enableTargetNotification: true,
                    autoStopAtTarget: false,

                    // Traditional Countdown defaults
                    countdownDuration: 25,
                    autoRestart: false,
                    showTimeRemaining: true,

                    // Shared defaults
                    enableBreakReminders: true,
                    playCompletionSound: true,
                    showNotifications: true,
                    enableMotivationalMessages: true,
                  })
                }
                className="flex-1"
              >
                Reset Defaults
              </Button>
              <Button
                onClick={() => setShowCustomSettings(false)}
                className="flex-1"
              >
                Save Settings
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Pomodoro Settings Dialog */}
      <Dialog
        open={showPomodoroSettings}
        onOpenChange={setShowPomodoroSettings}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>🍅 Pomodoro Settings</DialogTitle>
            <DialogDescription>
              Customize your focus and break durations
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Focus (min)</Label>
                <Input
                  type="number"
                  min="1"
                  max="120"
                  value={pomodoroSettings.focusTime}
                  onChange={(e) =>
                    setPomodoroSettings((prev) => ({
                      ...prev,
                      focusTime: parseInt(e.target.value) || 25,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Short Break</Label>
                <Input
                  type="number"
                  min="1"
                  max="30"
                  value={pomodoroSettings.shortBreakTime}
                  onChange={(e) =>
                    setPomodoroSettings((prev) => ({
                      ...prev,
                      shortBreakTime: parseInt(e.target.value) || 5,
                    }))
                  }
                />
              </div>
              <div>
                <Label>Long Break</Label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={pomodoroSettings.longBreakTime}
                  onChange={(e) =>
                    setPomodoroSettings((prev) => ({
                      ...prev,
                      longBreakTime: parseInt(e.target.value) || 15,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label>Sessions until long break</Label>
              <Input
                type="number"
                min="2"
                max="8"
                value={pomodoroSettings.sessionsUntilLongBreak}
                onChange={(e) =>
                  setPomodoroSettings((prev) => ({
                    ...prev,
                    sessionsUntilLongBreak: parseInt(e.target.value) || 4,
                  }))
                }
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Auto-start breaks</Label>
                <input
                  type="checkbox"
                  checked={pomodoroSettings.autoStartBreaks}
                  onChange={(e) =>
                    setPomodoroSettings((prev) => ({
                      ...prev,
                      autoStartBreaks: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Auto-start focus</Label>
                <input
                  type="checkbox"
                  checked={pomodoroSettings.autoStartFocus}
                  onChange={(e) =>
                    setPomodoroSettings((prev) => ({
                      ...prev,
                      autoStartFocus: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Enable notifications</Label>
                <input
                  type="checkbox"
                  checked={pomodoroSettings.enableNotifications}
                  onChange={(e) =>
                    setPomodoroSettings((prev) => ({
                      ...prev,
                      enableNotifications: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>20-20-20 eye breaks</Label>
                <input
                  type="checkbox"
                  checked={pomodoroSettings.enable2020Rule}
                  onChange={(e) =>
                    setPomodoroSettings((prev) => ({
                      ...prev,
                      enable2020Rule: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Movement reminders</Label>
                <input
                  type="checkbox"
                  checked={pomodoroSettings.enableMovementReminder}
                  onChange={(e) =>
                    setPomodoroSettings((prev) => ({
                      ...prev,
                      enableMovementReminder: e.target.checked,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPomodoroSettings(DEFAULT_POMODORO_SETTINGS)}
                className="flex-1"
              >
                Reset Defaults
              </Button>
              <Button
                onClick={() => setShowPomodoroSettings(false)}
                className="flex-1"
              >
                Save Settings
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Stopwatch Settings Dialog */}
      <Dialog
        open={showStopwatchSettings}
        onOpenChange={setShowStopwatchSettings}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>⏱️ Stopwatch Settings</DialogTitle>
            <DialogDescription>
              Customize your stopwatch experience and productivity features
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Break reminders</Label>
                <input
                  type="checkbox"
                  checked={stopwatchSettings.enableBreakReminders}
                  onChange={(e) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      enableBreakReminders: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>20-20-20 eye breaks</Label>
                <input
                  type="checkbox"
                  checked={stopwatchSettings.enable2020Rule}
                  onChange={(e) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      enable2020Rule: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Movement reminders</Label>
                <input
                  type="checkbox"
                  checked={stopwatchSettings.enableMovementReminder}
                  onChange={(e) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      enableMovementReminder: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Productivity insights</Label>
                <input
                  type="checkbox"
                  checked={stopwatchSettings.showProductivityInsights}
                  onChange={(e) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      showProductivityInsights: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Enable notifications</Label>
                <input
                  type="checkbox"
                  checked={stopwatchSettings.enableNotifications}
                  onChange={(e) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      enableNotifications: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Session milestones</Label>
                <input
                  type="checkbox"
                  checked={stopwatchSettings.enableSessionMilestones}
                  onChange={(e) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      enableSessionMilestones: e.target.checked,
                    }))
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Completion sound</Label>
                <input
                  type="checkbox"
                  checked={stopwatchSettings.playCompletionSound}
                  onChange={(e) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      playCompletionSound: e.target.checked,
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStopwatchSettings(DEFAULT_STOPWATCH_SETTINGS)}
                className="flex-1"
              >
                Reset Defaults
              </Button>
              <Button
                onClick={() => setShowStopwatchSettings(false)}
                className="flex-1"
              >
                Save Settings
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Card
        className={cn(
          'relative transition-all duration-300',
          isDraggingTask &&
            'bg-blue-50/30 shadow-lg ring-2 shadow-blue-500/20 ring-blue-500/50 dark:bg-blue-950/20'
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Time Tracker
            </div>
            {/* Timer Mode Selector */}
            <div className="flex items-center gap-2">
              <Select
                value={timerMode}
                onValueChange={(value: TimerMode) =>
                  handleTimerModeChange(value)
                }
                disabled={sessionProtection.isActive}
              >
                <SelectTrigger
                  className={cn(
                    'h-8 w-32 text-xs',
                    sessionProtection.isActive &&
                      'cursor-not-allowed opacity-50'
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    value="stopwatch"
                    disabled={sessionProtection.isActive}
                  >
                    ⏱️ Stopwatch
                  </SelectItem>
                  <SelectItem
                    value="pomodoro"
                    disabled={sessionProtection.isActive}
                  >
                    🍅 Pomodoro
                  </SelectItem>
                  <SelectItem
                    value="custom"
                    disabled={sessionProtection.isActive}
                  >
                    ⏲️ Custom
                  </SelectItem>
                </SelectContent>
              </Select>
              {sessionProtection.isActive && (
                <div className="text-xs text-muted-foreground">
                  🔒 Active Session
                </div>
              )}
              {timerMode === 'stopwatch' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (sessionProtection.isActive) {
                      toast.error(
                        'Cannot modify settings during active session',
                        {
                          description: 'Please stop or pause your timer first.',
                          duration: 3000,
                        }
                      );
                      return;
                    }
                    setShowStopwatchSettings(true);
                  }}
                  className={cn(
                    'h-8 w-8 p-0',
                    sessionProtection.isActive &&
                      'cursor-not-allowed opacity-50'
                  )}
                  title={
                    sessionProtection.isActive
                      ? 'Settings locked during active session'
                      : 'Stopwatch Settings'
                  }
                  disabled={sessionProtection.isActive}
                >
                  ⚙️
                </Button>
              )}
              {timerMode === 'pomodoro' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (sessionProtection.isActive) {
                      toast.error(
                        'Cannot modify settings during active session',
                        {
                          description: 'Please stop or pause your timer first.',
                          duration: 3000,
                        }
                      );
                      return;
                    }
                    setShowPomodoroSettings(true);
                  }}
                  className={cn(
                    'h-8 w-8 p-0',
                    sessionProtection.isActive &&
                      'cursor-not-allowed opacity-50'
                  )}
                  title={
                    sessionProtection.isActive
                      ? 'Settings locked during active session'
                      : 'Pomodoro Settings'
                  }
                  disabled={sessionProtection.isActive}
                >
                  ⚙️
                </Button>
              )}
              {timerMode === 'custom' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (sessionProtection.isActive) {
                      toast.error(
                        'Cannot modify settings during active session',
                        {
                          description: 'Please stop or pause your timer first.',
                          duration: 3000,
                        }
                      );
                      return;
                    }
                    setShowCustomSettings(true);
                  }}
                  className={cn(
                    'h-8 w-8 p-0',
                    sessionProtection.isActive &&
                      'cursor-not-allowed opacity-50'
                  )}
                  title={
                    sessionProtection.isActive
                      ? 'Settings locked during active session'
                      : 'Custom Timer Settings'
                  }
                  disabled={sessionProtection.isActive}
                >
                  ⚙️
                </Button>
              )}
            </div>
          </CardTitle>
          <div className="space-y-1 text-sm text-muted-foreground">
            <span>
              {timerMode === 'stopwatch' &&
                'Track your time with detailed analytics'}
              {timerMode === 'pomodoro' &&
                `Focus for ${pomodoroSettings.focusTime}min, break for ${pomodoroSettings.shortBreakTime}min`}
              {timerMode === 'custom' &&
                customTimerSettings.type === 'enhanced-stopwatch' &&
                `Enhanced stopwatch with ${customTimerSettings.targetDuration}min target${customTimerSettings.enableIntervalBreaks ? `, breaks every ${customTimerSettings.intervalFrequency}min` : ''}`}
              {timerMode === 'custom' &&
                customTimerSettings.type === 'traditional-countdown' &&
                `Traditional countdown for ${customTimerSettings.countdownDuration}min${customTimerSettings.autoRestart ? ' (auto-restart)' : ''}`}
            </span>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-1.5 py-0.5">
                ⌘/Ctrl + Enter
              </span>
              to start/stop
              <span className="rounded bg-muted px-1.5 py-0.5">⌘/Ctrl + P</span>
              to pause/resume
              <span className="rounded bg-muted px-1.5 py-0.5">⌘/Ctrl + T</span>
              for tasks
              <span className="rounded bg-muted px-1.5 py-0.5">⌘/Ctrl + M</span>
              to switch mode
              <span className="rounded bg-muted px-1.5 py-0.5">Space</span>
              to start
              <span className="rounded bg-muted px-1.5 py-0.5">↑↓</span>
              to navigate
            </div>
          </div>
        </CardHeader>

        {/* Custom Timer Configuration - Prominently Displayed */}
        {timerMode === 'custom' && (
          <div className="mx-6 mb-4 space-y-4 rounded-lg border border-border/60 bg-card/30 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/20">
                  {customTimerSettings.type === 'enhanced-stopwatch'
                    ? '⏱️'
                    : '⏲️'}
                </div>
                <div>
                  <h3 className="text-sm font-medium">
                    {customTimerSettings.type === 'enhanced-stopwatch'
                      ? 'Enhanced Stopwatch'
                      : 'Traditional Countdown'}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {customTimerSettings.type === 'enhanced-stopwatch'
                      ? 'Target-based with interval breaks'
                      : 'Simple countdown timer'}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Timer Type Switcher */}
            <div className="flex gap-2">
              <Button
                variant={
                  customTimerSettings.type === 'enhanced-stopwatch'
                    ? 'default'
                    : 'outline'
                }
                size="sm"
                onClick={() => {
                  if (sessionProtection.isActive) {
                    toast.error(
                      'Cannot switch timer types during active session',
                      {
                        description: 'Please stop or pause your timer first.',
                        duration: 3000,
                      }
                    );
                    return;
                  }
                  setCustomTimerSettings((prev) => ({
                    ...prev,
                    type: 'enhanced-stopwatch',
                  }));
                }}
                className={cn(
                  'flex-1 text-xs',
                  sessionProtection.isActive && 'cursor-not-allowed opacity-50'
                )}
                disabled={sessionProtection.isActive}
                title={
                  sessionProtection.isActive
                    ? 'Type switching locked during active session'
                    : 'Enhanced Stopwatch'
                }
              >
                ⏱️ Stopwatch
              </Button>
              <Button
                variant={
                  customTimerSettings.type === 'traditional-countdown'
                    ? 'default'
                    : 'outline'
                }
                size="sm"
                onClick={() => {
                  if (sessionProtection.isActive) {
                    toast.error(
                      'Cannot switch timer types during active session',
                      {
                        description: 'Please stop or pause your timer first.',
                        duration: 3000,
                      }
                    );
                    return;
                  }
                  setCustomTimerSettings((prev) => ({
                    ...prev,
                    type: 'traditional-countdown',
                  }));
                }}
                className={cn(
                  'flex-1 text-xs',
                  sessionProtection.isActive && 'cursor-not-allowed opacity-50'
                )}
                disabled={sessionProtection.isActive}
                title={
                  sessionProtection.isActive
                    ? 'Type switching locked during active session'
                    : 'Traditional Countdown'
                }
              >
                ⏲️ Countdown
              </Button>
            </div>

            {/* Essential Settings Only - Interval Breaks for Enhanced Stopwatch */}
            {customTimerSettings.type === 'enhanced-stopwatch' && (
              <div className="rounded-md bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Interval Breaks:
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={customTimerSettings.enableIntervalBreaks}
                      onChange={(e) => {
                        if (sessionProtection.isActive) {
                          toast.error(
                            'Cannot modify break settings during active session',
                            {
                              description:
                                'Please stop or pause your timer first.',
                              duration: 3000,
                            }
                          );
                          return;
                        }
                        setCustomTimerSettings((prev) => ({
                          ...prev,
                          enableIntervalBreaks: e.target.checked,
                        }));
                      }}
                      className={cn(
                        'h-3 w-3 rounded',
                        sessionProtection.isActive &&
                          'cursor-not-allowed opacity-50'
                      )}
                      disabled={sessionProtection.isActive}
                      title={
                        sessionProtection.isActive
                          ? 'Settings locked during active session'
                          : 'Enable interval breaks'
                      }
                    />
                    {customTimerSettings.enableIntervalBreaks && (
                      <span className="text-xs text-muted-foreground">
                        every {customTimerSettings.intervalFrequency}min
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <CardContent className="space-y-6">
          {currentSession ? (
            <div className="space-y-6 text-center">
              {/* Enhanced Active Session Display */}
              <div
                className={cn(
                  'relative overflow-hidden rounded-lg p-6',
                  timerMode === 'pomodoro' &&
                    countdownState.sessionType === 'focus'
                    ? 'bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-950/20 dark:to-emerald-900/20'
                    : timerMode === 'pomodoro' &&
                        countdownState.sessionType !== 'focus'
                      ? 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20'
                      : timerMode === 'custom'
                        ? 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/20 dark:to-purple-900/20'
                        : 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-950/20 dark:to-red-900/20'
                )}
              >
                <div
                  className={cn(
                    'absolute inset-0 animate-pulse bg-gradient-to-r opacity-30',
                    timerMode === 'pomodoro' &&
                      countdownState.sessionType === 'focus'
                      ? 'from-green-500/10 to-transparent'
                      : timerMode === 'pomodoro' &&
                          countdownState.sessionType !== 'focus'
                        ? 'from-blue-500/10 to-transparent'
                        : timerMode === 'custom'
                          ? 'from-purple-500/10 to-transparent'
                          : 'from-red-500/10 to-transparent'
                  )}
                ></div>
                <div className="relative">
                  <div
                    className={cn(
                      'font-mono text-4xl font-bold transition-all duration-300',
                      timerMode === 'pomodoro' &&
                        countdownState.sessionType === 'focus'
                        ? 'text-green-600 dark:text-green-400'
                        : timerMode === 'pomodoro' &&
                            countdownState.sessionType !== 'focus'
                          ? 'text-blue-600 dark:text-blue-400'
                          : timerMode === 'custom'
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {timerMode === 'pomodoro' ||
                    (timerMode === 'custom' &&
                      customTimerSettings.type === 'traditional-countdown')
                      ? formatTime(countdownState.remainingTime)
                      : formatTime(elapsedTime)}
                  </div>

                  {/* Pomodoro Progress Indicator */}
                  {timerMode === 'pomodoro' && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <span className="font-medium">
                          {countdownState.sessionType === 'focus'
                            ? `🍅 Focus ${countdownState.pomodoroSession}`
                            : countdownState.sessionType === 'short-break'
                              ? '☕ Short Break'
                              : '🌟 Long Break'}
                        </span>
                      </div>

                      {/* Progress bar for current session */}
                      <div className="h-2 w-full rounded-full bg-white/30">
                        <div
                          className={cn(
                            'h-2 rounded-full transition-all duration-1000',
                            countdownState.sessionType === 'focus'
                              ? 'bg-green-500'
                              : 'bg-blue-500'
                          )}
                          style={{
                            width: `${countdownState.targetTime > 0 ? ((countdownState.targetTime - countdownState.remainingTime) / countdownState.targetTime) * 100 : 0}%`,
                          }}
                        />
                      </div>

                      {/* Pomodoro sessions indicator */}
                      {countdownState.sessionType === 'focus' && (
                        <div className="mt-2 flex justify-center gap-1">
                          {Array.from(
                            { length: pomodoroSettings.sessionsUntilLongBreak },
                            (_, i) => (
                              <div
                                key={i}
                                className={cn(
                                  'h-3 w-3 rounded-full',
                                  i < countdownState.pomodoroSession - 1
                                    ? 'bg-green-500'
                                    : i === countdownState.pomodoroSession - 1
                                      ? 'animate-pulse bg-green-400'
                                      : 'bg-white/30'
                                )}
                              />
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    className={cn(
                      'mt-2 flex items-center justify-center gap-2 text-sm',
                      timerMode === 'pomodoro' &&
                        countdownState.sessionType === 'focus'
                        ? 'text-green-600/70 dark:text-green-400/70'
                        : timerMode === 'pomodoro' &&
                            countdownState.sessionType !== 'focus'
                          ? 'text-blue-600/70 dark:text-blue-400/70'
                          : timerMode === 'custom'
                            ? 'text-purple-600/70 dark:text-purple-400/70'
                            : 'text-red-600/70 dark:text-red-400/70'
                    )}
                  >
                    <div
                      className={cn(
                        'h-2 w-2 animate-pulse rounded-full',
                        timerMode === 'pomodoro' &&
                          countdownState.sessionType === 'focus'
                          ? 'bg-green-500'
                          : timerMode === 'pomodoro' &&
                              countdownState.sessionType !== 'focus'
                            ? 'bg-blue-500'
                            : timerMode === 'custom'
                              ? 'bg-purple-500'
                              : 'bg-red-500'
                      )}
                    ></div>
                    {timerMode === 'pomodoro' ? (
                      <span>
                        {countdownState.remainingTime > 0
                          ? `${Math.floor(countdownState.remainingTime / 60)}:${(countdownState.remainingTime % 60).toString().padStart(2, '0')} remaining`
                          : 'Session complete!'}
                      </span>
                    ) : timerMode === 'custom' ? (
                      <span>
                        {customTimerSettings.type === 'traditional-countdown'
                          ? countdownState.remainingTime > 0
                            ? `⏲️ ${Math.floor(countdownState.remainingTime / 60)}:${(countdownState.remainingTime % 60).toString().padStart(2, '0')} remaining`
                            : 'Countdown complete!'
                          : customTimerSettings.type === 'enhanced-stopwatch'
                            ? hasReachedTarget
                              ? `🎯 Target achieved! (${customTimerSettings.targetDuration || 60}min)`
                              : `⏱️ Enhanced Stopwatch ${customTimerSettings.targetDuration ? `(target: ${customTimerSettings.targetDuration}min)` : ''}`
                            : '⏱️ Custom Timer'}
                      </span>
                    ) : (
                      <>
                        Started at{' '}
                        {new Date(
                          currentSession.start_time
                        ).toLocaleTimeString()}
                        {elapsedTime > 1800 && (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                            {elapsedTime > 3600 ? 'Long session!' : 'Deep work'}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-left">
                <h3 className="text-lg font-medium">{currentSession.title}</h3>
                {currentSession.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {currentSession.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {currentSession.category && (
                    <Badge
                      className={cn(
                        'text-sm',
                        getCategoryColor(
                          currentSession.category.color || 'BLUE'
                        )
                      )}
                    >
                      {currentSession.category.name}
                    </Badge>
                  )}
                  {currentSession.task && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-gradient-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                        <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                        <span className="text-sm font-medium text-dynamic-blue">
                          {currentSession.task.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-1 h-4 w-4 p-0 text-dynamic-blue/60 hover:text-dynamic-blue"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                {currentSession.task &&
                  (() => {
                    const taskWithDetails = tasks.find(
                      (t) => t.id === currentSession.task?.id
                    );
                    return taskWithDetails?.board_name &&
                      taskWithDetails?.list_name ? (
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{taskWithDetails.board_name}</span>
                        </div>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Tag className="h-3 w-3" />
                          <span>{taskWithDetails.list_name}</span>
                        </div>
                      </div>
                    ) : null;
                  })()}
              </div>

              {/* Enhanced Session Controls */}
              <div className="space-y-4">
                {/* Productivity Insights */}
                {elapsedTime > 600 && (
                  <div className="rounded-lg border border-green-200/60 bg-green-50/30 p-3 dark:border-green-800/60 dark:bg-green-950/10">
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-green-800 dark:text-green-200">
                        Session Insights
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs text-green-700 dark:text-green-300">
                      <div>
                        <span className="font-medium">Duration:</span>
                        <span className="ml-1">
                          {elapsedTime < 1500
                            ? 'Warming up'
                            : elapsedTime < 3600
                              ? 'Focused session'
                              : 'Deep work zone!'}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium">Productivity:</span>
                        <span className="ml-1">
                          {elapsedTime < 900
                            ? 'Getting started'
                            : elapsedTime < 2700
                              ? 'In the flow'
                              : 'Exceptional focus'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Enhanced Control Buttons */}
                <div className="flex gap-3">
                  <Button
                    onClick={pauseTimer}
                    disabled={isLoading}
                    variant="outline"
                    className="flex-1 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300 dark:hover:bg-amber-950/40"
                  >
                    <Pause className="mr-2 h-4 w-4" />
                    Take Break
                  </Button>
                  <Button
                    onClick={stopTimer}
                    disabled={isLoading}
                    variant="destructive"
                    className="flex-1"
                  >
                    <Square className="mr-2 h-4 w-4" />
                    Complete
                  </Button>
                </div>

                {/* Quick Actions during session */}
                <div className="flex justify-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-muted px-2 py-1">⌘/Ctrl + P</span>
                  <span>for break</span>
                  <span className="rounded bg-muted px-2 py-1">
                    ⌘/Ctrl + Enter
                  </span>
                  <span>to complete</span>
                </div>
              </div>
            </div>
          ) : pausedSession ? (
            /* Paused Session Display */
            <div className="space-y-6 text-center">
              <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 p-6 dark:from-amber-950/20 dark:to-amber-900/20">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent"></div>
                <div className="relative">
                  <div className="mb-3 flex items-center justify-center gap-2">
                    <Pause className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    <span className="text-lg font-semibold text-amber-700 dark:text-amber-300">
                      Session Paused
                    </span>
                  </div>
                  <div className="font-mono text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {formatTime(pausedElapsedTime)}
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-amber-600/80 dark:text-amber-400/80">
                    <div>
                      Paused at {pauseStartTime?.toLocaleTimeString()}
                      {pauseStartTime && (
                        <span className="ml-2">
                          • Break:{' '}
                          {formatDuration(
                            Math.floor(
                              (Date.now() - pauseStartTime.getTime()) / 1000
                            )
                          )}
                        </span>
                      )}
                    </div>
                    <div className="text-xs">
                      Session was running for{' '}
                      {formatDuration(pausedElapsedTime)} before pause
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-left">
                <h3 className="text-lg font-medium">{pausedSession.title}</h3>
                {pausedSession.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pausedSession.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {pausedSession.category && (
                    <Badge
                      className={cn(
                        'text-sm',
                        getCategoryColor(pausedSession.category.color || 'BLUE')
                      )}
                    >
                      {pausedSession.category.name}
                    </Badge>
                  )}
                  {pausedSession.task && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-gradient-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                        <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                        <span className="text-sm font-medium text-dynamic-blue">
                          {pausedSession.task.name}
                        </span>
                      </div>
                    </div>
                  )}
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                  >
                    On break
                  </Badge>
                </div>
              </div>

              {/* Enhanced Resume/Stop buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={resumeTimer}
                  disabled={isLoading}
                  className="flex-1 bg-green-600 text-white hover:bg-green-700"
                >
                  <Play className="mr-2 h-4 w-4" />
                  Resume Session
                </Button>
                <Button
                  onClick={stopTimer}
                  disabled={isLoading}
                  variant="destructive"
                  className="flex-1"
                >
                  <Square className="mr-2 h-4 w-4" />
                  End Session
                </Button>
              </div>

              {/* Quick Break Suggestions */}
              <div className="rounded-lg border border-amber-200/60 bg-amber-50/30 p-4 dark:border-amber-800/60 dark:bg-amber-950/10">
                <p className="mb-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                  💡 Break suggestions:
                </p>
                <div className="flex flex-wrap gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <span>🚶 Short walk</span>
                  <span>💧 Hydrate</span>
                  <span>👁️ Rest eyes (20-20-20)</span>
                  <span>🧘 Quick meditation</span>
                  <span>🍎 Healthy snack</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <button
                type="button"
                className={cn(
                  'relative flex h-full min-h-[400px] w-full flex-col items-center justify-center rounded-lg border-2 border-dashed bg-background/50 p-6 text-center transition-colors duration-300',
                  isDragOver
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-muted-foreground/20'
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <Clock
                  className={cn(
                    'mx-auto mb-3 h-12 w-12 transition-colors duration-200',
                    isDragOver
                      ? 'text-blue-500'
                      : isDraggingTask
                        ? 'text-blue-400'
                        : 'text-muted-foreground'
                  )}
                />
                <p
                  className={cn(
                    'text-base transition-colors duration-200',
                    isDragOver
                      ? 'text-blue-700 dark:text-blue-300'
                      : isDraggingTask
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-muted-foreground'
                  )}
                >
                  {isDragOver
                    ? 'Drop task here to start tracking'
                    : isDraggingTask
                      ? 'Drag task here to start tracking'
                      : 'Ready to start tracking time'}
                </p>
                <p
                  className={cn(
                    'mt-2 text-xs transition-colors duration-200',
                    isDragOver
                      ? 'text-blue-600/70 dark:text-blue-400/70'
                      : isDraggingTask
                        ? 'text-blue-500/70 dark:text-blue-400/70'
                        : 'text-muted-foreground'
                  )}
                >
                  {isDragOver
                    ? 'Release to select this task'
                    : isDraggingTask
                      ? 'Drop zone is ready • Drag outside to cancel'
                      : 'Drag tasks to the search field or select manually below'}
                </p>
              </button>

              {/* Session Mode Toggle */}
              <Tabs
                value={sessionMode}
                onValueChange={(v: 'task' | 'manual') =>
                  handleSessionModeChange(v)
                }
              >
                <TabsList className="grid h-full w-full grid-cols-2 bg-muted/50">
                  <TabsTrigger
                    value="task"
                    className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">Task-based</span>
                      <span className="text-xs text-muted-foreground">
                        Select or create task
                      </span>
                    </div>
                  </TabsTrigger>
                  <TabsTrigger
                    value="manual"
                    className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <Timer className="h-4 w-4" />
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">Manual</span>
                      <span className="text-xs text-muted-foreground">
                        Free-form entry
                      </span>
                    </div>
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="task"
                  className="space-y-4 duration-300 animate-in fade-in-50 slide-in-from-bottom-2"
                >
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">
                      Select a task to track time for:
                    </Label>

                    {tasks.length === 0 ? (
                      <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 text-center">
                        <CheckCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="mb-2 text-sm font-medium text-muted-foreground">
                          No tasks available
                        </p>
                        <p className="mb-3 text-xs text-muted-foreground">
                          Create tasks in your project boards to start tracking
                          time
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (onGoToTasksTab) {
                              onGoToTasksTab();
                            } else {
                              toast.info(
                                'Redirecting to Tasks tab to create a task...'
                              );
                            }
                          }}
                          className="text-xs"
                        >
                          Go to Tasks Tab
                        </Button>
                      </div>
                    ) : (
                      <>
                        {/* Searchable Task Selection */}
                        {/* biome-ignore lint/a11y/useSemanticElements: dropdown container interactive div */}
                        <div
                          ref={dropdownContainerRef}
                          onDragEnter={handleDragEnter}
                          onDragLeave={handleDragLeave}
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                        >
                          {/* Display Mode: Show Selected Task */}
                          {selectedTaskId &&
                          selectedTaskId !== 'none' &&
                          !isSearchMode ? (
                            (() => {
                              const selectedTask = tasks.find(
                                (t) => t.id === selectedTaskId
                              );
                              return selectedTask ? (
                                <button
                                  type="button"
                                  className={cn(
                                    'flex min-h-[60px] w-full items-center gap-3 rounded-lg border bg-background p-3 text-left transition-all',
                                    isTaskDropdownOpen
                                      ? 'border-blue-500 ring-4 ring-blue-500/20'
                                      : 'hover:border-muted-foreground/50'
                                  )}
                                  onClick={() =>
                                    setIsTaskDropdownOpen(!isTaskDropdownOpen)
                                  }
                                >
                                  <div className="flex-1">
                                    <div className="text-sm font-medium">
                                      {selectedTask.name}
                                    </div>
                                    {selectedTask.board_name &&
                                      selectedTask.list_name && (
                                        <div className="mt-1 flex items-center gap-1">
                                          <span className="text-xs text-muted-foreground">
                                            {selectedTask.board_name}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            •
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {selectedTask.list_name}
                                          </span>
                                        </div>
                                      )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedTaskId('none');
                                        setIsSearchMode(true);
                                        setTaskSearchQuery('');
                                        toast.success('Task selection cleared');
                                      }}
                                      className="rounded p-1 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                      title="Remove selected task"
                                    >
                                      <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <title>Remove selected task</title>
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M6 18L18 6M6 6l12 12"
                                        />
                                      </svg>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (isTaskDropdownOpen) {
                                          setIsTaskDropdownOpen(false);
                                          setIsSearchMode(false);
                                        } else {
                                          openDropdown();
                                        }
                                      }}
                                      className="rounded p-1 hover:bg-muted"
                                    >
                                      <svg
                                        className={cn(
                                          'h-4 w-4 transition-transform',
                                          isTaskDropdownOpen &&
                                            (dropdownPosition === 'above'
                                              ? 'rotate-0'
                                              : 'rotate-180')
                                        )}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        role="img"
                                      >
                                        <title>Toggle task dropdown</title>
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M19 9l-7 7-7-7"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </button>
                              ) : null;
                            })()
                          ) : (
                            <div className="relative">
                              <Input
                                placeholder={
                                  isDragOver
                                    ? 'Drop task here to select'
                                    : isDraggingTask
                                      ? 'Drop here or press ESC to cancel'
                                      : 'Search tasks or create new...'
                                }
                                value={taskSearchQuery}
                                onChange={(e) =>
                                  setTaskSearchQuery(e.target.value)
                                }
                                onFocus={() => {
                                  setIsSearchMode(true);
                                  openDropdown();
                                }}
                                className={cn(
                                  'h-auto min-h-[2.5rem] pr-10 transition-all duration-200',
                                  isDragOver
                                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                                    : isDraggingTask
                                      ? 'border-blue-400/60 bg-blue-50/20 dark:bg-blue-950/10'
                                      : ''
                                )}
                                autoFocus={isSearchMode}
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (isTaskDropdownOpen) {
                                    setIsTaskDropdownOpen(false);
                                    setIsSearchMode(false);
                                  } else {
                                    openDropdown();
                                  }
                                }}
                                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 hover:bg-muted"
                              >
                                <svg
                                  className={cn(
                                    'h-4 w-4 transition-transform',
                                    isTaskDropdownOpen &&
                                      (dropdownPosition === 'above'
                                        ? 'rotate-0'
                                        : 'rotate-180')
                                  )}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  role="img"
                                >
                                  <title>Toggle task dropdown</title>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                              </button>
                            </div>
                          )}

                          {/* Dropdown Content */}
                          {isTaskDropdownOpen && (
                            <>
                              {/* biome-ignore lint/a11y/useSemanticElements: dropdown content container */}
                              <div
                                ref={dropdownContentRef}
                                className="w-full"
                                // The dropdown content itself shouldn't be focusable or handle key events.
                              >
                                {/* Filter Buttons */}
                                <div className="space-y-2 border-b p-3">
                                  <div className="text-xs font-medium text-muted-foreground">
                                    Quick Filters
                                  </div>

                                  {/* Assignee Filters */}
                                  <div className="flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setTaskFilters((prev) => ({
                                          ...prev,
                                          assignee:
                                            prev.assignee === 'mine'
                                              ? 'all'
                                              : 'mine',
                                        }));
                                      }}
                                      className={cn(
                                        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                                        taskFilters.assignee === 'mine'
                                          ? 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                          : 'border-border bg-background hover:bg-muted'
                                      )}
                                    >
                                      <CheckCircle className="h-3 w-3" />
                                      My Tasks
                                      {myTasksCount > 0 && (
                                        <span className="ml-1 rounded-full bg-current px-1.5 py-0.5 text-[10px] text-white">
                                          {myTasksCount}
                                        </span>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setTaskFilters((prev) => ({
                                          ...prev,
                                          assignee:
                                            prev.assignee === 'unassigned'
                                              ? 'all'
                                              : 'unassigned',
                                        }));
                                      }}
                                      className={cn(
                                        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                                        taskFilters.assignee === 'unassigned'
                                          ? 'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                                          : 'border-border bg-background hover:bg-muted'
                                      )}
                                    >
                                      <svg
                                        className="h-3 w-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <title>Unassigned Icon</title>
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                        />
                                      </svg>
                                      Unassigned
                                      {unassignedCount > 0 && (
                                        <span className="ml-1 rounded-full bg-current px-1.5 py-0.5 text-[10px] text-white">
                                          {unassignedCount}
                                        </span>
                                      )}
                                    </button>
                                  </div>

                                  {/* Board Filters */}
                                  <div className="flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setTaskFilters((prev) => ({
                                          ...prev,
                                          board: 'all',
                                        }));
                                      }}
                                      className={cn(
                                        'rounded-md border px-2 py-1 text-xs transition-colors',
                                        taskFilters.board === 'all'
                                          ? 'border-primary bg-primary text-primary-foreground'
                                          : 'border-border bg-background hover:bg-muted'
                                      )}
                                    >
                                      All Boards
                                    </button>
                                    {uniqueBoards.map((board) => (
                                      <button
                                        key={board}
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setTaskFilters((prev) => ({
                                            ...prev,
                                            board,
                                          }));
                                        }}
                                        className={cn(
                                          'rounded-md border px-2 py-1 text-xs transition-colors',
                                          taskFilters.board === board
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border bg-background hover:bg-muted'
                                        )}
                                      >
                                        {board}
                                      </button>
                                    ))}
                                  </div>

                                  <div className="flex flex-wrap gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setTaskFilters((prev) => ({
                                          ...prev,
                                          list: 'all',
                                        }));
                                      }}
                                      className={cn(
                                        'rounded-md border px-2 py-1 text-xs transition-colors',
                                        taskFilters.list === 'all'
                                          ? 'border-secondary bg-secondary text-secondary-foreground'
                                          : 'border-border bg-background hover:bg-muted'
                                      )}
                                    >
                                      All Lists
                                    </button>
                                    {uniqueLists.map((list) => (
                                      <button
                                        key={list}
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setTaskFilters((prev) => ({
                                            ...prev,
                                            list,
                                          }));
                                        }}
                                        className={cn(
                                          'rounded-md border px-2 py-1 text-xs transition-colors',
                                          taskFilters.list === list
                                            ? 'border-secondary bg-secondary text-secondary-foreground'
                                            : 'border-border bg-background hover:bg-muted'
                                        )}
                                      >
                                        {list}
                                      </button>
                                    ))}
                                  </div>

                                  {(taskSearchQuery ||
                                    taskFilters.board !== 'all' ||
                                    taskFilters.list !== 'all' ||
                                    taskFilters.assignee !== 'all') && (
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="text-muted-foreground">
                                        {filteredTasks.length} of {tasks.length}{' '}
                                        tasks
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setTaskSearchQuery('');
                                          setTaskFilters({
                                            board: 'all',
                                            list: 'all',
                                            priority: 'all',
                                            status: 'all',
                                            assignee: 'all',
                                          });
                                        }}
                                        className="text-muted-foreground hover:text-foreground"
                                      >
                                        Clear filters
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Task List */}
                                <div className="max-h-[300px] overflow-y-auto">
                                  {filteredTasks.length === 0 ? (
                                    <div className="p-6 text-center text-sm text-muted-foreground">
                                      {taskSearchQuery ||
                                      taskFilters.board !== 'all' ||
                                      taskFilters.list !== 'all' ||
                                      taskFilters.assignee !== 'all' ? (
                                        <>
                                          <div className="mb-2">
                                            No tasks found matching your
                                            criteria
                                          </div>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              setTaskSearchQuery('');
                                              setTaskFilters({
                                                board: 'all',
                                                list: 'all',
                                                priority: 'all',
                                                status: 'all',
                                                assignee: 'all',
                                              });
                                            }}
                                            className="text-xs text-primary hover:underline"
                                          >
                                            Clear filters to see all tasks
                                          </button>
                                        </>
                                      ) : (
                                        'No tasks available'
                                      )}
                                    </div>
                                  ) : (
                                    filteredTasks.map((task) => (
                                      <button
                                        key={task.id}
                                        type="button"
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (task.id) {
                                            handleTaskSelectionChange(task.id);
                                          }
                                        }}
                                        className="w-full p-0 text-left transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                                      >
                                        <div
                                          className={cn(
                                            'flex w-full items-start gap-3 p-3 hover:bg-muted/30',
                                            task.is_assigned_to_current_user &&
                                              'bg-blue-50/50 dark:bg-blue-950/20'
                                          )}
                                        >
                                          <div
                                            className={cn(
                                              'flex h-8 w-8 items-center justify-center rounded-lg border',
                                              task.is_assigned_to_current_user
                                                ? 'border-blue-400/50 bg-gradient-to-br from-blue-100 to-blue-200 dark:border-blue-600 dark:from-blue-800 dark:to-blue-700'
                                                : 'border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/20 to-dynamic-blue/10'
                                            )}
                                          >
                                            <CheckCircle
                                              className={cn(
                                                'h-4 w-4',
                                                task.is_assigned_to_current_user
                                                  ? 'text-blue-700 dark:text-blue-300'
                                                  : 'text-dynamic-blue'
                                              )}
                                            />
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                              <span
                                                className={cn(
                                                  'text-sm font-medium',
                                                  task.is_assigned_to_current_user &&
                                                    'text-blue-900 dark:text-blue-100'
                                                )}
                                              >
                                                {task.name}
                                                {task.is_assigned_to_current_user && (
                                                  <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                                                    Assigned to you
                                                  </span>
                                                )}
                                              </span>
                                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                            </div>
                                            {task.description && (
                                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                {task.description}
                                              </p>
                                            )}

                                            {/* Assignees Display */}
                                            {task.assignees &&
                                              task.assignees.length > 0 && (
                                                <div className="mt-2 flex items-center gap-2">
                                                  <div className="flex -space-x-1">
                                                    {task.assignees
                                                      .slice(0, 3)
                                                      .map((assignee) => (
                                                        <div
                                                          key={assignee.id}
                                                          className="h-4 w-4 rounded-full border border-white bg-gradient-to-br from-gray-100 to-gray-200 dark:border-gray-800 dark:from-gray-700 dark:to-gray-600"
                                                          title={
                                                            assignee.display_name ||
                                                            assignee.email
                                                          }
                                                        >
                                                          {assignee.avatar_url ? (
                                                            <Image
                                                              src={
                                                                assignee.avatar_url
                                                              }
                                                              alt={
                                                                assignee.display_name ||
                                                                assignee.email ||
                                                                ''
                                                              }
                                                              className="h-full w-full rounded-full object-cover"
                                                              width={16}
                                                              height={16}
                                                            />
                                                          ) : (
                                                            <div className="flex h-full w-full items-center justify-center text-[8px] font-medium text-gray-600 dark:text-gray-300">
                                                              {generateAssigneeInitials(
                                                                assignee
                                                              )}
                                                            </div>
                                                          )}
                                                        </div>
                                                      ))}
                                                    {task.assignees.length >
                                                      3 && (
                                                      <div className="flex h-4 w-4 items-center justify-center rounded-full border border-white bg-gray-200 text-[8px] font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                                        +
                                                        {task.assignees.length -
                                                          3}
                                                      </div>
                                                    )}
                                                  </div>
                                                  <span className="text-xs text-muted-foreground">
                                                    {task.assignees.length}{' '}
                                                    assigned
                                                  </span>
                                                </div>
                                              )}

                                            {task.board_name &&
                                              task.list_name && (
                                                <div className="mt-2 flex items-center gap-2">
                                                  <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
                                                    <MapPin className="h-3 w-3 text-muted-foreground" />
                                                    <span className="text-xs font-medium">
                                                      {task.board_name}
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center gap-1.5 rounded-md border border-dynamic-green/20 bg-gradient-to-r from-dynamic-green/10 to-dynamic-green/5 px-2 py-1">
                                                    <Tag className="h-3 w-3 text-dynamic-green" />
                                                    <span className="text-xs font-medium text-dynamic-green">
                                                      {task.list_name}
                                                    </span>
                                                  </div>
                                                </div>
                                              )}
                                          </div>
                                        </div>
                                      </button>
                                    ))
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        {(selectedTaskId === 'none' || !selectedTaskId) && (
                          <div className="text-center">
                            <p className="mb-2 text-sm text-muted-foreground">
                              No task selected? We'll help you create one!
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="session-description">
                      Session notes (optional)
                    </Label>
                    <Textarea
                      id="session-description"
                      placeholder="Add session notes..."
                      value={newSessionDescription}
                      onChange={(e) => setNewSessionDescription(e.target.value)}
                      rows={2}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="category-select">Category (optional)</Label>
                    <Select
                      value={selectedCategoryId}
                      onValueChange={setSelectedCategoryId}
                    >
                      <SelectTrigger id="category-select" className="mt-1">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'h-3 w-3 rounded-full',
                                  getCategoryColor(category.color || 'BLUE')
                                )}
                              />
                              {category.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={startTimer}
                    disabled={isLoading}
                    className="w-full border border-border bg-muted text-foreground hover:border-accent hover:bg-muted/80 dark:bg-muted dark:text-foreground dark:hover:bg-accent"
                    size="lg"
                  >
                    <Play className="mr-2 h-4 w-4" />
                    {selectedTaskId && selectedTaskId !== 'none'
                      ? 'Start Timer'
                      : 'Create Task & Start Timer'}
                  </Button>
                </TabsContent>

                <TabsContent
                  value="manual"
                  className="space-y-4 duration-300 animate-in fade-in-50 slide-in-from-bottom-2"
                >
                  <div className="space-y-2">
                    <Label htmlFor="session-title">
                      What are you working on?
                    </Label>
                    <Input
                      id="session-title"
                      data-title-input
                      placeholder="Enter session title..."
                      value={newSessionTitle}
                      onChange={(e) => handleManualTitleChange(e.target.value)}
                      className="mt-1"
                      autoFocus={sessionMode === 'manual'}
                    />

                    {/* Task suggestion */}
                    {showTaskSuggestion && newSessionTitle.length > 2 && (
                      <div className="rounded-lg border border-dynamic-blue/30 bg-gradient-to-r from-dynamic-blue/10 to-dynamic-blue/5 p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <div className="rounded-full bg-dynamic-blue/20 p-1">
                              <Sparkles className="h-3 w-3 text-dynamic-blue" />
                            </div>
                            <div className="flex-1">
                              <span className="text-sm font-medium text-dynamic-blue">
                                Convert to task?
                              </span>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                Create "{newSessionTitle}" as a new task for
                                better organization and tracking.
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={createTaskFromManualSession}
                            className="h-8 border-dynamic-blue/30 bg-dynamic-blue/10 text-xs text-dynamic-blue hover:bg-dynamic-blue/20"
                          >
                            Create Task
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Show selected task info */}
                    {selectedTaskId &&
                      selectedTaskId !== 'none' &&
                      !showTaskSuggestion && (
                        <div className="rounded-lg border border-dynamic-green/30 bg-gradient-to-r from-dynamic-green/5 to-dynamic-green/3 p-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dynamic-green/30 bg-gradient-to-br from-dynamic-green/20 to-dynamic-green/10">
                              <CheckCircle className="h-5 w-5 text-dynamic-green" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-dynamic-green">
                                    Task Linked Successfully
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedTaskId('none');
                                    setShowTaskSuggestion(
                                      newSessionTitle.length > 2
                                    );
                                  }}
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                >
                                  Unlink
                                </Button>
                              </div>
                              {(() => {
                                const selectedTask = tasks.find(
                                  (t) => t.id === selectedTaskId
                                );
                                return selectedTask ? (
                                  <div className="mt-2 space-y-2">
                                    <p className="text-sm font-medium text-foreground">
                                      {selectedTask.name}
                                    </p>
                                    {selectedTask.description && (
                                      <p className="line-clamp-2 text-xs text-muted-foreground">
                                        {selectedTask.description}
                                      </p>
                                    )}
                                    {selectedTask.board_name &&
                                      selectedTask.list_name && (
                                        <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
                                            <MapPin className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-xs font-medium">
                                              {selectedTask.board_name}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1.5 rounded-md border border-dynamic-green/20 bg-gradient-to-r from-dynamic-green/10 to-dynamic-green/5 px-2 py-1">
                                            <Tag className="h-3 w-3 text-dynamic-green" />
                                            <span className="text-xs font-medium text-dynamic-green">
                                              {selectedTask.list_name}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    <p className="text-xs text-dynamic-green/80">
                                      Time will be automatically tracked for
                                      this task
                                    </p>
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                  </div>

                  <div>
                    <Label htmlFor="session-description">
                      Description (optional)
                    </Label>
                    <Textarea
                      id="session-description"
                      placeholder="Add description..."
                      value={newSessionDescription}
                      onChange={(e) => setNewSessionDescription(e.target.value)}
                      rows={3}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="category-select">Category (optional)</Label>
                    <Select
                      value={selectedCategoryId}
                      onValueChange={setSelectedCategoryId}
                    >
                      <SelectTrigger id="category-select" className="mt-1">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'h-3 w-3 rounded-full',
                                  getCategoryColor(category.color || 'BLUE')
                                )}
                              />
                              {category.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={startTimer}
                    disabled={!newSessionTitle.trim() || isLoading}
                    className="w-full border border-border bg-muted text-foreground hover:border-accent hover:bg-muted/80 dark:bg-muted dark:text-foreground dark:hover:bg-accent"
                    size="lg"
                  >
                    <Play className="mr-2 h-5 w-5" />
                    Start Timer
                  </Button>
                </TabsContent>
              </Tabs>

              {/* Quick Start Templates */}
              {templates.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm text-muted-foreground">
                    Quick Start:
                  </Label>
                  <div className="space-y-2">
                    {templates.slice(0, 3).map((template, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => startFromTemplate(template)}
                        className="w-full justify-start text-sm"
                      >
                        <Copy className="mr-2 h-3 w-3" />
                        {template.title}
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {template.usage_count}×
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Completion Celebration */}
        {justCompleted && (
          <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-black/20 backdrop-blur-sm duration-300 animate-in fade-in">
            <div className="rounded-lg border bg-background p-6 shadow-xl duration-300 animate-in zoom-in">
              <div className="text-center">
                <CheckCircle className="mx-auto mb-4 h-12 w-12 animate-pulse text-green-500" />
                <h3 className="mb-2 text-lg font-semibold">
                  Session Completed!
                </h3>
                <p className="mb-1 text-muted-foreground">
                  {justCompleted.title}
                </p>
                <p className="text-sm font-medium text-green-600">
                  {formatDuration(justCompleted.duration_seconds || 0)} tracked
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
      <Dialog open={showTaskCreation} onOpenChange={setShowTaskCreation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Create New Task
            </DialogTitle>
            <DialogDescription>
              Create a new task to track time for. We'll start the timer
              automatically once the task is created.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-name">Task Name</Label>
              <Input
                id="task-name"
                value={newTaskName}
                onChange={(e) => setNewTaskName(e.target.value)}
                placeholder="What are you working on?"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="task-description">Description (Optional)</Label>
              <Textarea
                id="task-description"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Add details about this task..."
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="board-select">Board</Label>
              <Select
                value={selectedBoardId}
                onValueChange={(value) => {
                  setSelectedBoardId(value);
                  setSelectedListId(''); // Reset list when board changes
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a board" />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((board) => (
                    <SelectItem key={board.id} value={board.id}>
                      {board.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedBoardId && (
              <div>
                <Label htmlFor="list-select">List</Label>
                <Select
                  value={selectedListId}
                  onValueChange={setSelectedListId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a list" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-3 w-3 rounded-full',
                              getCategoryColor(list.color.toUpperCase())
                            )}
                          />
                          {list.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowTaskCreation(false);
                  setNewTaskName('');
                  setNewTaskDescription('');
                  setSelectedBoardId('');
                  setSelectedListId('');
                }}
                className="flex-1"
                disabled={isCreatingTask}
              >
                Cancel
              </Button>
              <Button
                onClick={createTask}
                disabled={
                  isCreatingTask || !newTaskName.trim() || !selectedListId
                }
                className="flex-1 border border-border bg-muted text-foreground hover:border-accent hover:bg-muted/80 dark:bg-muted dark:text-foreground dark:hover:bg-accent"
              >
                {isCreatingTask ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Create & Start Timer
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      ;
    </>
  );
}
