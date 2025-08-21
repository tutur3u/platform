'use client';

import type { TimeTrackingCategory } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Clock, RefreshCw } from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TimerControls } from './components/timer-controls';
import { UserSelector } from './components/user-selector';
import { useCurrentUser } from './hooks/use-current-user';
import type { ExtendedWorkspaceTask, SessionWithRelations } from './types';

export default function TimeTrackerContent() {
  const params = useParams();
  const wsId = params.wsId as string;

  const { userId: currentUserId, isLoading: isLoadingUser } = useCurrentUser();

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const [categories, setCategories] = useState<TimeTrackingCategory[]>([]);
  const [tasks, setTasks] = useState<ExtendedWorkspaceTask[]>([]);

  const [currentSession, setCurrentSession] =
    useState<SessionWithRelations | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes
        .toString()
        .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }, []);

  const formatDuration = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }, []);

  // API helper
  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
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

  const fetchData = useCallback(async () => {
    if (!wsId || !currentUserId) return;
    setIsLoading(true);
    try {
      const [categoriesRes, runningRes, tasksRes] = await Promise.all([
        apiCall(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
        apiCall(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running${
            selectedUserId ? `&userId=${selectedUserId}` : ''
          }`
        ),
        apiCall(`/api/v1/workspaces/${wsId}/tasks?limit=100`),
      ]);

      if (!isMountedRef.current) return;
      setCategories(categoriesRes.categories || []);
      setTasks(tasksRes.tasks || []);

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
      console.error('Failed to load time tracker data:', error);
      toast.error('Failed to load timer data');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [wsId, currentUserId, selectedUserId, apiCall]);

  // Load on mount and when selection changes
  useEffect(() => {
    if (currentUserId) fetchData();
  }, [currentUserId, fetchData]);

  if (isLoadingUser || !currentUserId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-muted-foreground text-sm">
            Loading timer...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', isLoading && 'opacity-95')}>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
            <Clock className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
              Time Tracker
            </h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Track your time with detailed analytics
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <UserSelector
            wsId={wsId}
            selectedUserId={selectedUserId}
            onUserChange={setSelectedUserId}
            currentUserId={currentUserId}
            apiCall={apiCall}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Timer Only */}
      <Card className="p-0">
        <div className="p-4">
          <TimerControls
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
            currentUserId={currentUserId}
          />
        </div>
      </Card>
    </div>
  );
}
