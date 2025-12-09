'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { TimeTrackingCategory } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useState } from 'react';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
  TimerStats,
} from '../../../../time-tracker/types';

interface SessionTemplate {
  title: string;
  description?: string;
  category_id?: string;
  task_id?: string;
  usage_count: number;
}

interface UseTimeTrackerProps {
  wsId: string;
  tasks?: ExtendedWorkspaceTask[];
}

interface UseTimeTrackerReturn {
  // State
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  currentSession: SessionWithRelations | null;
  categories: TimeTrackingCategory[];
  recentSessions: SessionWithRelations[];
  templates: SessionTemplate[];
  timerStats: TimerStats;
  elapsedTime: number;
  isRunning: boolean;
  isLoading: boolean;
  justCompleted: SessionWithRelations | null;
  actionStates: Record<string, boolean>;
  activeTab: 'current' | 'recent' | 'history';
  setActiveTab: (tab: 'current' | 'recent' | 'history') => void;

  // Actions
  fetchData: () => Promise<void>;
  startTimer: (params: {
    title: string;
    description?: string;
    categoryId?: string;
    taskId?: string;
  }) => Promise<void>;
  startTimerWithTask: (
    taskId: string,
    taskName: string,
    description?: string,
    categoryId?: string
  ) => Promise<void>;
  stopTimer: () => Promise<void>;
  pauseTimer: () => Promise<void>;
  resumeSession: (session: SessionWithRelations) => Promise<void>;
  clearJustCompleted: () => void;
}

