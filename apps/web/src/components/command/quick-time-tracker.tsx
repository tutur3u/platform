'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { CommandGroup } from '@tuturuuu/ui/command';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { CheckCircle, ExternalLink, Play, Square, Timer } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface QuickTimeTrackerProps {
  wsId: string;
  // eslint-disable-next-line no-unused-vars
  setOpen: (open: boolean) => void;
  // eslint-disable-next-line no-unused-vars
  setIsLoading: (loading: boolean) => void;
}

export function QuickTimeTracker({
  wsId,
  setOpen,
  setIsLoading,
}: QuickTimeTrackerProps) {
  const [title, setTitle] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();

  // Track component visibility to optimize API calls
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsVisible(entry.isIntersecting);
        }
      },
      { threshold: 0.1 }
    );

    const element = document.querySelector('[data-quick-timer]');
    if (element) observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const { data: runningSession, isLoading: isLoadingSession } = useQuery({
    queryKey: ['running-time-session', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
      );
      if (!response.ok) throw new Error('Failed to fetch running session');
      const data = await response.json();
      return data.session;
    },
    // Optimized refetch strategy:
    // - Only refetch when visible and there's a running session
    // - Use longer interval (10 seconds instead of 1 second)
    // - Disable refetch when window is not focused
    refetchInterval: (query) => {
      // Only poll if there's a running session and component is visible
      if (
        query.state.data &&
        isVisible &&
        document.visibilityState === 'visible'
      ) {
        return 10000; // 10 seconds
      }
      return false; // No polling
    },
    refetchOnWindowFocus: true,
    staleTime: 5000, // Consider data fresh for 5 seconds
  });

  // Optimized live timer calculation - only run when session is active
  useEffect(() => {
    if (!runningSession) {
      setElapsedTime(0);
      return;
    }

    const updateElapsed = () => {
      const startTime = new Date(runningSession.start_time).getTime();
      const now = new Date().getTime();
      const elapsed = Math.floor((now - startTime) / 1000);
      setElapsedTime(elapsed);
    };

    // Update immediately
    updateElapsed();

    // Only run timer when session is active and component is visible
    if (isVisible && document.visibilityState === 'visible') {
      const interval = setInterval(updateElapsed, 1000);
      return () => clearInterval(interval);
    }
  }, [runningSession, isVisible]);

  // Comprehensive cache invalidation function
  const invalidateAllCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['running-time-session'] });
    queryClient.invalidateQueries({ queryKey: ['time-tracking-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['time-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    // Invalidate any other potential time tracking related queries
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey.some(
          (key) =>
            typeof key === 'string' &&
            (key.includes('time') ||
              key.includes('session') ||
              key.includes('tracking'))
        ),
    });
  }, [queryClient]);

  const stopMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop' }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop session');
      }

      return response.json();
    },
    onSuccess: (data) => {
      invalidateAllCaches();
      router.refresh();

      toast.success(
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <div className="font-medium">Timer Stopped!</div>
            <div className="text-sm text-muted-foreground">
              Tracked {formatDuration(data.session.duration_seconds || 0)} for "
              {data.session.title}"
            </div>
          </div>
        </div>,
        { duration: 4000 }
      );
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const startMutation = useMutation({
    mutationFn: async (newTitle: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: newTitle,
            description: null,
            categoryId: null,
            taskId: null,
          }),
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start session');
      }
      return response.json();
    },
    onSuccess: (data) => {
      invalidateAllCaches();
      router.refresh();

      const toastId = toast.success(
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
              <Play className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="font-medium">Timer Started!</div>
              <div className="text-sm text-muted-foreground">
                Tracking "{data.session.title}"
              </div>
            </div>
          </div>
          <Link
            href={`/${wsId}/time-tracker`}
            onClick={() => toast.dismiss(toastId)}
          >
            <Button variant="outline" size="sm" className="ml-3">
              <ExternalLink className="mr-1 h-3 w-3" />
              View
            </Button>
          </Link>
        </div>,
        {
          duration: 5000,
        }
      );

      setTitle('');
      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  useEffect(() => {
    setIsLoading(
      isLoadingSession || startMutation.isPending || stopMutation.isPending
    );
  }, [
    isLoadingSession,
    startMutation.isPending,
    stopMutation.isPending,
    setIsLoading,
  ]);

  // Focus the input when component mounts and there's no running session
  useEffect(() => {
    if (!runningSession) {
      const timer = setTimeout(() => {
        const input = document.getElementById('quick-timer-input');
        if (input) input.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [runningSession]);

  const startQuickTimer = async () => {
    if (!title.trim()) {
      toast.error("Please enter what you're working on");
      return;
    }
    setIsLoading(true);
    startMutation.mutate(title);
  };

  const stopQuickTimer = async () => {
    if (runningSession) {
      setIsLoading(true);
      stopMutation.mutate(runningSession.id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      startQuickTimer();
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  if (isLoadingSession) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-r-dynamic-purple" />
          <span className="text-sm">Checking for active timers...</span>
        </div>
      </div>
    );
  }

  return (
    <div data-quick-timer>
      <CommandGroup
        heading={runningSession ? '🔥 Active Timer' : '⚡ Quick Timer'}
      >
        {runningSession ? (
          <div className="px-4 py-3">
            {/* Live Timer Display */}
            <div className="relative mb-4 overflow-hidden rounded-lg bg-gradient-to-br from-red-50 to-red-100 p-4 dark:from-red-950/20 dark:to-red-900/20">
              <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-red-500/10 to-transparent opacity-30"></div>
              <div className="relative text-center">
                <div className="mb-1 font-mono text-2xl font-bold text-red-600 transition-all duration-300 dark:text-red-400">
                  {formatTime(elapsedTime)}
                </div>
                <div className="flex items-center justify-center gap-2 text-xs text-red-600/70 dark:text-red-400/70">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"></div>
                  <span>
                    Started{' '}
                    {new Date(runningSession.start_time).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Session Details */}
            <div className="mb-4 space-y-3">
              <div>
                <h4 className="mb-1 truncate text-sm font-medium">
                  {runningSession.title}
                </h4>
                {runningSession.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {runningSession.description}
                  </p>
                )}
              </div>

              {/* Category and Task Info */}
              <div className="flex flex-wrap gap-2">
                {runningSession.category && (
                  <div className="flex items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 px-2 py-1">
                    <div className="h-2 w-2 rounded-full bg-dynamic-blue" />
                    <span className="text-xs font-medium text-dynamic-blue">
                      {runningSession.category.name}
                    </span>
                  </div>
                )}
                {runningSession.task && (
                  <div className="flex items-center gap-1.5 rounded-md border border-dynamic-green/20 bg-dynamic-green/10 px-2 py-1">
                    <CheckCircle className="h-3 w-3 text-dynamic-green" />
                    <span className="max-w-[100px] truncate text-xs font-medium text-dynamic-green">
                      {runningSession.task.name}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Button */}
            <Button
              onClick={stopQuickTimer}
              disabled={stopMutation.isPending}
              variant="destructive"
              className="h-9 w-full gap-2"
              size="sm"
            >
              <Square className="h-4 w-4" />
              <span>
                {stopMutation.isPending ? 'Stopping...' : 'Stop Timer'}
              </span>
            </Button>
          </div>
        ) : (
          <div className="px-4 py-3">
            <div className="space-y-4">
              {/* Status */}
              <div className="py-3 text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                  <Timer className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Ready to start tracking
                </p>
              </div>

              {/* Input */}
              <div className="space-y-2">
                <Label
                  htmlFor="quick-timer-input"
                  className="text-sm font-medium"
                >
                  What are you working on?
                </Label>
                <Input
                  id="quick-timer-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g., Writing documentation, Bug fixes..."
                  className="w-full"
                  disabled={startMutation.isPending}
                />
              </div>

              {/* Start Button */}
              <Button
                onClick={startQuickTimer}
                disabled={!title.trim() || startMutation.isPending}
                className="h-9 w-full gap-2"
                size="sm"
              >
                <Play className="h-4 w-4" />
                {startMutation.isPending ? 'Starting...' : 'Start Timer'}
              </Button>

              {/* Tips */}
              <div className="rounded-md bg-muted/30 p-3 text-center">
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <span>💡 Press</span>
                    <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                      Enter
                    </kbd>
                    <span>to start instantly</span>
                  </div>
                  <div className="text-muted-foreground/70">
                    Create tasks and categories in the full time tracker
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CommandGroup>
    </div>
  );
}
