'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Icons from '@tuturuuu/icons';
import {
  CheckCircle,
  Coffee,
  Icon,
  Pause,
  Play,
  Square,
  Timer,
} from '@tuturuuu/icons';
import type { TimeTrackingCategory, Workspace } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
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
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useSessionExceedsThreshold } from '@/hooks/useSessionExceedsThreshold';
import { useWorkspaceTimeThreshold } from '@/hooks/useWorkspaceTimeThreshold';
import { formatDuration, formatTime } from '@/lib/time-format';
import type { SessionWithRelations } from '../types';
import MissedEntryDialog from './missed-entry-dialog';

interface SimpleTimerControlsProps {
  wsId: string;
  currentSession: SessionWithRelations | null;
  elapsedTime: number;
  isRunning: boolean;
  categories: TimeTrackingCategory[];
  apiCall: (
    url: string,
    options?: RequestInit
  ) => Promise<{ session?: SessionWithRelations; [key: string]: unknown }>;
  currentUserId?: string;
  headerAction?: React.ReactNode;
  workspace: Workspace;
}

export function SimpleTimerControls({
  wsId,
  currentSession,
  elapsedTime,
  isRunning,
  categories,
  apiCall,
  currentUserId,
  headerAction,
  workspace,
}: SimpleTimerControlsProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const t = useTranslations('time-tracker.simple');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('none');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('none');
  const [justCompleted, setJustCompleted] =
    useState<SessionWithRelations | null>(null);

  const [pausedSession, setPausedSession] =
    useState<SessionWithRelations | null>(null);
  const [pausedElapsedTime, setPausedElapsedTime] = useState(0);
  const [pauseStartTime, setPauseStartTime] = useState<Date | null>(null);

  // Current break data for paused session
  const [currentBreak, setCurrentBreak] = useState<{
    id: string;
    break_type_id?: string;
    break_type_name?: string;
    break_type?: { id: string; name: string; icon?: string; color?: string };
    break_start: string;
  } | null>(null);
  const [breakDurationSeconds, setBreakDurationSeconds] = useState(0);

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
        pausedData.pauseTime ? new Date(pausedData.pauseTime as string) : null
      );
    }
  }, [pausedData]);

  // Fetch active break when session is paused using React Query
  const { data: activeBreakData } = useQuery({
    queryKey: ['active-break', wsId, pausedSession?.id],
    queryFn: async () => {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${pausedSession?.id}/breaks/active`
      );
      return (
        (response.break as {
          id: string;
          break_type_id?: string;
          break_type_name?: string;
          break_type?: {
            id: string;
            name: string;
            icon?: string;
            color?: string;
          };
          break_start: string;
        }) || null
      );
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

  // State for exceeded threshold session dialog
  const [showExceededThresholdDialog, setShowExceededThresholdDialog] =
    useState(false);

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

  // Check if current session exceeds the threshold
  const { exceeds: sessionExceedsThreshold } = useSessionExceedsThreshold(
    currentSession || pausedSession,
    thresholdData?.threshold,
    isLoadingThreshold
  );

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
      toast.error(t('enterTitleError'));
      return;
    }

    setIsLoading(true);
    try {
      await apiCall(`/api/v1/workspaces/${wsId}/time-tracking/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          title: sessionTitle,
          description: sessionDescription || null,
          categoryId: selectedCategoryId === 'none' ? null : selectedCategoryId,
          taskId: selectedTaskId === 'none' ? null : selectedTaskId,
        }),
      });

      // Invalidate queries to refetch running session and stats - single source of truth
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId, currentUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracker-stats', wsId, currentUserId],
      });

      // Refresh server-side data to update overview page stats
      router.refresh();

      toast.success(t('timerStarted'));
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error(t('startTimerFailed'));
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
    t,
    currentUserId,
    router,
  ]);

  // Stop timer
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

      // If session has pending approval, just clear the UI state without showing celebration
      // The session will appear in history only after the request is approved
      if (hasPendingApproval) {
        setPausedSession(null);
        setPausedElapsedTime(0);
        setSessionTitle('');
        setSessionDescription('');
        setSelectedTaskId('none');
        setSelectedCategoryId(workCategory?.id || 'none');

        queryClient.invalidateQueries({
          queryKey: ['running-time-session', wsId, currentUserId],
        });
        queryClient.invalidateQueries({
          queryKey: ['time-tracker-stats', wsId, currentUserId],
        });
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'paused-time-session' &&
            query.queryKey[1] === wsId,
        });

        router.refresh();
        toast.info(
          t('sessionPendingApproval') ||
            'Session is pending approval. It will appear in your history once approved.'
        );
        return;
      }

      setJustCompleted(response.session || null);
      setPausedSession(null);
      setPausedElapsedTime(0);

      // Clear form for next session
      setSessionTitle('');
      setSessionDescription('');
      setSelectedTaskId('none');
      setSelectedCategoryId(workCategory?.id || 'none');

      setTimeout(() => setJustCompleted(null), 3000);

      // Invalidate queries to refetch running session and stats - single source of truth
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId, currentUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracker-stats', wsId, currentUserId],
      });

      // Refresh server-side data to update overview page stats
      router.refresh();

      toast.success(
        t('sessionCompleted', {
          duration: formatDuration(response.session?.duration_seconds || 0),
        })
      );
    } catch (error) {
      console.error('Error stopping timer:', error);
      toast.error(t('stopTimerFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [
    currentSession,
    pausedSession,
    sessionExceedsThreshold,
    apiCall,
    wsId,
    queryClient,
    workCategory,
    t,
    currentUserId,
    router,
  ]);

  const resetFormState = useCallback(() => {
    setPausedSession(null);
    setPausedElapsedTime(0);
    setSessionTitle('');
    setSessionDescription('');
    setSelectedTaskId('none');
    setSelectedCategoryId(workCategory?.id || 'none');
  }, [workCategory]);

  // Handle session discarded from exceeded threshold dialog
  const handleSessionDiscarded = useCallback(() => {
    resetFormState();
    // Clear pending break info
    setPendingBreakTypeId(null);
    setPendingBreakTypeName(null);
    // Invalidate queries to refetch running session and stats - single source of truth
    queryClient.invalidateQueries({
      queryKey: ['running-time-session', wsId, currentUserId],
    });
    queryClient.invalidateQueries({
      queryKey: ['time-tracker-stats', wsId, currentUserId],
    });

    // Refresh server-side data to update overview page stats
    router.refresh();
  }, [resetFormState, queryClient, wsId, router, currentUserId]);

  // Handle missed entry created from exceeded threshold dialog
  // If wasBreakPause is true, the session is now paused with a break
  const handleMissedEntryCreated = useCallback(
    (wasBreakPause?: boolean) => {
      resetFormState();
      // Clear pending break info
      setPendingBreakTypeId(null);
      setPendingBreakTypeName(null);
      // Invalidate queries to refetch running session and stats - single source of truth
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId, currentUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracker-stats', wsId, currentUserId],
      });

      // For break pauses, also invalidate paused session query
      if (wasBreakPause) {
        queryClient.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            query.queryKey[0] === 'paused-time-session' &&
            query.queryKey[1] === wsId,
        });
      }

      // Refresh server-side data to update overview page stats
      router.refresh();
    },
    [resetFormState, queryClient, wsId, router, currentUserId]
  );

  // Pause timer
  const pauseTimer = useCallback(async () => {
    if (!currentSession) return;

    // Check if session exceeds threshold - show dialog instead of pausing directly
    if (sessionExceedsThreshold) {
      // Set pending break info so MissedEntryDialog knows this is a break pause
      setPendingBreakTypeName('Break');
      setShowExceededThresholdDialog(true);
      return;
    }

    setIsLoading(true);
    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${currentSession.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            action: 'pause',
            breakTypeName: 'Break', // Always log a break when pausing
          }),
        }
      );

      // Store paused session state locally (paused sessions are not "running")
      setPausedSession(currentSession);
      setPausedElapsedTime(elapsedTime);

      // Invalidate queries to refetch running session, paused session, and stats
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId, currentUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['paused-time-session', wsId, currentUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracker-stats', wsId, currentUserId],
      });

      toast.success(t('timerPaused'));
    } catch (error) {
      // Check if error is THRESHOLD_EXCEEDED
      if (
        error instanceof Error &&
        (error.message.includes('threshold') ||
          error.message === 'THRESHOLD_EXCEEDED')
      ) {
        // Set pending break info so MissedEntryDialog knows this is a break pause
        setPendingBreakTypeName('Break');
        setShowExceededThresholdDialog(true);
      } else {
        console.error('Error pausing timer:', error);
        toast.error(t('pauseTimerFailed'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    currentSession,
    apiCall,
    wsId,
    elapsedTime,
    queryClient,
    t,
    sessionExceedsThreshold,
    currentUserId,
  ]);

  // Resume timer
  const resumeTimer = useCallback(async () => {
    if (!pausedSession) return;

    setIsLoading(true);
    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${pausedSession.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'resume' }),
        }
      );

      // Clear local paused state - query will provide the running session
      setPausedSession(null);
      setPausedElapsedTime(0);

      // Invalidate queries to refetch running session and paused session
      queryClient.invalidateQueries({
        queryKey: ['running-time-session', wsId, currentUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['paused-time-session', wsId, currentUserId],
      });
      queryClient.invalidateQueries({
        queryKey: ['time-tracker-stats', wsId, currentUserId],
      });

      toast.success(t('timerResumed'));
    } catch (error) {
      console.error('Error resuming timer:', error);
      toast.error(t('resumeTimerFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [pausedSession, apiCall, wsId, queryClient, t, currentUserId]);

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
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            {t('title')}
          </div>
          {headerAction}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {currentSession ? (
          // Active timer display
          <div className="space-y-6 text-center">
            <div className="rounded-lg bg-linear-to-br from-green-50 to-emerald-100 p-6 dark:from-green-950/20 dark:to-emerald-900/20">
              <div className="font-bold font-mono text-4xl text-green-600 dark:text-green-400">
                {formatTime(elapsedTime)}
              </div>
              <div className="mt-2 flex items-center justify-center gap-2 text-green-600/70 text-sm dark:text-green-400/70">
                <div className="h-2 w-2 animate-pulse rounded-full bg-green-500"></div>
                {t('recordingTime')}
              </div>
            </div>

            <div className="text-left">
              <h3 className="font-medium text-lg">{currentSession.title}</h3>
              {currentSession.description && (
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
                  {getDescriptionText(currentSession.description)}
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
                {t('pause')}
              </Button>
              <Button
                onClick={stopTimer}
                disabled={isLoading}
                variant="destructive"
                className="flex-1"
              >
                <Square className="mr-2 h-4 w-4" />
                {t('stop')}
              </Button>
            </div>
          </div>
        ) : pausedSession ? (
          // Paused timer display
          <div className="space-y-6 text-center">
            <div className="relative overflow-hidden rounded-lg bg-linear-to-br from-amber-50 to-amber-100 p-6 dark:from-amber-950/20 dark:to-amber-900/20">
              <div className="absolute inset-0 bg-linear-to-r from-amber-500/5 to-transparent"></div>
              <div className="relative">
                {/* Break Type Badge - Prominent Display */}
                {currentBreak && (
                  <div className="mb-4 flex items-center justify-center gap-2">
                    <Badge className="bg-amber-600 px-3 py-1.5 text-base text-white hover:bg-amber-700">
                      {currentBreak.break_type?.icon ? (
                        (() => {
                          const IconComponent = (Icons as any)[
                            currentBreak.break_type.icon
                          ];
                          if (!IconComponent)
                            return <Coffee className="mr-1.5 h-4 w-4" />;
                          if (Array.isArray(IconComponent)) {
                            return (
                              <Icon
                                iconNode={IconComponent}
                                className="mr-1.5 h-4 w-4"
                              />
                            );
                          }
                          return <IconComponent className="mr-1.5 h-4 w-4" />;
                        })()
                      ) : (
                        <Coffee className="mr-1.5 h-4 w-4" />
                      )}
                      {currentBreak.break_type?.name ||
                        currentBreak.break_type_name ||
                        t('onBreak')}
                    </Badge>
                  </div>
                )}

                <div className="mb-3 flex items-center justify-center gap-2">
                  <Pause className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <span className="font-semibold text-amber-700 text-lg dark:text-amber-300">
                    {t('paused')}
                  </span>
                </div>

                {/* Work Duration */}
                <div className="mb-2">
                  <div className="mb-1 text-muted-foreground text-xs">
                    {t('workDuration')}
                  </div>
                  <div className="font-bold font-mono text-3xl text-amber-600 dark:text-amber-400">
                    {formatTime(pausedElapsedTime)}
                  </div>
                </div>

                {/* Break Duration - Live Counter */}
                <div className="mt-4 rounded-lg bg-amber-100/50 p-3 dark:bg-amber-950/30">
                  <div className="mb-1 text-amber-700 text-xs dark:text-amber-300">
                    {t('breakDuration')}
                  </div>
                  <div className="font-bold font-mono text-2xl text-amber-600 dark:text-amber-400">
                    {formatDuration(breakDurationSeconds)}
                  </div>
                  {pauseStartTime && (
                    <div className="mt-1 text-amber-600/70 text-xs dark:text-amber-400/70">
                      {t('pausedAt', {
                        time: pauseStartTime.toLocaleTimeString(),
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="text-left">
              <h3 className="font-medium text-lg">{pausedSession.title}</h3>
              {pausedSession.description && (
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-sm">
                  {getDescriptionText(pausedSession.description)}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                onClick={() => resumeTimer()}
                disabled={isLoading}
                className="flex-1 bg-green-600 text-white hover:bg-green-700"
              >
                <Play className="mr-2 h-4 w-4" />
                {t('resume')}
              </Button>
              <Button
                onClick={stopTimer}
                disabled={isLoading}
                variant="destructive"
                className="flex-1"
              >
                <Square className="mr-2 h-4 w-4" />
                {t('stop')}
              </Button>
            </div>
          </div>
        ) : (
          // Start new timer
          <div className="space-y-4">
            <div>
              <Label htmlFor="session-title" className="font-medium text-sm">
                {t('whatAreYouWorkingOn')}
              </Label>
              <Input
                id="session-title"
                placeholder={t('enterWhatYoureWorkingOn')}
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                className="mt-1"
                autoFocus
              />
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="session-description" className="text-sm">
                  {t('description')}
                </Label>
                <Textarea
                  id="session-description"
                  placeholder={t('addNotes')}
                  value={sessionDescription}
                  onChange={(e) => setSessionDescription(e.target.value)}
                  rows={2}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="category-select" className="text-sm">
                  {t('category')}
                </Label>
                <Select
                  value={selectedCategoryId}
                  onValueChange={setSelectedCategoryId}
                >
                  <SelectTrigger id="category-select" className="mt-1">
                    <SelectValue placeholder={t('selectCategory')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('noCategory')}</SelectItem>
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
              {t('startTimer')}
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
              <h3 className="mb-2 font-semibold text-lg">{t('wellDone')}</h3>
              <p className="mb-1 text-muted-foreground">
                {justCompleted.title}
              </p>
              <p className="font-medium text-green-600 text-sm">
                {t('durationCompleted', {
                  duration: formatDuration(justCompleted.duration_seconds || 0),
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Exceeded Threshold Session Dialog */}
      {(currentSession || pausedSession) && (
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
    </Card>
  );
}
