'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock, Timer, TrendingUp } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useCallback, useEffect, useState } from 'react';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
  TimeTrackerData,
} from '../types';
import { SimpleTimerControls } from './simple-timer-controls';

dayjs.extend(utc);
dayjs.extend(timezone);

interface SimpleTimeTrackerContentProps {
  wsId: string;
  initialData: TimeTrackerData;
}

export default function SimpleTimeTrackerContent({
  wsId,
  initialData,
}: SimpleTimeTrackerContentProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);
      } catch (error) {
        console.error('Error getting current user:', error);
        setCurrentUserId(null);
      }
    };

    getUser();
  }, []);

  // Use React Query for running session to sync with command palette
  const { data: runningSessionFromQuery } = useQuery({
    queryKey: ['running-time-session', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
      );
      if (!response.ok) throw new Error('Failed to fetch running session');
      const data = await response.json();
      return data.session;
    },
    refetchInterval: 30000, // 30 seconds
    initialData: initialData.runningSession,
    enabled: !!currentUserId,
  });

  const [currentSession, setCurrentSession] =
    useState<SessionWithRelations | null>(initialData.runningSession);
  const [categories] = useState(initialData.categories || []);
  const [tasks] = useState<ExtendedWorkspaceTask[]>(initialData.tasks || []);

  // Timer state
  const [elapsedTime, setElapsedTime] = useState(() => {
    if (!initialData.runningSession) return 0;
    const elapsed = Math.floor(
      (Date.now() - new Date(initialData.runningSession.start_time).getTime()) /
        1000
    );
    return Math.max(0, elapsed);
  });
  const [isRunning, setIsRunning] = useState(!!initialData.runningSession);

  // Sync React Query data with local state
  useEffect(() => {
    if (currentUserId && runningSessionFromQuery !== undefined) {
      setCurrentSession(runningSessionFromQuery);
      setIsRunning(!!runningSessionFromQuery);
      if (runningSessionFromQuery) {
        const elapsed = Math.max(
          0,
          Math.floor(
            (Date.now() -
              new Date(runningSessionFromQuery.start_time).getTime()) /
              1000
          )
        );
        setElapsedTime(elapsed);
      } else {
        setElapsedTime(0);
      }
    }
  }, [runningSessionFromQuery, currentUserId]);

  // API call helper
  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      try {
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
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error';
        console.error('API call failed:', message);
        throw new Error(message);
      }
    },
    []
  );

  // Fetch session data
  const fetchData = useCallback(async () => {
    if (!currentUserId) return;

    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
      );

      if (response.session) {
        setCurrentSession(response.session);
        setIsRunning(true);
        const elapsed = Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(response.session.start_time).getTime()) /
              1000
          )
        );
        setElapsedTime(elapsed);
      } else {
        setCurrentSession(null);
        setIsRunning(false);
        setElapsedTime(0);
      }
    } catch (error) {
      console.error('Error fetching session data:', error);
    }
  }, [wsId, apiCall, currentUserId]);

  // Format time helpers
  const formatTime = useCallback((seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const formatDuration = useCallback((seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, []);

  // Timer effect
  useEffect(() => {
    if (isRunning && currentSession) {
      const interval = setInterval(() => {
        const elapsed = Math.max(
          0,
          Math.floor(
            (Date.now() - new Date(currentSession.start_time).getTime()) / 1000
          )
        );
        setElapsedTime(elapsed);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [isRunning, currentSession]);

  // Calculate stats
  const todayStats = initialData.stats || {
    todayTime: 0,
    weekTime: 0,
    monthTime: 0,
    streak: 0,
  };

  if (!currentUserId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-muted-foreground text-sm">
            Loading time tracker...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Timer Controls */}
      <SimpleTimerControls
        wsId={wsId}
        currentSession={currentSession}
        setCurrentSession={setCurrentSession}
        elapsedTime={elapsedTime}
        setElapsedTime={setElapsedTime}
        isRunning={isRunning}
        setIsRunning={setIsRunning}
        categories={categories}
        tasks={tasks}
        onSessionUpdate={fetchData}
        formatTime={formatTime}
        formatDuration={formatDuration}
        apiCall={apiCall}
      />

      {/* Quick Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {formatDuration(todayStats.todayTime)}
            </div>
            <p className="text-muted-foreground text-xs">
              {todayStats.todayTime > 0
                ? 'Great progress!'
                : 'Start your first session'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">This Week</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">
              {formatDuration(todayStats.weekTime)}
            </div>
            <p className="text-muted-foreground text-xs">
              {todayStats.weekTime > 14400
                ? 'Excellent week!'
                : 'Keep going strong'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-sm">Streak</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{todayStats.streak} days</div>
            <p className="text-muted-foreground text-xs">
              {todayStats.streak > 0
                ? 'Keep the momentum!'
                : 'Start your streak today'}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
