'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Icons from '@tuturuuu/icons';
import {
  Apple,
  Brain,
  CheckCircle,
  Clock,
  ClockFading,
  Coffee,
  Copy,
  CupSoda,
  ExternalLink,
  Eye,
  Footprints,
  fruit,
  Icon,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Settings2,
  Sparkles,
  Square,
  TableOfContents,
  Tag,
  Timer,
} from '@tuturuuu/icons';
import type {
  TimeTrackingCategory,
  Workspace,
  WorkspaceTask,
} from '@tuturuuu/types';
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
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentProps, ElementType } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSessionExceedsThreshold } from '@/hooks/useSessionExceedsThreshold';
import { useWorkspaceBreakTypes } from '@/hooks/useWorkspaceBreakTypes';
import { useWorkspaceTimeThreshold } from '@/hooks/useWorkspaceTimeThreshold';
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
import MissedEntryDialog, { type ChainSummary } from './missed-entry-dialog';
import { PomodoroSettingsDialog } from './pomodoro-settings-dialog';

interface SessionTemplate {
  title: string;
  description?: string;
  category_id?: string;
  task_id?: string;
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
  setCurrentSession: (session: SessionWithRelations | null) => void;
  elapsedTime: number;
  setElapsedTime: (time: number) => void;
  isRunning: boolean;
  setIsRunning: (running: boolean) => void;
  categories: TimeTrackingCategory[];
  tasks: ExtendedWorkspaceTask[];
  onSessionUpdate: () => void;
  formatTime: (seconds: number) => string;
  formatDuration: (seconds: number) => string;
  apiCall: (url: string, options?: RequestInit) => Promise<any>;
  isDraggingTask?: boolean;
  currentUserId?: string | null;
  workspace: Workspace;
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

enum TimerMode {
  stopwatch = 'stopwatch',
  pomodoro = 'pomodoro',
  custom = 'custom',
}
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

// Tab metadata for timer mode selector
type TimerModeTab = {
  value: TimerMode;
  label: string;
  icon: ElementType<{ className?: string }>;
};

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
  currentUserId,
  workspace,
}: TimerControlsProps) {
  const t = useTranslations('time-tracker.controls');
  const { modKey } = usePlatform();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Define timer mode tabs inside component to access t function
  const TIMER_MODE_TABS: readonly TimerModeTab[] = useMemo(
    () =>
      [
        {
          value: TimerMode.stopwatch,
          label: t('stopwatch_mode'),
          icon: Timer,
        },
        {
          value: TimerMode.pomodoro,
          label: t('pomodoro_mode'),
          icon: (props: ComponentProps<'svg'>) => (
            <Icon iconNode={fruit} {...props} />
          ),
        },
        {
          value: TimerMode.custom,
          label: t('custom_mode'),
          icon: Settings2,
        },
      ] as const,
    [t]
  );

  const [isLoading, setIsLoading] = useState(false);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDescription, setNewSessionDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('none');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('none');
  const [sessionMode, setSessionMode] = useState<'task' | 'manual'>('task');

  const renderBreakTypeIcon = useCallback((iconName: string | null) => {
    if (!iconName) return null;
    const IconComponent = (Icons as any)[iconName];
    if (!IconComponent) return null;
    if (Array.isArray(IconComponent)) {
      return <Icon iconNode={IconComponent} className="mr-2 h-4 w-4" />;
    }
    return <IconComponent className="mr-2 h-4 w-4" />;
  }, []);
  const [showTaskSuggestion, setShowTaskSuggestion] = useState(false);
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [justCompleted, setJustCompleted] =
    useState<SessionWithRelations | null>(null);

  // Enhanced pause/resume state
  const [pausedSession, setPausedSession] =
    useState<SessionWithRelations | null>(null);
  const [pausedElapsedTime, setPausedElapsedTime] = useState(0);
  const [pauseStartTime, setPauseStartTime] = useState<Date | null>(null);

  // Break type selection state
  const [showBreakTypeDialog, setShowBreakTypeDialog] = useState(false);
  const [selectedBreakTypeId, setSelectedBreakTypeId] = useState<string>('');
  const [customBreakTypeName, setCustomBreakTypeName] = useState('');

  // Current break data for paused session
  const [currentBreak, setCurrentBreak] = useState<{
    id: string;
    break_type_id?: string;
    break_type_name?: string;
    break_type?: { id: string; name: string; icon?: string; color?: string };
    break_start: string;
  } | null>(null);

  const [breakDurationSeconds, setBreakDurationSeconds] = useState(0);

  // Pomodoro and timer mode state
  const [timerMode, setTimerMode] = useState<TimerMode>(TimerMode.stopwatch);

  // State for exceeded threshold session dialog
  const [showExceededThresholdDialog, setShowExceededThresholdDialog] =
    useState(false);
  const [chainSummary, setChainSummary] = useState<ChainSummary | null>(null);

  // Store pending break info when take break triggers threshold exceeded
  const [pendingBreakTypeId, setPendingBreakTypeId] = useState<string | null>(
    null
  );
  const [pendingBreakTypeName, setPendingBreakTypeName] = useState<
    string | null
  >(null);

  // Fetch workspace threshold setting
  const { data: thresholdData, isLoading: isLoadingThreshold } =
    useWorkspaceTimeThreshold(wsId);

  // Fetch workspace break types
  const { data: breakTypes = [] } = useWorkspaceBreakTypes(wsId);

  // Check if current session exceeds the threshold
  const { exceeds: sessionExceedsThreshold } = useSessionExceedsThreshold(
    currentSession || pausedSession,
    thresholdData?.threshold,
    isLoadingThreshold
  );

  // Local elapsed time state to ensure smooth updates even if parent prop lags
  const [localElapsedTime, setLocalElapsedTime] = useState(elapsedTime);

  // Sync local elapsed time with prop when not running
  useEffect(() => {
    if (!isRunning) {
      setLocalElapsedTime(elapsedTime);
    }
  }, [elapsedTime, isRunning]);

  // Fetch active break when session is paused using React Query
  const { data: activeBreakData } = useQuery({
    queryKey: ['active-break', wsId, pausedSession?.id],
    queryFn: async () => {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${pausedSession?.id}/breaks/active`
      );
      return response.break || null;
    },
    enabled: !!pausedSession?.id,
    staleTime: 5000, // Keep fresh for 5 seconds
    retry: 1,
  });

  // Sync active break data to local state
  useEffect(() => {
    if (activeBreakData) {
      setCurrentBreak(activeBreakData);
    } else {
      setCurrentBreak(null);
      setBreakDurationSeconds(0);
    }
  }, [activeBreakData]);

  // Live break duration counter
  useEffect(() => {
    if (!currentBreak?.break_start) {
      setBreakDurationSeconds(0);
      return;
    }

    const updateBreakDuration = () => {
      const breakStart = new Date(currentBreak.break_start).getTime();
      const now = Date.now();
      setBreakDurationSeconds(Math.floor((now - breakStart) / 1000));
    };

    updateBreakDuration();
    const interval = setInterval(updateBreakDuration, 1000);

    return () => clearInterval(interval);
  }, [currentBreak?.break_start]);

  // Local stopwatch interval
  useEffect(() => {
    if (
      timerMode === TimerMode.stopwatch &&
      isRunning &&
      currentSession?.start_time
    ) {
      const startTime = new Date(currentSession.start_time).getTime();

      // Initial update
      setLocalElapsedTime(
        Math.max(0, Math.floor((Date.now() - startTime) / 1000))
      );

      const interval = setInterval(() => {
        const elapsed = Math.max(
          0,
          Math.floor((Date.now() - startTime) / 1000)
        );
        setLocalElapsedTime(elapsed);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [timerMode, isRunning, currentSession]);
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
      currentMode: TimerMode.stopwatch,
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
    [TimerMode.stopwatch]: null,
    [TimerMode.pomodoro]: null,
    [TimerMode.custom]: null,
  });

  // Legacy break reminders state (kept for lastNotificationTime only)
  const [lastNotificationTime, setLastNotificationTime] = useState<number>(0);

  // localStorage keys for persistence
  const TIMER_MODE_SESSIONS_KEY = `timer-mode-sessions-${wsId}-${currentUserId || 'user'}`;

  const { data: pausedData } = useQuery({
    queryKey: ['paused-time-session', wsId, currentUserId],
    queryFn: async () => {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=paused`
      );
      return response;
    },
    staleTime: 30000,
  });

  // Sync paused session from query data
  useEffect(() => {
    if (pausedData?.session) {
      setPausedSession(pausedData.session);
      setPausedElapsedTime(pausedData.session.duration_seconds || 0);
      setPauseStartTime(
        pausedData.pauseTime ? new Date(pausedData.pauseTime) : null
      );
    } else {
      setPausedSession(null);
      setPausedElapsedTime(0);
      setPauseStartTime(null);
    }
  }, [pausedData]);

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
      case TimerMode.stopwatch:
        return stopwatchBreakState;
      case TimerMode.pomodoro:
        return pomodoroBreakState;
      case TimerMode.custom:
        return customBreakState;
      default:
        return stopwatchBreakState;
    }
  }, [timerMode, stopwatchBreakState, pomodoroBreakState, customBreakState]);

  const updateCurrentBreakState = useCallback(
    (updates: Partial<BreakTimeState>) => {
      switch (timerMode) {
        case TimerMode.stopwatch:
          setStopwatchBreakState((prev) => ({ ...prev, ...updates }));
          break;
        case TimerMode.pomodoro:
          setPomodoroBreakState((prev) => ({ ...prev, ...updates }));
          break;
        case TimerMode.custom:
          setCustomBreakState((prev) => ({ ...prev, ...updates }));
          break;
      }
    },
    [timerMode]
  );

  // Safe timer mode switching with validation
  const handleTimerModeChange = useCallback(
    (modeValue: string) => {
      if (!Object.values(TimerMode).includes(modeValue as TimerMode)) return;
      const newMode: TimerMode = TimerMode[modeValue as keyof typeof TimerMode];
      // Prevent mode switching if session is active
      if (sessionProtection.isActive) {
        toast.error(t('cannot_switch_modes'), {
          description: t('stop_or_pause_first'),
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
          elapsedTime: localElapsedTime,
          breakTimeState: currentBreakState,
          pomodoroState:
            timerMode === TimerMode.pomodoro ? countdownState : undefined,
          customTimerState:
            timerMode === TimerMode.custom
              ? {
                  hasReachedTarget,
                  targetProgress:
                    localElapsedTime /
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
          case TimerMode.stopwatch:
            setStopwatchBreakState(previousSession.breakTimeState);
            break;
          case TimerMode.pomodoro:
            setPomodoroBreakState(previousSession.breakTimeState);
            if (previousSession.pomodoroState) {
              setCountdownState(previousSession.pomodoroState);
            }
            break;
          case TimerMode.custom:
            setCustomBreakState(previousSession.breakTimeState);
            if (previousSession.customTimerState) {
              setHasReachedTarget(
                previousSession.customTimerState.hasReachedTarget
              );
            }
            break;
        }

        toast.success(t('switched_to_mode', { mode: newMode }), {
          description: t('restored_session', {
            duration: formatDuration(previousSession.elapsedTime),
          }),
          duration: 3000,
        });
      } else {
        toast.success(t('switched_to_mode', { mode: newMode }), {
          description: t('ready_to_start'),
          duration: 2000,
        });
      }
    },
    [
      sessionProtection.isActive,
      currentSession,
      timerMode,
      localElapsedTime,
      getCurrentBreakState,
      countdownState,
      hasReachedTarget,
      customTimerSettings.targetDuration,
      timerModeSessions,
      setElapsedTime,
      formatDuration,
      t,
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

  // Load timer mode sessions on component mount
  useEffect(() => {
    loadTimerModeSessionsFromStorage();
  }, [loadTimerModeSessionsFromStorage]);

  // Handle taskSelect URL parameter
  useEffect(() => {
    const taskSelectId = searchParams.get('taskSelect');
    if (taskSelectId && tasks.length > 0) {
      const selectedTask = tasks.find((t) => t.id === taskSelectId);
      if (selectedTask) {
        // Set the task as selected in the dropdown
        setSelectedTaskId(taskSelectId);
        setSessionMode('task');

        // Show notification about pre-selected task
        toast.info(t('task_selected', { name: selectedTask.name }), {
          description:
            'This task has been selected for tracking. Click Start to begin.',
          duration: 5000,
        });
      }
    }
  }, [searchParams, tasks, t]);

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
        relatedKeys.forEach((k) => {
          localStorage.removeItem(k);
        });
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
  const elapsedTimeRef = useRef(localElapsedTime);
  const hasReachedTargetRef = useRef(hasReachedTarget);
  const getCurrentBreakStateRef = useRef(getCurrentBreakState);
  const updateCurrentBreakStateRef = useRef(updateCurrentBreakState);

  // Ref for singleton AudioContext to prevent resource leaks
  const audioContextRef = useRef<AudioContext | null>(null);

  // Update refs when values change
  useEffect(() => {
    elapsedTimeRef.current = localElapsedTime;
  }, [localElapsedTime]);

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
            window.AudioContext || (window as any).webkitAudioContext
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
          t('eye_break_reminder'),
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
          t('movement_break_reminder'),
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
            `${t('session_milestones')}! (${timeStr})`,
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
    t,
  ]);

  // Update countdown timer (for pomodoro and traditional countdown modes)
  // Update countdown timer (for pomodoro and traditional countdown modes)
  useEffect(() => {
    if (
      (timerMode === 'pomodoro' ||
        (timerMode === 'custom' &&
          customTimerSettings.type === 'traditional-countdown')) &&
      isRunning
    ) {
      const interval = setInterval(() => {
        setCountdownState((prev) => {
          if (prev.remainingTime <= 0) return prev;
          return { ...prev, remainingTime: prev.remainingTime - 1 };
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [timerMode, isRunning, customTimerSettings.type]);

  // Handle countdown completion
  useEffect(() => {
    if (
      (timerMode === 'pomodoro' ||
        (timerMode === 'custom' &&
          customTimerSettings.type === 'traditional-countdown')) &&
      isRunning &&
      countdownState.remainingTime === 0
    ) {
      if (timerMode === 'pomodoro') {
        handlePomodoroComplete();
      } else if (
        timerMode === 'custom' &&
        customTimerSettings.type === 'traditional-countdown'
      ) {
        // Handle traditional countdown completion
        showNotification(
          t('countdown_complete_notification'),
          customTimerSettings.enableMotivationalMessages
            ? t('countdown_complete_motivational')
            : t('countdown_complete_basic'),
          customTimerSettings.autoRestart
            ? [
                {
                  title: t('auto_restart_countdown'),
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
    }
  }, [
    countdownState.remainingTime,
    timerMode,
    isRunning,
    customTimerSettings,
    handlePomodoroComplete,
    showNotification,
    playNotificationSound,
    t,
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
              `${t('target_achieved')}! (${targetMinutes} min)`,
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
    t,
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
      toast.error(t('failed_to_load_boards'));
    }
  }, [wsId, apiCall, t]);

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
          setNewSessionDescription(
            getDescriptionText(selectedTask.description) || ''
          );

          // Show success feedback (same as drag & drop)
          toast.success(t('task_ready_to_track', { name: selectedTask.name }), {
            description: t('task_ready_description'),
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
    [tasks, t]
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
        toast.success(t('switched_to_manual'), {
          duration: 2000,
        });
      } else {
        toast.success(t('switched_to_task_mode'), {
          duration: 2000,
        });
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
      setSelectedTaskId(matchingTask.id!);
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
      toast.error(t('enter_task_name'));
      return;
    }

    if (!selectedListId) {
      toast.error(t('select_list'));
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

      toast.success(t('task_created', { name: newTask.name }));

      // In task mode, start timer automatically
      // In manual mode, just link the task and let user start manually
      if (sessionMode === 'task') {
        await startTimerWithTask(newTask.id, newTask.name);
      }
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error(t('failed_to_create_task'));
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

        // Invalidate the running session query to update sidebar
        queryClient.invalidateQueries({
          queryKey: ['running-time-session', wsId],
        });

        onSessionUpdate();
        toast.success(t('timer_started'));
      } catch (error) {
        console.error('Error starting timer:', error);
        toast.error(t('failed_to_start_timer'));
      } finally {
        setIsLoading(false);
      }
    },
    [
      wsId,
      apiCall,
      newSessionDescription,
      selectedCategoryId,
      setCurrentSession,
      setIsRunning,
      setElapsedTime,
      queryClient,
      onSessionUpdate,
      t,
    ]
  );

  // Start timer
  const startTimer = useCallback(async () => {
    if (sessionMode === 'task' && selectedTaskId && selectedTaskId !== 'none') {
      const selectedTask = tasks.find((t) => t.id === selectedTaskId);
      if (selectedTask) {
        await startTimerWithTask(selectedTaskId, selectedTask.name!);
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
      toast.error(t('enter_session_title'));
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

      // Invalidate the running session query to update sidebar
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });

      onSessionUpdate();
      toast.success(
        timerMode === 'pomodoro' ? t('timer_started_focus') : t('timer_started')
      );
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error(t('failed_to_start_timer'));
    } finally {
      setIsLoading(false);
    }
  }, [
    sessionMode,
    selectedTaskId,
    tasks,
    startTimerWithTask,
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
    queryClient,
    onSessionUpdate,
    t,
  ]);

  // Stop timer - handle both active and paused sessions
  const stopTimer = useCallback(async () => {
    const sessionToStop = currentSession || pausedSession;
    if (!sessionToStop) return;

    // Check if session exceeds threshold - show dialog instead of stopping directly
    // BUT skip if session already has pending_approval=true (request already submitted)
    const hasPendingApproval = sessionToStop.pending_approval === true;
    if (sessionExceedsThreshold && !hasPendingApproval) {
      setShowExceededThresholdDialog(true);
      return;
    }

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

      // If session has pending approval, just clear the UI state without showing celebration
      // The session will appear in history only after the request is approved
      if (hasPendingApproval) {
        // Clear all session states
        setCurrentSession(null);
        setPausedSession(null);
        setIsRunning(false);
        setElapsedTime(0);
        setPausedElapsedTime(0);
        setPauseStartTime(null);
        updateSessionProtection(false, timerMode);

        queryClient.invalidateQueries({
          queryKey: ['running-time-session', wsId],
        });
        queryClient.invalidateQueries({
          queryKey: ['paused-time-session', wsId, currentUserId],
        });

        onSessionUpdate();
        toast.info(
          t('session_pending_approval') ||
            'Session is pending approval. It will appear in your history once approved.'
        );
        return;
      }

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

      // Show completion celebration
      setTimeout(() => setJustCompleted(null), 3000);

      // Invalidate the running and paused session queries to update UI
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });
      queryClient.invalidateQueries({
        queryKey: ['paused-time-session', wsId, currentUserId],
      });

      onSessionUpdate();
      toast.success(
        t('session_completed', {
          duration: formatDuration(completedSession.duration_seconds || 0),
        }),
        {
          duration: 4000,
        }
      );
    } catch (error: any) {
      // Check if error is THRESHOLD_EXCEEDED with chain summary
      if (
        error?.code === 'THRESHOLD_EXCEEDED' ||
        error?.error?.includes('threshold') ||
        error?.message?.includes('threshold')
      ) {
        const errorData = error?.error ? error : await error.response?.json();

        if (errorData?.chainSummary) {
          // Session chain exceeds threshold - show chain approval dialog
          setChainSummary(errorData.chainSummary);
          setShowExceededThresholdDialog(true);
        } else {
          // Single session exceeds threshold
          setShowExceededThresholdDialog(true);
        }
      } else {
        console.error('Error stopping timer:', error);
        toast.error(t('failed_to_stop_timer'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    currentSession,
    pausedSession,
    sessionExceedsThreshold,
    wsId,
    apiCall,
    setCurrentSession,
    setIsRunning,
    setElapsedTime,
    updateSessionProtection,
    timerMode,
    queryClient,
    onSessionUpdate,
    formatDuration,
    t,
    currentUserId,
  ]);

  // Pause timer - properly maintain session state
  const pauseTimer = useCallback(
    async (breakTypeId?: string, breakTypeName?: string) => {
      if (!currentSession) return;

      // Check if session exceeds threshold - show dialog instead of pausing directly
      if (sessionExceedsThreshold) {
        // Store break info before showing dialog
        setPendingBreakTypeId(breakTypeId || null);
        setPendingBreakTypeName(breakTypeName || null);
        setShowExceededThresholdDialog(true);
        return;
      }

      setIsLoading(true);

      try {
        const body: {
          action: string;
          breakTypeId?: string;
          breakTypeName?: string;
        } = {
          action: 'pause',
        };

        if (breakTypeId) {
          body.breakTypeId = breakTypeId;
        } else if (breakTypeName) {
          body.breakTypeName = breakTypeName;
        }

        await apiCall(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions/${currentSession.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(body),
          }
        );

        const pauseTime = new Date();

        // Store paused session data instead of clearing it
        setPausedSession(currentSession);
        setPausedElapsedTime(localElapsedTime);
        setPauseStartTime(pauseTime);

        // Clear active session but keep paused state
        setCurrentSession(null);
        setIsRunning(false);
        setElapsedTime(0);

        onSessionUpdate();

        // Invalidate queries to refetch running session and paused session
        queryClient.invalidateQueries({
          queryKey: ['running-time-session', wsId],
        });
        queryClient.invalidateQueries({
          queryKey: ['paused-time-session', wsId, currentUserId],
        });

        toast.success(t('timer_paused'), {
          description: t('session_title', { title: currentSession.title }),
          duration: 4000,
        });
      } catch (error: any) {
        // Check if error is THRESHOLD_EXCEEDED with chain summary
        if (
          error?.code === 'THRESHOLD_EXCEEDED' ||
          error?.error?.includes('threshold') ||
          error?.message?.includes('threshold')
        ) {
          const errorData = error?.error
            ? error
            : await error.response?.json().catch(() => ({}));

          if (errorData?.chainSummary) {
            // Session chain exceeds threshold - show chain approval dialog
            setChainSummary(errorData.chainSummary);
            setShowExceededThresholdDialog(true);
          } else {
            // Single session exceeds threshold
            setShowExceededThresholdDialog(true);
          }
        } else {
          console.error('Error pausing timer:', error);
          toast.error(t('failed_to_pause_timer'));
        }
      } finally {
        setIsLoading(false);
      }
    },
    [
      currentSession,
      wsId,
      apiCall,
      localElapsedTime,
      setCurrentSession,
      setIsRunning,
      setElapsedTime,
      onSessionUpdate,
      t,
      sessionExceedsThreshold,
      currentUserId,
      queryClient.invalidateQueries,
    ]
  );

  // Handle break type selection for pause
  const handlePauseWithBreakType = useCallback(() => {
    if (!currentSession) return;
    setShowBreakTypeDialog(true);
  }, [currentSession]);

  const handleBreakTypeSelected = useCallback(async () => {
    if (!currentSession) return;

    // Close dialog first
    setShowBreakTypeDialog(false);

    // Call pauseTimer with selected break type
    if (selectedBreakTypeId) {
      await pauseTimer(selectedBreakTypeId, undefined);
    } else if (customBreakTypeName.trim()) {
      await pauseTimer(undefined, customBreakTypeName.trim());
    } else {
      await pauseTimer(); // No break type
    }

    // Reset break type selection
    setSelectedBreakTypeId('');
    setCustomBreakTypeName('');
  }, [currentSession, selectedBreakTypeId, customBreakTypeName, pauseTimer]);

  // Handle session discarded from exceeded threshold dialog
  const handleSessionDiscarded = () => {
    setCurrentSession(null);
    setPausedSession(null);
    setIsRunning(false);
    setElapsedTime(0);
    setPausedElapsedTime(0);
    setPauseStartTime(null);
    setPendingBreakTypeId(null);
    setPendingBreakTypeName(null);
    updateSessionProtection(false, timerMode);
    onSessionUpdate();
  };

  // Handle missed entry created from exceeded threshold dialog
  // If wasBreakPause is true, keep paused session state since the session is now on a break
  const handleMissedEntryCreated = (wasBreakPause?: boolean) => {
    // Always clear running state
    setCurrentSession(null);
    setIsRunning(false);
    setElapsedTime(0);

    // Only clear paused state if this wasn't a break pause
    // For break pauses, the session is now paused with a break, so let the query refetch handle it
    if (!wasBreakPause) {
      setPausedSession(null);
      setPausedElapsedTime(0);
      setPauseStartTime(null);
    }

    // Always clear pending break info
    setPendingBreakTypeId(null);
    setPendingBreakTypeName(null);
    updateSessionProtection(false, timerMode);
    onSessionUpdate();

    // For break pauses, invalidate the paused session query to refetch the updated state
    if (wasBreakPause) {
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'paused-time-session' &&
          query.queryKey[1] === wsId,
      });
    }
  };

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

      const pauseDuration = pauseStartTime
        ? Math.floor((Date.now() - pauseStartTime.getTime()) / 1000)
        : 0;

      // Invalidate the running session query to update sidebar
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });

      onSessionUpdate();
      toast.success(t('timer_resumed'), {
        description:
          pauseDuration > 0
            ? t('paused_duration', { duration: formatDuration(pauseDuration) })
            : t('welcome_back'),
        duration: 3000,
      });
    } catch (error) {
      console.error('Error resuming timer:', error);
      toast.error(t('failed_to_resume_timer'));
    } finally {
      setIsLoading(false);
    }
  }, [
    pausedSession,
    wsId,
    apiCall,
    pausedElapsedTime,
    pauseStartTime,
    setCurrentSession,
    setElapsedTime,
    setIsRunning,
    updateSessionProtection,
    timerMode,
    queryClient,
    onSessionUpdate,
    formatDuration,
    t,
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
        setNewSessionDescription(getDescriptionText(task.description) || '');

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
        let nextIndex: number;

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
    filteredTasks,
    handleTaskSelectionChange,
  ]);

  return (
    <>
      {/* Custom Timer Advanced Settings Dialog */}
      <Dialog open={showCustomSettings} onOpenChange={setShowCustomSettings}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" /> {t('advanced_settings_title')}
            </DialogTitle>
            <DialogDescription>{t('advanced_settings_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Timer Type Specific Settings */}
            {customTimerSettings.type === 'enhanced-stopwatch' && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm">
                  {t('enhanced_stopwatch_settings')}
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t('target_duration')}</Label>
                    <Input
                      type="number"
                      min="10"
                      max="480"
                      value={customTimerSettings.targetDuration}
                      onChange={(e) =>
                        setCustomTimerSettings((prev) => ({
                          ...prev,
                          targetDuration: parseInt(e.target.value, 10) || 60,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label>{t('break_frequency')}</Label>
                    <Input
                      type="number"
                      min="5"
                      max="120"
                      value={customTimerSettings.intervalFrequency}
                      onChange={(e) =>
                        setCustomTimerSettings((prev) => ({
                          ...prev,
                          intervalFrequency: parseInt(e.target.value, 10) || 25,
                        }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>{t('break_duration')}</Label>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={customTimerSettings.intervalBreakDuration}
                    onChange={(e) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        intervalBreakDuration:
                          parseInt(e.target.value, 10) || 5,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-stop-target">
                    {t('auto_stop_target')}
                  </Label>
                  <Switch
                    id="auto-stop-target"
                    checked={customTimerSettings.autoStopAtTarget}
                    onCheckedChange={(checked) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        autoStopAtTarget: checked,
                      }))
                    }
                    role="switch"
                    aria-checked={customTimerSettings.autoStopAtTarget}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="target-notifications">
                    {t('enable_target_notifications')}
                  </Label>
                  <Switch
                    id="target-notifications"
                    checked={customTimerSettings.enableTargetNotification}
                    onCheckedChange={(checked) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        enableTargetNotification: checked,
                      }))
                    }
                    role="switch"
                    aria-checked={customTimerSettings.enableTargetNotification}
                  />
                </div>
              </div>
            )}

            {customTimerSettings.type === 'traditional-countdown' && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm">
                  {t('traditional_countdown_settings')}
                </h4>
                <div>
                  <Label>{t('countdown_duration')}</Label>
                  <Input
                    type="number"
                    min="1"
                    max="480"
                    value={customTimerSettings.countdownDuration}
                    onChange={(e) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        countdownDuration: parseInt(e.target.value, 10) || 25,
                      }))
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-restart">{t('auto_restart')}</Label>
                  <Switch
                    id="auto-restart"
                    checked={customTimerSettings.autoRestart}
                    onCheckedChange={(checked) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        autoRestart: checked,
                      }))
                    }
                    role="switch"
                    aria-checked={customTimerSettings.autoRestart}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-time-remaining">
                    {t('show_time_remaining')}
                  </Label>
                  <Switch
                    id="show-time-remaining"
                    checked={customTimerSettings.showTimeRemaining}
                    onCheckedChange={(checked) =>
                      setCustomTimerSettings((prev) => ({
                        ...prev,
                        showTimeRemaining: checked,
                      }))
                    }
                    role="switch"
                    aria-checked={customTimerSettings.showTimeRemaining}
                  />
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h4 className="font-medium text-sm">{t('break_reminders')}</h4>
              <div className="flex items-center justify-between">
                <Label htmlFor="enable-break-reminders">
                  {t('enable_break_reminders')}
                </Label>
                <Switch
                  id="enable-break-reminders"
                  checked={customTimerSettings.enableBreakReminders}
                  onCheckedChange={(checked) =>
                    setCustomTimerSettings((prev) => ({
                      ...prev,
                      enableBreakReminders: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={customTimerSettings.enableBreakReminders}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t('break_reminders_desc')}
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">
                {t('audio_notifications')}
              </h4>
              <div className="flex items-center justify-between">
                <Label htmlFor="play-completion-sound">
                  {t('play_completion_sound')}
                </Label>
                <Switch
                  id="play-completion-sound"
                  checked={customTimerSettings.playCompletionSound}
                  onCheckedChange={(checked) =>
                    setCustomTimerSettings((prev) => ({
                      ...prev,
                      playCompletionSound: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={customTimerSettings.playCompletionSound}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="browser-notifications">
                  {t('browser_notifications')}
                </Label>
                <Switch
                  id="browser-notifications"
                  checked={customTimerSettings.showNotifications}
                  onCheckedChange={(checked) =>
                    setCustomTimerSettings((prev) => ({
                      ...prev,
                      showNotifications: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={customTimerSettings.showNotifications}
                />
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm">
                {t('motivation_feedback')}
              </h4>
              <div className="flex items-center justify-between">
                <Label htmlFor="motivational-messages">
                  {t('motivational_messages')}
                </Label>
                <Switch
                  id="motivational-messages"
                  checked={customTimerSettings.enableMotivationalMessages}
                  onCheckedChange={(checked) =>
                    setCustomTimerSettings((prev) => ({
                      ...prev,
                      enableMotivationalMessages: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={customTimerSettings.enableMotivationalMessages}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {t('motivational_messages_desc')}
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
      <PomodoroSettingsDialog
        open={showPomodoroSettings}
        onOpenChange={setShowPomodoroSettings}
        settings={pomodoroSettings}
        onSettingsChange={setPomodoroSettings}
        defaultSettings={DEFAULT_POMODORO_SETTINGS}
      />

      {/* Stopwatch Settings Dialog */}
      <Dialog
        open={showStopwatchSettings}
        onOpenChange={setShowStopwatchSettings}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" /> {t('stopwatch_settings')}
            </DialogTitle>
            <DialogDescription>
              {t('stopwatch_settings_desc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="break-reminders-stopwatch">
                  {t('break_reminders')}
                </Label>
                <Switch
                  id="break-reminders-stopwatch"
                  checked={stopwatchSettings.enableBreakReminders}
                  onCheckedChange={(checked) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      enableBreakReminders: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={stopwatchSettings.enableBreakReminders}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="eye-breaks-stopwatch">
                  {t('eye_breaks_2020')}
                </Label>
                <Switch
                  id="eye-breaks-stopwatch"
                  checked={stopwatchSettings.enable2020Rule}
                  onCheckedChange={(checked) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      enable2020Rule: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={stopwatchSettings.enable2020Rule}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="movement-reminders-stopwatch">
                  {t('movement_reminders')}
                </Label>
                <Switch
                  id="movement-reminders-stopwatch"
                  checked={stopwatchSettings.enableMovementReminder}
                  onCheckedChange={(checked) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      enableMovementReminder: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={stopwatchSettings.enableMovementReminder}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="productivity-insights">
                  {t('productivity_insights')}
                </Label>
                <Switch
                  id="productivity-insights"
                  checked={stopwatchSettings.showProductivityInsights}
                  onCheckedChange={(checked) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      showProductivityInsights: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={stopwatchSettings.showProductivityInsights}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="enable-notifications-stopwatch">
                  {t('enable_notifications')}
                </Label>
                <Switch
                  id="enable-notifications-stopwatch"
                  checked={stopwatchSettings.enableNotifications}
                  onCheckedChange={(checked) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      enableNotifications: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={stopwatchSettings.enableNotifications}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="session-milestones">
                  {t('session_milestones')}
                </Label>
                <Switch
                  id="session-milestones"
                  checked={stopwatchSettings.enableSessionMilestones}
                  onCheckedChange={(checked) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      enableSessionMilestones: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={stopwatchSettings.enableSessionMilestones}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="completion-sound-stopwatch">
                  {t('completion_sound')}
                </Label>
                <Switch
                  id="completion-sound-stopwatch"
                  checked={stopwatchSettings.playCompletionSound}
                  onCheckedChange={(checked) =>
                    setStopwatchSettings((prev) => ({
                      ...prev,
                      playCompletionSound: checked,
                    }))
                  }
                  role="switch"
                  aria-checked={stopwatchSettings.playCompletionSound}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setStopwatchSettings(DEFAULT_STOPWATCH_SETTINGS)}
                className="flex-1"
              >
                {t('reset_defaults')}
              </Button>
              <Button
                onClick={() => setShowStopwatchSettings(false)}
                className="flex-1"
              >
                {t('save_settings')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Card
        className={cn(
          'relative transition-all duration-300',
          isDraggingTask &&
            'bg-blue-50/30 shadow-blue-500/20 shadow-lg ring-2 ring-blue-500/50 dark:bg-blue-950/20'
        )}
      >
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('time_tracker')}
            </div>
            {/* Timer Mode Selector */}
            <div className="flex items-center gap-2">
              <Tabs
                value={timerMode}
                onValueChange={(value) =>
                  handleTimerModeChange(value as TimerMode)
                }
                className="w-auto"
              >
                <TabsList className="grid h-8 grid-cols-3 bg-muted/50 p-1">
                  {TIMER_MODE_TABS.map((tab) => {
                    const IconComponent = tab.icon;
                    return (
                      <TabsTrigger
                        key={tab.value}
                        value={tab.value}
                        disabled={sessionProtection.isActive}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 text-xs',
                          sessionProtection.isActive &&
                            'cursor-not-allowed opacity-50',
                          'data-[state=active]:bg-background data-[state=active]:shadow-sm'
                        )}
                        title={
                          sessionProtection.isActive
                            ? t('settings_locked_active_session')
                            : tab.label
                        }
                      >
                        <IconComponent className="h-3 w-3" />
                        {tab.label}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>
              {timerMode === TimerMode.stopwatch && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (sessionProtection.isActive) {
                      toast.error(t('cannot_modify_settings_active_session'), {
                        description: t('stop_or_pause_first'),
                        duration: 3000,
                      });
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
                      ? t('settings_locked_active_session')
                      : t('stopwatch_settings')
                  }
                  disabled={sessionProtection.isActive}
                >
                  <Settings className="h-3 w-3 text-muted-foreground" />
                </Button>
              )}
              {timerMode === TimerMode.pomodoro && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (sessionProtection.isActive) {
                      toast.error(t('cannot_modify_settings_active_session'), {
                        description: t('stop_or_pause_first'),
                        duration: 3000,
                      });
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
                      ? t('settings_locked_active_session')
                      : t('pomodoro_settings')
                  }
                  disabled={sessionProtection.isActive}
                >
                  <Settings className="h-3 w-3 text-muted-foreground" />
                </Button>
              )}
              {timerMode === TimerMode.custom && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (sessionProtection.isActive) {
                      toast.error(t('cannot_modify_settings_active_session'), {
                        description: t('stop_or_pause_first'),
                        duration: 3000,
                      });
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
                      ? t('settings_locked_active_session')
                      : t('custom_timer_settings')
                  }
                  disabled={sessionProtection.isActive}
                >
                  <Settings className="h-3 w-3 text-muted-foreground" />
                </Button>
              )}
            </div>
          </CardTitle>
          <div className="space-y-1 text-muted-foreground text-sm">
            <span>
              {timerMode === TimerMode.stopwatch && t('stopwatch_description')}
              {timerMode === TimerMode.pomodoro &&
                t('pomodoro_description', {
                  focusTime: pomodoroSettings.focusTime,
                  shortBreakTime: pomodoroSettings.shortBreakTime,
                })}
              {timerMode === TimerMode.custom &&
                customTimerSettings.type === 'enhanced-stopwatch' &&
                t('enhanced_stopwatch_description', {
                  targetDuration: (customTimerSettings.targetDuration ||
                    60) as number,
                  intervalFrequency: (customTimerSettings.intervalFrequency ||
                    25) as number,
                })}
              {timerMode === TimerMode.custom &&
                customTimerSettings.type === 'traditional-countdown' &&
                t('traditional_countdown_description', {
                  countdownDuration: (customTimerSettings.countdownDuration ||
                    25) as number,
                })}
            </span>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-1.5 py-0.5">
                {modKey} + Enter
              </span>
              to {t('start_stop')}
              <span className="rounded bg-muted px-1.5 py-0.5">
                {modKey} + P
              </span>
              to {t('pause_resume')}
              <span className="rounded bg-muted px-1.5 py-0.5">
                {modKey} + T
              </span>
              {t('for_tasks')}
              <span className="rounded bg-muted px-1.5 py-0.5">
                {modKey} + M
              </span>
              {t('to_switch_mode')}
              <span className="rounded bg-muted px-1.5 py-0.5">Space</span>
              {t('to_start')}
              <span className="rounded bg-muted px-1.5 py-0.5">↑↓</span>
              {t('to_navigate')}
            </div>
          </div>
        </CardHeader>

        {/* Custom Timer Configuration - Prominently Displayed */}
        {timerMode === TimerMode.custom && (
          <div className="mx-6 mb-4 space-y-4 rounded-lg border border-border/60 bg-card/30 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/20">
                  {customTimerSettings.type === 'enhanced-stopwatch' ? (
                    <Timer className="h-5 w-5" />
                  ) : (
                    <ClockFading className="h-5 w-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-medium text-sm">
                    {customTimerSettings.type === 'enhanced-stopwatch'
                      ? t('enhanced_stopwatch')
                      : t('traditional_countdown')}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {customTimerSettings.type === 'enhanced-stopwatch'
                      ? t('enhanced_stopwatch_desc')
                      : t('traditional_countdown_desc')}
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
                    toast.error(t('cannot_switch_timer_types_active_session'), {
                      description: t('stop_or_pause_first'),
                      duration: 3000,
                    });
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
                    ? t('type_switching_locked_active_session')
                    : t('enhanced_stopwatch')
                }
              >
                <Timer className="h-5 w-5" /> {t('stopwatch')}
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
                    toast.error(t('cannot_switch_timer_types_active_session'), {
                      description: t('stop_or_pause_first'),
                      duration: 3000,
                    });
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
                    ? t('type_switching_locked_active_session')
                    : t('traditional_countdown')
                }
              >
                <ClockFading className="h-5 w-5" /> {t('countdown')}
              </Button>
            </div>

            {/* Essential Settings Only - Interval Breaks for Enhanced Stopwatch */}
            {customTimerSettings.type === 'enhanced-stopwatch' && (
              <div className="rounded-md bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <Label
                    htmlFor="enable-interval-breaks"
                    className="text-muted-foreground text-xs"
                  >
                    Interval {t('breaks')}:
                  </Label>
                  <div className="flex items-center gap-2">
                    {customTimerSettings.enableIntervalBreaks && (
                      <span className="text-muted-foreground text-xs">
                        {t('every')} {customTimerSettings.intervalFrequency}min
                      </span>
                    )}
                    <Switch
                      id="enable-interval-breaks"
                      checked={customTimerSettings.enableIntervalBreaks}
                      onCheckedChange={(checked) => {
                        if (sessionProtection.isActive) {
                          toast.error(
                            t('cannot_modify_break_settings_active_session'),
                            {
                              description: t('stop_or_pause_first'),
                              duration: 3000,
                            }
                          );
                          return;
                        }
                        setCustomTimerSettings((prev) => ({
                          ...prev,
                          enableIntervalBreaks: checked,
                        }));
                      }}
                      disabled={sessionProtection.isActive}
                      role="switch"
                      aria-checked={customTimerSettings.enableIntervalBreaks}
                      title={
                        sessionProtection.isActive
                          ? t('settings_locked_active_session')
                          : t('enable_interval_breaks')
                      }
                    />
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
                  timerMode === TimerMode.pomodoro &&
                    countdownState.sessionType === 'focus'
                    ? 'bg-linear-to-br from-green-50 to-emerald-100 dark:from-green-950/20 dark:to-emerald-900/20'
                    : timerMode === TimerMode.pomodoro &&
                        countdownState.sessionType !== 'focus'
                      ? 'bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20'
                      : timerMode === TimerMode.custom
                        ? 'bg-linear-to-br from-purple-50 to-purple-100 dark:from-purple-950/20 dark:to-purple-900/20'
                        : 'bg-linear-to-br from-red-50 to-red-100 dark:from-red-950/20 dark:to-red-900/20'
                )}
              >
                <div
                  className={cn(
                    'absolute inset-0 animate-pulse bg-linear-to-r opacity-30',
                    timerMode === TimerMode.pomodoro &&
                      countdownState.sessionType === 'focus'
                      ? 'from-green-500/10 to-transparent'
                      : timerMode === TimerMode.pomodoro &&
                          countdownState.sessionType !== 'focus'
                        ? 'from-blue-500/10 to-transparent'
                        : timerMode === TimerMode.custom
                          ? 'from-purple-500/10 to-transparent'
                          : 'from-red-500/10 to-transparent'
                  )}
                ></div>
                <div className="relative">
                  <div
                    className={cn(
                      'font-bold font-mono text-4xl transition-all duration-300',
                      timerMode === TimerMode.pomodoro &&
                        countdownState.sessionType === 'focus'
                        ? 'text-green-600 dark:text-green-400'
                        : timerMode === TimerMode.pomodoro &&
                            countdownState.sessionType !== 'focus'
                          ? 'text-blue-600 dark:text-blue-400'
                          : timerMode === TimerMode.custom
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-red-600 dark:text-red-400'
                    )}
                  >
                    {timerMode === TimerMode.pomodoro ||
                    (timerMode === TimerMode.custom &&
                      customTimerSettings.type === 'traditional-countdown')
                      ? formatTime(countdownState.remainingTime)
                      : formatTime(localElapsedTime)}
                  </div>

                  {/* Pomodoro Progress Indicator */}
                  {timerMode === TimerMode.pomodoro && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <span className="flex items-center justify-center gap-2 font-medium">
                          {countdownState.sessionType === 'focus' ? (
                            <>
                              <Icon iconNode={fruit} className="h-4 w-4" />
                              {t('focus_label')}{' '}
                              {countdownState.pomodoroSession}
                            </>
                          ) : countdownState.sessionType === 'short-break' ? (
                            <>
                              <Coffee className="h-4 w-4" />
                              {t('short_break_label')}
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4" />
                              {t('long_break_label')}
                            </>
                          )}
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
                          : timerMode === TimerMode.custom
                            ? 'text-purple-600/70 dark:text-purple-400/70'
                            : 'text-red-600/70 dark:text-red-400/70'
                    )}
                  >
                    <div
                      className={cn(
                        'h-2 w-2 animate-pulse rounded-full',
                        timerMode === TimerMode.pomodoro &&
                          countdownState.sessionType === 'focus'
                          ? 'bg-green-500'
                          : timerMode === TimerMode.pomodoro &&
                              countdownState.sessionType !== 'focus'
                            ? 'bg-blue-500'
                            : timerMode === TimerMode.custom
                              ? 'bg-purple-500'
                              : 'bg-red-500'
                      )}
                    ></div>
                    {timerMode === TimerMode.pomodoro ? (
                      <span>
                        {countdownState.remainingTime > 0
                          ? `${Math.floor(countdownState.remainingTime / 60)}:${(countdownState.remainingTime % 60).toString().padStart(2, '0')} ${t('remaining')}`
                          : t('session_complete')}
                      </span>
                    ) : timerMode === TimerMode.custom ? (
                      <span className="flex items-center justify-center gap-1">
                        {customTimerSettings.type ===
                        'traditional-countdown' ? (
                          countdownState.remainingTime > 0 ? (
                            <>
                              <Timer className="h-3 w-3" />
                              {`${Math.floor(countdownState.remainingTime / 60)}:${(countdownState.remainingTime % 60).toString().padStart(2, '0')} ${t('remaining')}`}
                            </>
                          ) : (
                            t('countdown_complete')
                          )
                        ) : customTimerSettings.type ===
                          'enhanced-stopwatch' ? (
                          hasReachedTarget ? (
                            <>
                              <Sparkles className="h-3 w-3" />
                              {`${t('target_achieved')} (${customTimerSettings.targetDuration || 60}min)`}
                            </>
                          ) : (
                            <>
                              <Timer className="h-3 w-3" />
                              {`${t('enhanced_stopwatch')} ${customTimerSettings.targetDuration ? `(target: ${customTimerSettings.targetDuration}min)` : ''}`}
                            </>
                          )
                        ) : (
                          <>
                            <Timer className="h-3 w-3" />
                            {t('custom_timer')}
                          </>
                        )}
                      </span>
                    ) : (
                      <>
                        {t('started_at')}{' '}
                        {new Date(
                          currentSession.start_time
                        ).toLocaleTimeString()}
                        {elapsedTime > 1800 && (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 text-xs dark:bg-red-900/30 dark:text-red-300">
                            {elapsedTime > 3600
                              ? t('long_session')
                              : t('deep_work')}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-left">
                <h3 className="font-medium text-lg">{currentSession.title}</h3>
                {currentSession.description && (
                  <p className="mt-1 text-muted-foreground text-sm">
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
                      <div className="flex items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-linear-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                        <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                        <span className="font-medium text-dynamic-blue text-sm">
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
                      <div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
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
                      <span className="font-medium text-green-800 text-sm dark:text-green-200">
                        {t('session_insights')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-green-700 text-xs dark:text-green-300">
                      <div>
                        <span className="font-medium">{t('duration')}:</span>
                        <span className="ml-1">
                          {elapsedTime < 1500
                            ? t('warming_up')
                            : elapsedTime < 3600
                              ? t('focused_session')
                              : t('deep_work_zone')}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium">
                          {t('productivity')}:
                        </span>
                        <span className="ml-1">
                          {elapsedTime < 900
                            ? t('getting_started')
                            : elapsedTime < 2700
                              ? t('in_the_flow')
                              : t('exceptional_focus')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Enhanced Control Buttons */}
                <div className="flex gap-3">
                  <Button
                    onClick={handlePauseWithBreakType}
                    disabled={isLoading}
                    variant="outline"
                    className="flex-1 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300 dark:hover:bg-amber-950/40"
                  >
                    <Pause className="mr-2 h-4 w-4" />
                    {t('take_break')}
                  </Button>
                  <Button
                    onClick={stopTimer}
                    disabled={isLoading}
                    variant="destructive"
                    className="flex-1"
                  >
                    <Square className="mr-2 h-4 w-4" />
                    {t('complete')}
                  </Button>
                </div>

                {/* Quick Actions during session */}
                <div className="flex justify-center gap-2 text-muted-foreground text-xs">
                  <span className="rounded bg-muted px-2 py-1">
                    {modKey} + P
                  </span>
                  <span>{t('for_break')}</span>
                  <span className="rounded bg-muted px-2 py-1">
                    {modKey} + Enter
                  </span>
                  <span>{t('to_complete')}</span>
                </div>
              </div>
            </div>
          ) : pausedSession ? (
            /* Paused Session Display */
            <div className="space-y-6 text-center">
              <div className="relative overflow-hidden rounded-lg bg-linear-to-br from-amber-50 to-amber-100 p-6 dark:from-amber-950/20 dark:to-amber-900/20">
                <div className="absolute inset-0 bg-linear-to-r from-amber-500/5 to-transparent"></div>
                <div className="relative">
                  {/* Break Type Badge - Prominent Display */}
                  {currentBreak && (
                    <div className="mb-4 flex items-center justify-center gap-2">
                      <Badge className="bg-amber-600 px-3 py-1.5 text-base text-white hover:bg-amber-700">
                        {currentBreak.break_type?.icon &&
                          renderBreakTypeIcon(currentBreak.break_type.icon)}
                        {currentBreak.break_type?.name ||
                          currentBreak.break_type_name ||
                          t('on_break')}
                      </Badge>
                    </div>
                  )}

                  <div className="mb-3 flex items-center justify-center gap-2">
                    <Pause className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    <span className="font-semibold text-amber-700 text-lg dark:text-amber-300">
                      {t('session_paused')}
                    </span>
                  </div>

                  {/* Work Duration */}
                  <div className="mb-2">
                    <div className="mb-1 text-muted-foreground text-xs">
                      {t('work_duration')}
                    </div>
                    <div className="font-bold font-mono text-3xl text-amber-600 dark:text-amber-400">
                      {formatTime(pausedElapsedTime)}
                    </div>
                  </div>

                  {/* Break Duration - Live Counter */}
                  <div className="mt-4 rounded-lg bg-amber-100/50 p-3 dark:bg-amber-950/30">
                    <div className="mb-1 text-amber-700 text-xs dark:text-amber-300">
                      {t('break_duration')}
                    </div>
                    <div className="font-bold font-mono text-2xl text-amber-600 dark:text-amber-400">
                      {formatDuration(breakDurationSeconds)}
                    </div>
                    {pauseStartTime && (
                      <div className="mt-1 text-amber-600/70 text-xs dark:text-amber-400/70">
                        {t('paused_at', {
                          time: pauseStartTime.toLocaleTimeString(),
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Session Info - Read-only during pause */}
              <div className="rounded-lg border border-amber-200/50 bg-white/50 p-4 text-left dark:border-amber-800/50 dark:bg-gray-900/50">
                <h3 className="mb-2 font-medium text-lg">
                  {pausedSession.title}
                </h3>
                {pausedSession.description && (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
                    {getDescriptionText(pausedSession.description)}
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
                      <div className="flex items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-linear-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                        <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                        <span className="font-medium text-dynamic-blue text-sm">
                          {pausedSession.task.name}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Enhanced Resume/Stop buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={() => resumeTimer()}
                  disabled={isLoading}
                  className="flex-1 bg-green-600 text-white hover:bg-green-700"
                >
                  <Play className="mr-2 h-4 w-4" />
                  {t('resume_session')}
                </Button>
                <Button
                  onClick={() => stopTimer()}
                  disabled={isLoading}
                  variant="destructive"
                  className="flex-1"
                >
                  <Square className="mr-2 h-4 w-4" />
                  {t('end_session')}
                </Button>
              </div>

              {/* Quick Break Suggestions */}
              <div className="rounded-lg border border-amber-200/60 bg-amber-50/30 p-4 dark:border-amber-800/60 dark:bg-amber-950/10">
                <p className="mb-2 flex items-center gap-2 font-medium text-amber-800 text-sm dark:text-amber-200">
                  <Sparkles className="h-4 w-4" />
                  {t('break_suggestions')}:
                </p>
                <div className="flex flex-wrap gap-2 text-amber-700 text-xs dark:text-amber-300">
                  <span className="flex items-center gap-1">
                    <Footprints className="h-3 w-3" />
                    {t('short_walk')}
                  </span>
                  <span className="flex items-center gap-1">
                    <CupSoda className="h-3 w-3" />
                    {t('hydrate')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {t('rest_eyes')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    {t('meditation')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Apple className="h-3 w-3" />
                    {t('healthy_snack')}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Session Mode Toggle */}
              <Tabs
                value={sessionMode}
                onValueChange={(v) =>
                  handleSessionModeChange(v as 'task' | 'manual')
                }
              >
                <TabsList className="grid h-full w-full grid-cols-2 bg-muted/50">
                  <TabsTrigger
                    value="task"
                    className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <CheckCircle className="h-4 w-4" />
                    <div className="flex flex-col items-start">
                      <span className="font-medium text-sm">
                        {t('task_based')}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t('select_or_create_task')}
                      </span>
                    </div>
                  </TabsTrigger>
                  <TabsTrigger
                    value="manual"
                    className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    <TableOfContents className="h-4 w-4" />
                    <div className="flex flex-col items-start">
                      <span className="font-medium text-sm">{t('manual')}</span>
                      <span className="text-muted-foreground text-xs">
                        {t('free_form_entry')}
                      </span>
                    </div>
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="task"
                  className="fade-in-50 slide-in-from-bottom-2 animate-in space-y-4 duration-300"
                >
                  <div className="space-y-3">
                    <Label className="font-medium text-sm">
                      {t('select_task_to_track')}
                    </Label>

                    {tasks.length === 0 ? (
                      <div className="mt-2 rounded-lg border-2 border-muted-foreground/25 border-dashed p-4 text-center">
                        <CheckCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="mb-2 font-medium text-muted-foreground text-sm">
                          {t('no_tasks_available')}
                        </p>
                        <p className="mb-3 text-muted-foreground text-xs">
                          {t('create_tasks_instruction')}
                        </p>
                        <Link href={`/${wsId}/tasks/boards`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                          >
                            {t('go_to_tasks_tab')}
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <>
                        {/* Searchable Task Selection */}
                        <div
                          ref={dropdownContainerRef}
                          className="relative"
                          data-task-dropdown
                          onDragEnter={handleDragEnter}
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                        >
                          {/* Display Mode: Show Selected Task */}
                          {selectedTaskId &&
                            selectedTaskId !== 'none' &&
                            !isSearchMode &&
                            (() => {
                              const selectedTask = tasks.find(
                                (t) => t.id === selectedTaskId
                              );
                              return selectedTask ? (
                                <div
                                  className={cn(
                                    'flex min-h-10 cursor-text items-center gap-2 rounded-md border px-3 py-2 transition-all duration-200',
                                    isDragOver
                                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
                                      : isDraggingTask
                                        ? 'border-blue-400/60 bg-blue-50/20 dark:bg-blue-950/10'
                                        : ''
                                  )}
                                  onClick={() => {
                                    setIsSearchMode(true);
                                    setTaskSearchQuery('');
                                    openDropdown();
                                  }}
                                >
                                  <div className="flex h-6 w-6 items-center justify-center rounded border border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/20 to-dynamic-blue/10">
                                    <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                                  </div>
                                  <div className="flex-1 text-left">
                                    <div className="font-medium text-sm">
                                      {selectedTask.name}
                                    </div>
                                    {selectedTask.board_name &&
                                      selectedTask.list_name && (
                                        <div className="mt-1 flex items-center gap-1">
                                          <span className="text-muted-foreground text-xs">
                                            {selectedTask.board_name}
                                          </span>
                                          <span className="text-muted-foreground text-xs">
                                            •
                                          </span>
                                          <span className="text-muted-foreground text-xs">
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
                                        toast.success(
                                          t('task_selection_cleared')
                                        );
                                      }}
                                      className="rounded p-1 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                      title={t('remove_selected_task')}
                                    >
                                      <svg
                                        aria-hidden="true"
                                        className="h-4 w-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
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
                                        aria-hidden="true"
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
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M19 9l-7 7-7-7"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ) : null;
                            })()}

                          {/* Search Mode: Show Input Field */}
                          {(isSearchMode ||
                            !selectedTaskId ||
                            selectedTaskId === 'none') && (
                            <div className="relative">
                              <Input
                                placeholder={
                                  isDragOver
                                    ? t('drop_task_here_to_select')
                                    : isDraggingTask
                                      ? t('drop_here_or_press_esc')
                                      : t('search_tasks_or_create_new')
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
                                  'h-auto min-h-10 pr-10 transition-all duration-200',
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
                                  aria-hidden="true"
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
                                >
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
                            <div
                              ref={dropdownContentRef}
                              className={cn(
                                'absolute right-0 left-0 z-100 rounded-md border bg-popover shadow-lg transition-all duration-200',
                                dropdownPosition === 'above'
                                  ? 'bottom-full mb-1'
                                  : 'top-full mt-1'
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                            >
                              {/* Filter Buttons */}
                              <div className="space-y-2 border-b p-3">
                                <div className="font-medium text-muted-foreground text-xs">
                                  {t('quick_filters')}
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
                                      'flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium text-xs transition-colors',
                                      taskFilters.assignee === 'mine'
                                        ? 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                        : 'border-border bg-background hover:bg-muted'
                                    )}
                                  >
                                    <CheckCircle className="h-3 w-3" />
                                    My {t('tasks')}
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
                                      'flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium text-xs transition-colors',
                                      taskFilters.assignee === 'unassigned'
                                        ? 'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
                                        : 'border-border bg-background hover:bg-muted'
                                    )}
                                  >
                                    <svg
                                      aria-hidden="true"
                                      className="h-3 w-3"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                                      />
                                    </svg>
                                    {t('unassigned')}
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
                                    {t('all_boards')}
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
                                    {t('all_lists')}
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
                                      {t('tasks_count', {
                                        count: filteredTasks.length,
                                        total: tasks.length,
                                      })}
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
                                      {t('clear_filters')}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Task List */}
                              <div className="max-h-75 overflow-y-auto">
                                {filteredTasks.length === 0 ? (
                                  <div className="p-6 text-center text-muted-foreground text-sm">
                                    {taskSearchQuery ||
                                    taskFilters.board !== 'all' ||
                                    taskFilters.list !== 'all' ||
                                    taskFilters.assignee !== 'all' ? (
                                      <>
                                        <div className="mb-2">
                                          {t('no_tasks_found')}
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
                                          className="text-primary text-xs hover:underline"
                                        >
                                          {t('clear_filters_to_see_all')}
                                        </button>
                                      </>
                                    ) : (
                                      t('no_tasks_available')
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
                                              ? 'border-blue-400/50 bg-linear-to-br from-blue-100 to-blue-200 dark:border-blue-600 dark:from-blue-800 dark:to-blue-700'
                                              : 'border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/20 to-dynamic-blue/10'
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
                                                'font-medium text-sm',
                                                task.is_assigned_to_current_user &&
                                                  'text-blue-900 dark:text-blue-100'
                                              )}
                                            >
                                              {task.name}
                                              {task.is_assigned_to_current_user && (
                                                <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800 text-xs dark:bg-blue-900/50 dark:text-blue-200">
                                                  {t('assigned_to_you')}
                                                </span>
                                              )}
                                            </span>
                                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                          </div>
                                          {task.description && (
                                            <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground text-xs">
                                              {getDescriptionText(
                                                task.description
                                              )}
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
                                                        className="h-4 w-4 rounded-full border border-white bg-linear-to-br from-gray-100 to-gray-200 dark:border-gray-800 dark:from-gray-700 dark:to-gray-600"
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
                                                            width={16}
                                                            height={16}
                                                            className="rounded-full object-cover"
                                                          />
                                                        ) : (
                                                          <div className="flex h-full w-full items-center justify-center font-medium text-[8px] text-gray-600 dark:text-gray-300">
                                                            {generateAssigneeInitials(
                                                              assignee
                                                            )}
                                                          </div>
                                                        )}
                                                      </div>
                                                    ))}
                                                  {task.assignees.length >
                                                    3 && (
                                                    <div className="flex h-4 w-4 items-center justify-center rounded-full border border-white bg-gray-200 font-medium text-[8px] text-gray-600 dark:border-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                                      +
                                                      {task.assignees.length -
                                                        3}
                                                    </div>
                                                  )}
                                                </div>
                                                <span className="text-muted-foreground text-xs">
                                                  {task.assignees.length}{' '}
                                                  {t('assigned')}
                                                </span>
                                              </div>
                                            )}

                                          {task.board_name &&
                                            task.list_name && (
                                              <div className="mt-2 flex items-center gap-2">
                                                <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
                                                  <MapPin className="h-3 w-3 text-muted-foreground" />
                                                  <span className="font-medium text-xs">
                                                    {task.board_name}
                                                  </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 rounded-md border border-dynamic-green/20 bg-linear-to-r from-dynamic-green/10 to-dynamic-green/5 px-2 py-1">
                                                  <Tag className="h-3 w-3 text-dynamic-green" />
                                                  <span className="font-medium text-dynamic-green text-xs">
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
                          )}
                        </div>

                        {(selectedTaskId === 'none' || !selectedTaskId) && (
                          <div className="text-center">
                            <p className="text-muted-foreground text-sm">
                              {t('no_task_selected_help')}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="session-description">
                      {t('session_notes_optional')}
                    </Label>
                    <Textarea
                      id="session-description"
                      placeholder={t('add_session_notes')}
                      value={newSessionDescription}
                      onChange={(e) => setNewSessionDescription(e.target.value)}
                      rows={2}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="category-select">
                      {t('category_optional')}
                    </Label>
                    <Select
                      value={selectedCategoryId}
                      onValueChange={setSelectedCategoryId}
                    >
                      <SelectTrigger id="category-select" className="mt-1">
                        <SelectValue placeholder={t('select_category')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('no_category')}</SelectItem>
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
                      ? t('start_timer')
                      : t('create_task_and_start')}
                  </Button>
                </TabsContent>

                <TabsContent
                  value="manual"
                  className="fade-in-50 slide-in-from-bottom-2 animate-in space-y-4 duration-300"
                >
                  <div className="space-y-2">
                    <Label htmlFor="session-title">
                      {t('what_are_you_working_on')}
                    </Label>
                    <Input
                      id="session-title"
                      data-title-input
                      placeholder={t('enter_session_title_placeholder')}
                      value={newSessionTitle}
                      onChange={(e) => handleManualTitleChange(e.target.value)}
                      className="mt-1"
                      autoFocus={sessionMode === 'manual'}
                    />

                    {/* Task suggestion */}
                    {showTaskSuggestion && newSessionTitle.length > 2 && (
                      <div className="rounded-lg border border-dynamic-blue/30 bg-linear-to-r from-dynamic-blue/10 to-dynamic-blue/5 p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            <div className="rounded-full bg-dynamic-blue/20 p-1">
                              <Sparkles className="h-3 w-3 text-dynamic-blue" />
                            </div>
                            <div className="flex-1">
                              <span className="font-medium text-dynamic-blue text-sm">
                                {t('convert_to_task')}
                              </span>
                              <p className="mt-0.5 text-muted-foreground text-xs">
                                {t('create_task_description', {
                                  title: newSessionTitle,
                                })}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={createTaskFromManualSession}
                            className="h-8 border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs hover:bg-dynamic-blue/20"
                          >
                            {t('create_task')}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Show selected task info */}
                    {selectedTaskId &&
                      selectedTaskId !== 'none' &&
                      !showTaskSuggestion && (
                        <div className="rounded-lg border border-dynamic-green/30 bg-linear-to-r from-dynamic-green/5 to-dynamic-green/3 p-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dynamic-green/30 bg-linear-to-br from-dynamic-green/20 to-dynamic-green/10">
                              <CheckCircle className="h-5 w-5 text-dynamic-green" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-dynamic-green text-sm">
                                    {t('task_linked_successfully')}
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
                                  className="h-7 px-2 text-muted-foreground text-xs hover:text-foreground"
                                >
                                  {t('unlink')}
                                </Button>
                              </div>
                              {(() => {
                                const selectedTask = tasks.find(
                                  (t) => t.id === selectedTaskId
                                );
                                return selectedTask ? (
                                  <div className="mt-2 space-y-2">
                                    <p className="font-medium text-foreground text-sm">
                                      {selectedTask.name}
                                    </p>
                                    {selectedTask.description && (
                                      <p className="line-clamp-2 text-muted-foreground text-xs">
                                        {selectedTask.description}
                                      </p>
                                    )}
                                    {selectedTask.board_name &&
                                      selectedTask.list_name && (
                                        <div className="flex items-center gap-2">
                                          <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
                                            <MapPin className="h-3 w-3 text-muted-foreground" />
                                            <span className="font-medium text-xs">
                                              {selectedTask.board_name}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1.5 rounded-md border border-dynamic-green/20 bg-linear-to-r from-dynamic-green/10 to-dynamic-green/5 px-2 py-1">
                                            <Tag className="h-3 w-3 text-dynamic-green" />
                                            <span className="font-medium text-dynamic-green text-xs">
                                              {selectedTask.list_name}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    <p className="text-dynamic-green/80 text-xs">
                                      {t('time_auto_tracked')}
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
                      {t('description_optional')}
                    </Label>
                    <Textarea
                      id="session-description"
                      placeholder={t('add_description')}
                      value={newSessionDescription}
                      onChange={(e) => setNewSessionDescription(e.target.value)}
                      rows={3}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="category-select">
                      {t('category_optional')}
                    </Label>
                    <Select
                      value={selectedCategoryId}
                      onValueChange={setSelectedCategoryId}
                    >
                      <SelectTrigger id="category-select" className="mt-1">
                        <SelectValue placeholder={t('select_category')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('no_category')}</SelectItem>
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
                    {t('start_timer')}
                  </Button>
                </TabsContent>
              </Tabs>

              {/* Quick Start Templates */}
              {templates.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-muted-foreground text-sm">
                    {t('quick_start')}:
                  </Label>
                  <div className="mt-1 space-y-2">
                    {templates.slice(0, 3).map((template) => (
                      <Button
                        key={template.title}
                        variant="outline"
                        size="sm"
                        onClick={() => startFromTemplate(template)}
                        className="h-auto min-h-8 w-full justify-start p-2 text-sm"
                      >
                        <div className="flex w-full min-w-0 items-center">
                          <Copy className="mr-2 h-3 w-3 shrink-0" />
                          <span className="flex-1 truncate text-left">
                            {template.title}
                          </span>
                          <Badge
                            variant="secondary"
                            className="ml-2 shrink-0 text-xs"
                          >
                            {template.usage_count}×
                          </Badge>
                        </div>
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
          <div className="fade-in absolute inset-0 z-50 flex animate-in items-center justify-center rounded-lg bg-black/20 backdrop-blur-sm duration-300">
            <div className="zoom-in animate-in rounded-lg border bg-background p-6 shadow-xl duration-300">
              <div className="text-center">
                <CheckCircle className="mx-auto mb-4 h-12 w-12 animate-pulse text-green-500" />
                <h3 className="mb-2 font-semibold text-lg">
                  {t('session_completed', {
                    duration: formatDuration(
                      justCompleted.duration_seconds || 0
                    ),
                  })}
                </h3>
                <p className="mb-1 text-muted-foreground">
                  {justCompleted.title}
                </p>
                <p className="font-medium text-green-600 text-sm">
                  {t('duration_tracked', {
                    duration: formatDuration(
                      justCompleted.duration_seconds || 0
                    ),
                  })}
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Task Creation Dialog */}
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

      {/* Exceeded Threshold Session Dialog */}
      {(currentSession || pausedSession) && chainSummary && (
        <MissedEntryDialog
          mode="exceeded-session-chain"
          open={showExceededThresholdDialog}
          onOpenChange={setShowExceededThresholdDialog}
          session={(currentSession || pausedSession)!}
          categories={categories}
          wsId={wsId}
          workspace={workspace}
          thresholdDays={thresholdData?.threshold ?? null}
          chainSummary={chainSummary}
          onSessionDiscarded={handleSessionDiscarded}
          onMissedEntryCreated={handleMissedEntryCreated}
          breakTypeId={pendingBreakTypeId || undefined}
          breakTypeName={pendingBreakTypeName || undefined}
        />
      )}

      {(currentSession || pausedSession) && !chainSummary && (
        <MissedEntryDialog
          mode="exceeded-session"
          open={showExceededThresholdDialog}
          onOpenChange={setShowExceededThresholdDialog}
          session={(currentSession || pausedSession)!}
          categories={categories}
          wsId={wsId}
          workspace={workspace}
          thresholdDays={thresholdData?.threshold ?? null}
          onSessionDiscarded={handleSessionDiscarded}
          onMissedEntryCreated={handleMissedEntryCreated}
          breakTypeId={pendingBreakTypeId || undefined}
          breakTypeName={pendingBreakTypeName || undefined}
        />
      )}

      {/* Break Type Selection Dialog */}
      <Dialog open={showBreakTypeDialog} onOpenChange={setShowBreakTypeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coffee className="h-5 w-5 text-amber-600" />
              {t('break_type.title')}
            </DialogTitle>
            <DialogDescription>{t('break_type.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Custom Break Types */}
            {(breakTypes || []).length > 0 && (
              <div className="space-y-2">
                <Label className="text-muted-foreground text-xs">
                  {t('break_type.custom_types')}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {(breakTypes || []).map((breakType) => (
                    <Button
                      key={breakType.id}
                      variant={
                        selectedBreakTypeId === breakType.id
                          ? 'default'
                          : 'outline'
                      }
                      className={cn(
                        'justify-start',
                        selectedBreakTypeId === breakType.id &&
                          'bg-amber-600 hover:bg-amber-700'
                      )}
                      onClick={() => {
                        setSelectedBreakTypeId(breakType.id);
                        setCustomBreakTypeName('');
                      }}
                    >
                      {renderBreakTypeIcon(breakType.icon)}
                      {breakType.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Break Name Input */}
            <div className="space-y-2">
              <Label htmlFor="custom-break-name">
                {t('break_type.custom_name')}
              </Label>
              <Input
                id="custom-break-name"
                placeholder={t('break_type.custom_placeholder')}
                value={customBreakTypeName}
                onChange={(e) => {
                  setCustomBreakTypeName(e.target.value);
                  if (e.target.value.trim()) {
                    setSelectedBreakTypeId(''); // Clear selected type if custom name entered
                  }
                }}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowBreakTypeDialog(false)}
                className="flex-1"
              >
                {t('break_type.cancel')}
              </Button>
              <Button
                onClick={handleBreakTypeSelected}
                disabled={!selectedBreakTypeId && !customBreakTypeName.trim()}
                className="flex-1 bg-amber-600 hover:bg-amber-700"
              >
                <Pause className="mr-2 h-4 w-4" />
                {t('break_type.start_break')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
