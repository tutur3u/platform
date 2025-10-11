'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Pause, Play, Square, Timer } from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { useCallback, useEffect, useState } from 'react';
import type { ExtendedWorkspaceTask, SessionWithRelations } from '../types';

interface SimpleTimerControlsProps {
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
  apiCall: (
    url: string,
    options?: RequestInit
  ) => Promise<{ session?: SessionWithRelations; [key: string]: unknown }>;
  currentUserId?: string;
}

export function SimpleTimerControls({
  wsId,
  currentSession,
  setCurrentSession,
  elapsedTime,
  setElapsedTime,
  isRunning,
  setIsRunning,
  categories,
  onSessionUpdate,
  formatTime,
  formatDuration,
  apiCall,
}: SimpleTimerControlsProps) {
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('none');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('none');
  const [justCompleted, setJustCompleted] =
    useState<SessionWithRelations | null>(null);

  // Paused session state
  const [pausedSession, setPausedSession] =
    useState<SessionWithRelations | null>(null);
  const [pausedElapsedTime, setPausedElapsedTime] = useState(0);

  // Auto-suggest work category
  const workCategory = categories.find(
    (cat) =>
      cat.name.toLowerCase().includes('work') ||
      cat.name.toLowerCase().includes('development')
  );

  // Auto-focus and clear form when switching modes
  useEffect(() => {
    if (!currentSession && !pausedSession) {
      setSessionTitle('');
      setSessionDescription('');
      setSelectedTaskId('none');
      setSelectedCategoryId(workCategory?.id || 'none');
    }
  }, [currentSession, pausedSession, workCategory]);

  // Start timer
  const startTimer = useCallback(async () => {
    if (!sessionTitle.trim()) {
      toast.error("Please enter what you're working on");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: sessionTitle,
            description: sessionDescription || null,
            categoryId:
              selectedCategoryId === 'none' ? null : selectedCategoryId,
            taskId: selectedTaskId === 'none' ? null : selectedTaskId,
          }),
        }
      );

      setCurrentSession(response.session || null);
      setIsRunning(true);
      setElapsedTime(0);

      // Invalidate the running session query to update sidebar
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });

      onSessionUpdate();
      toast.success('Timer started!');
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error('Failed to start timer');
    } finally {
      setIsLoading(false);
    }
  }, [
    sessionTitle,
    sessionDescription,
    selectedCategoryId,
    selectedTaskId,
    apiCall,
    wsId,
    queryClient,
    setCurrentSession,
    setIsRunning,
    setElapsedTime,
    onSessionUpdate,
  ]);

  // Stop timer
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

      setJustCompleted(response.session || null);
      setCurrentSession(null);
      setPausedSession(null);
      setIsRunning(false);
      setElapsedTime(0);
      setPausedElapsedTime(0);

      // Clear form for next session
      setSessionTitle('');
      setSessionDescription('');
      setSelectedTaskId('none');
      setSelectedCategoryId(workCategory?.id || 'none');

      setTimeout(() => setJustCompleted(null), 3000);

      // Invalidate the running session query to update sidebar
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });

      onSessionUpdate();

      toast.success(
        `Session completed! Tracked ${formatDuration(response.session?.duration_seconds || 0)}`
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
    queryClient,
    workCategory,
    onSessionUpdate,
    formatDuration,
    setCurrentSession,
    setElapsedTime,
    setIsRunning,
  ]);

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

      setPausedSession(currentSession);
      setPausedElapsedTime(elapsedTime);
      setCurrentSession(null);
      setIsRunning(false);
      setElapsedTime(0);

      onSessionUpdate();
      toast.success('Timer paused');
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
    elapsedTime,
    onSessionUpdate,
    setCurrentSession,
    setElapsedTime,
    setIsRunning,
  ]);

  // Resume timer
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

      setCurrentSession(response.session || pausedSession);
      setElapsedTime(pausedElapsedTime);
      setIsRunning(true);
      setPausedSession(null);
      setPausedElapsedTime(0);

      // Invalidate the running session query to update sidebar
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId],
      });

      onSessionUpdate();
      toast.success('Timer resumed!');
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
    queryClient,
    pausedElapsedTime,
    onSessionUpdate,
    setCurrentSession,
    setElapsedTime,
    setIsRunning,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (isRunning) {
          stopTimer();
        } else if (pausedSession) {
          resumeTimer();
        } else if (sessionTitle.trim()) {
          startTimer();
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
        event.preventDefault();
        if (isRunning) {
          pauseTimer();
        } else if (pausedSession) {
          resumeTimer();
        }
      }

      if (event.key === ' ' && !isRunning && sessionTitle.trim()) {
        event.preventDefault();
        startTimer();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isRunning,
    sessionTitle,
    startTimer,
    stopTimer,
    pauseTimer,
    resumeTimer,
    pausedSession,
  ]);

  return (
    <Card className="relative">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="h-5 w-5" />
          Simple Timer
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {currentSession ? (
          // Active timer display
          <div className="space-y-6 text-center">
            <div className="rounded-lg bg-gradient-to-br from-green-50 to-emerald-100 p-6 dark:from-green-950/20 dark:to-emerald-900/20">
              <div className="font-bold font-mono text-4xl text-green-600 dark:text-green-400">
                {formatTime(elapsedTime)}
              </div>
              <div className="mt-2 flex items-center justify-center gap-2 text-green-600/70 text-sm dark:text-green-400/70">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                Recording time
              </div>
            </div>

            <div className="text-left">
              <h3 className="font-medium text-lg">{currentSession.title}</h3>
              {currentSession.description && (
                <p className="mt-1 text-muted-foreground text-sm">
                  {currentSession.description}
                </p>
              )}
              {currentSession.category && (
                <div className="mt-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-blue-700 text-sm dark:bg-blue-900/30 dark:text-blue-300">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                    {currentSession.category.name}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={pauseTimer}
                disabled={isLoading}
                variant="outline"
                className="flex-1"
              >
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </Button>
              <Button
                onClick={stopTimer}
                disabled={isLoading}
                variant="destructive"
                className="flex-1"
              >
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            </div>
          </div>
        ) : pausedSession ? (
          // Paused timer display
          <div className="space-y-6 text-center">
            <div className="rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 p-6 dark:from-amber-950/20 dark:to-amber-900/20">
              <div className="mb-3 flex items-center justify-center gap-2">
                <Pause className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <span className="font-semibold text-amber-700 text-lg dark:text-amber-300">
                  Paused
                </span>
              </div>
              <div className="font-bold font-mono text-3xl text-amber-600 dark:text-amber-400">
                {formatTime(pausedElapsedTime)}
              </div>
            </div>

            <div className="text-left">
              <h3 className="font-medium text-lg">{pausedSession.title}</h3>
              {pausedSession.description && (
                <p className="mt-1 text-muted-foreground text-sm">
                  {pausedSession.description}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={resumeTimer}
                disabled={isLoading}
                className="flex-1 bg-green-600 text-white hover:bg-green-700"
              >
                <Play className="mr-2 h-4 w-4" />
                Resume
              </Button>
              <Button
                onClick={stopTimer}
                disabled={isLoading}
                variant="destructive"
                className="flex-1"
              >
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            </div>
          </div>
        ) : (
          // Start new timer
          <div className="space-y-4">
            <div>
              <Label htmlFor="session-title" className="font-medium text-sm">
                What are you working on?
              </Label>
              <Input
                id="session-title"
                placeholder="Enter what you're working on..."
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="session-description" className="text-sm">
                  Description
                </Label>
                <Textarea
                  id="session-description"
                  placeholder="Add notes about this session..."
                  value={sessionDescription}
                  onChange={(e) => setSessionDescription(e.target.value)}
                  rows={2}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="category-select" className="text-sm">
                  Category
                </Label>
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
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={startTimer}
              disabled={!sessionTitle.trim() || isLoading}
              className="w-full"
              size="lg"
            >
              <Play className="mr-2 h-5 w-5" />
              Start Timer
            </Button>
          </div>
        )}
      </CardContent>

      {/* Completion celebration */}
      {justCompleted && (
        <div className="fade-in absolute inset-0 z-50 flex animate-in items-center justify-center rounded-lg bg-black/20 backdrop-blur-sm duration-300">
          <div className="zoom-in animate-in rounded-lg border bg-background p-6 shadow-xl duration-300">
            <div className="text-center">
              <CheckCircle className="mx-auto mb-4 h-12 w-12 animate-pulse text-green-500" />
              <h3 className="mb-2 font-semibold text-lg">Well done! 🎉</h3>
              <p className="mb-1 text-muted-foreground">
                {justCompleted.title}
              </p>
              <p className="font-medium text-green-600 text-sm">
                {formatDuration(justCompleted.duration_seconds || 0)} completed
              </p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