export function useTimeTracker({
  wsId,
  tasks = [],
}: UseTimeTrackerProps): UseTimeTrackerReturn {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [currentSession, setCurrentSession] =
    useState<SessionWithRelations | null>(null);
  const [categories, setCategories] = useState<TimeTrackingCategory[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionWithRelations[]>(
    []
  );
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [timerStats, setTimerStats] = useState<TimerStats>({
    todayTime: 0,
    weekTime: 0,
    monthTime: 0,
    streak: 0,
  });

  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [justCompleted, setJustCompleted] =
    useState<SessionWithRelations | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'current' | 'recent' | 'history'>(
    'current'
  );

  // API call helper
  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    []
  );

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [categoriesRes, runningRes, recentRes, statsRes, templatesRes] =
        await Promise.all([
          apiCall(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
          apiCall(
            `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
          ),
          apiCall(
            `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=recent&limit=20`
          ),
          apiCall(
            `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=stats`
          ),
          apiCall(`/api/v1/workspaces/${wsId}/time-tracking/templates`),
        ]);

      setCategories(categoriesRes.categories || []);
      setRecentSessions(recentRes.sessions || []);
      setTimerStats(statsRes.stats);
      setTemplates(templatesRes.templates || []);

      if (runningRes.session) {
        setCurrentSession(runningRes.session);
        setIsRunning(true);
        const elapsed = Math.floor(
          (Date.now() - new Date(runningRes.session.start_time).getTime()) /
            1000
        );
        setElapsedTime(elapsed);
      } else {
        setCurrentSession(null);
        setIsRunning(false);
        setElapsedTime(0);
      }
    } catch (error) {
      console.error('Error fetching time tracking data:', error);
      toast.error('Failed to load time tracking data');
    }
  }, [wsId, apiCall]);

  // Timer tick effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isRunning && currentSession) {
      interval = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - new Date(currentSession.start_time).getTime()) / 1000
        );
        setElapsedTime(elapsed);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, currentSession]);

  // Load data when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  // Start timer with task
  const startTimerWithTask = useCallback(
    async (
      taskId: string,
      taskName: string,
      description?: string,
      categoryId?: string
    ) => {
      setIsLoading(true);

      try {
        const response = await apiCall(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
          {
            method: 'POST',
            body: JSON.stringify({
              title: `Working on: ${taskName}`,
              description: description || null,
              categoryId: categoryId || null,
              taskId: taskId,
            }),
          }
        );

        setCurrentSession(response.session);
        setIsRunning(true);
        setElapsedTime(0);

        queryClient.invalidateQueries({
          queryKey: ['running-time-session', wsId],
        });
        fetchData();
        toast.success('Timer started!');
      } catch (error) {
        console.error('Error starting timer:', error);
        toast.error('Failed to start timer');
      } finally {
        setIsLoading(false);
      }
    },
    [wsId, queryClient, fetchData, apiCall]
  );

  // Start timer (manual mode)
  const startTimer = useCallback(
    async (params: {
      title: string;
      description?: string;
      categoryId?: string;
      taskId?: string;
    }) => {
      if (!params.title.trim()) {
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
              title: params.title,
              description: params.description || null,
              categoryId: params.categoryId || null,
              taskId: params.taskId || null,
            }),
          }
        );

        setCurrentSession(response.session);
        setIsRunning(true);
        setElapsedTime(0);

        queryClient.invalidateQueries({
          queryKey: ['running-time-session', wsId],
        });
        fetchData();
        toast.success('Timer started!');
      } catch (error) {
        console.error('Error starting timer:', error);
        toast.error('Failed to start timer');
      } finally {
        setIsLoading(false);
      }
    },
    [wsId, queryClient, fetchData, apiCall]
  );

  // Stop timer
  const stopTimer = useCallback(async () => {
    if (!currentSession) return;

    setIsLoading(true);

    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${currentSession.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'stop' }),
        }
      );

      const completedSession = response.session;
      setJustCompleted(completedSession);
      setCurrentSession(null);
      setIsRunning(false);
      setElapsedTime(0);
      setActiveTab('recent');

      setTimeout(() => setJustCompleted(null), 3000);

      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });
      fetchData();

      const duration = completedSession.duration_seconds || 0;
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      toast.success(`Session completed! Tracked ${durationStr}`, {
        duration: 4000,
      });
    } catch (error) {
      console.error('Error stopping timer:', error);
      toast.error('Failed to stop timer');
    } finally {
      setIsLoading(false);
    }
  }, [currentSession, wsId, queryClient, fetchData, apiCall]);

  // Pause timer
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

      setCurrentSession(null);
      setIsRunning(false);
      setElapsedTime(0);
      fetchData();
      toast.success('Timer paused');
    } catch (error) {
      console.error('Error pausing timer:', error);
      toast.error('Failed to pause timer');
    } finally {
      setIsLoading(false);
    }
  }, [currentSession, wsId, fetchData, apiCall]);

  // Resume session
  const resumeSession = useCallback(
    async (session: SessionWithRelations) => {
      setActionStates((prev) => ({ ...prev, [`resume-${session.id}`]: true }));

      try {
        const response = await apiCall(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions/${session.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ action: 'resume' }),
          }
        );

        setCurrentSession(response.session);
        setIsRunning(true);
        setElapsedTime(0);
        setActiveTab('current');

        queryClient.invalidateQueries({
          queryKey: ['running-time-session', wsId],
        });
        fetchData();
        toast.success(`Started new session: "${session.title}"`);
      } catch (error) {
        console.error('Error resuming session:', error);
        toast.error('Failed to start new session');
      } finally {
        setActionStates((prev) => ({
          ...prev,
          [`resume-${session.id}`]: false,
        }));
      }
    },
    [wsId, queryClient, fetchData, apiCall]
  );

  const clearJustCompleted = useCallback(() => {
    setJustCompleted(null);
  }, []);

  return {
    isOpen,
    setIsOpen,
    currentSession,
    categories,
    recentSessions,
    templates,
    timerStats,
    elapsedTime,
    isRunning,
    isLoading,
    justCompleted,
    actionStates,
    activeTab,
    setActiveTab,
    fetchData,
    startTimer,
    startTimerWithTask,
    stopTimer,
    pauseTimer,
    resumeSession,
    clearJustCompleted,
  };
}
