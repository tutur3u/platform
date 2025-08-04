'use client';

import { Task, prioritizeTasks } from '../../utils/task-prioritization';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { CommandGroup } from '@tuturuuu/ui/command';
import {
  CheckCircle,
  CheckSquare,
  ChevronDown,
  ExternalLink,
  MapPin,
  Play,
  RotateCcw,
  Search,
  Square,
  Tag,
  Timer,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface QuickTimeTrackerProps {
  wsId: string;
  setOpen: (open: boolean) => void;
  setIsLoading: (loading: boolean) => void;
}

export function QuickTimeTracker({
  wsId,
  setOpen,
  setIsLoading,
}: QuickTimeTrackerProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  // Task selection state
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [selectedBoardId, setSelectedBoardId] = useState<string>('all');
  const [showTaskDropdown, setShowTaskDropdown] = useState(false);
  const [showBoardDropdown, setShowBoardDropdown] = useState(false);

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
        // Progressive polling: increase interval based on session duration
        const sessionDuration = elapsedTime;
        if (sessionDuration < 300) return 10000; // First 5 minutes: 10s
        if (sessionDuration < 1800) return 30000; // 5-30 minutes: 30s
        return 60000; // After 30 minutes: 60s
      }
      return false; // No polling
    },
    refetchOnWindowFocus: true,
    staleTime: 5000, // Consider data fresh for 5 seconds
  });

  // Fetch recent sessions for "Continue Last" functionality
  const { data: recentSessions } = useQuery({
    queryKey: ['recent-time-sessions', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=recent&limit=1`
      );
      if (!response.ok) throw new Error('Failed to fetch recent sessions');
      const data = await response.json();
      return data.sessions || [];
    },
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });

  // Fetch prioritized tasks for "Next Task" functionality
  const { data: nextTaskData } = useQuery({
    queryKey: ['next-task-preview', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks?limit=100`
      );
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const data = await response.json();

      // Use the extracted prioritization utility
      const tasks = data.tasks || [];
      return prioritizeTasks(tasks);
    },
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });

  // Fetch boards for board filtering
  const { data: boardsData } = useQuery({
    queryKey: ['boards-list', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards-with-lists`
      );
      if (!response.ok) throw new Error('Failed to fetch boards');
      const data = await response.json();
      return data.boards || [];
    },
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  // Fetch all tasks for task selection
  const { data: allTasksData } = useQuery({
    queryKey: ['all-tasks', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks?limit=200`
      );
      if (!response.ok) throw new Error('Failed to fetch tasks');
      const data = await response.json();
      return data.tasks || [];
    },
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });

  // Filter tasks based on search query and selected board
  const filteredTasks = useMemo(() => {
    if (!allTasksData) return [];

    let tasks = allTasksData.filter((task: Task) => !task.completed);

    // Filter by board if not "all"
    if (selectedBoardId !== 'all') {
      tasks = tasks.filter((task: Task) => task.board_id === selectedBoardId);
    }

    // Filter by search query
    if (taskSearchQuery.trim()) {
      const query = taskSearchQuery.toLowerCase();
      tasks = tasks.filter(
        (task: Task) =>
          task.name?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.board_name?.toLowerCase().includes(query) ||
          task.list_name?.toLowerCase().includes(query)
      );
    }

    // Sort by priority and assignment
    return tasks.sort((a: Task, b: Task) => {
      // Assigned tasks first
      if (a.is_assigned_to_current_user && !b.is_assigned_to_current_user)
        return -1;
      if (!a.is_assigned_to_current_user && b.is_assigned_to_current_user)
        return 1;

      // Then by priority (lower number = higher priority)
      const aPriority = a.priority || 99;
      const bPriority = b.priority || 99;
      return aPriority - bPriority;
    });
  }, [allTasksData, selectedBoardId, taskSearchQuery]);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('[data-task-dropdown]')) {
        setShowTaskDropdown(false);
      }
      if (!target.closest('[data-board-dropdown]')) {
        setShowBoardDropdown(false);
      }
    };

    if (showTaskDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Always return cleanup function to prevent memory leaks
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTaskDropdown]);

  // Comprehensive cache invalidation function
  const invalidateAllCaches = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['running-time-session'] });
    queryClient.invalidateQueries({ queryKey: ['time-tracking-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['time-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['recent-time-sessions'] });
    queryClient.invalidateQueries({ queryKey: ['next-task-preview'] });
    queryClient.invalidateQueries({ queryKey: ['boards-list'] });
    queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
    // Invalidate any other potential time tracking related queries
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey.some(
          (key) =>
            typeof key === 'string' &&
            (key.includes('time') ||
              key.includes('session') ||
              key.includes('tracking') ||
              key.includes('task') ||
              key.includes('board'))
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
    mutationFn: async (sessionData: {
      title: string;
      description?: string;
      categoryId?: string;
      taskId?: string;
    }) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: sessionData.title,
            description: sessionData.description || null,
            categoryId: sessionData.categoryId || null,
            taskId: sessionData.taskId || null,
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

      setOpen(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
    onSettled: () => {
      setIsLoading(false);
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resume' }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resume session');
      }

      return response.json();
    },
    onSuccess: (data) => {
      invalidateAllCaches();
      router.refresh();
      toast.success(`Resumed: ${data.session.title}`);
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
      isLoadingSession ||
        startMutation.isPending ||
        stopMutation.isPending ||
        resumeMutation.isPending
    );
  }, [
    isLoadingSession,
    startMutation.isPending,
    stopMutation.isPending,
    resumeMutation.isPending,
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
    if (!selectedTask) {
      toast.error('Please select a task to work on');
      return;
    }

    setIsLoading(true);

    try {
      // If task is unassigned, assign to current user first
      const isUnassigned =
        !selectedTask.assignees || selectedTask.assignees.length === 0;

      if (isUnassigned) {
        const assignResponse = await fetch(
          `/api/v1/workspaces/${wsId}/tasks/${selectedTask.id}/assign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assign: true }),
          }
        );

        if (!assignResponse.ok) {
          throw new Error('Failed to assign task');
        }

        toast.success(`Assigned task "${selectedTask.name}" to yourself`);
      }

      // Start session for the task
      startMutation.mutate({
        title: `Working on: ${selectedTask.name}`,
        description:
          selectedTask.description || `Working on: ${selectedTask.name}`,
        taskId: selectedTask.id,
      });
    } catch (error) {
      toast.error('Failed to start task session');
    } finally {
      // Note: setIsLoading(false) is handled in the mutation's onSettled callback
      // to ensure it's called after the mutation completes regardless of success/failure
    }
  };

  const continueLastSession = async () => {
    const lastSession = recentSessions?.[0];
    if (!lastSession) {
      toast.info('No recent session to continue');
      return;
    }
    if (runningSession) {
      toast.info('Timer is already running');
      return;
    }
    setIsLoading(true);
    resumeMutation.mutate(lastSession.id);
  };

  const startNextTask = async () => {
    const nextTask = nextTaskData?.nextTask;
    if (!nextTask) {
      toast.info('No available tasks to start');
      return;
    }
    if (runningSession) {
      toast.info('Timer is already running');
      return;
    }

    setIsLoading(true);

    try {
      // If task is unassigned, assign to current user first
      const isUnassigned =
        !nextTask.assignees || nextTask.assignees.length === 0;

      if (isUnassigned) {
        const assignResponse = await fetch(
          `/api/v1/workspaces/${wsId}/tasks/${nextTask.id}/assign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assign: true }),
          }
        );

        if (!assignResponse.ok) {
          throw new Error('Failed to assign task');
        }

        toast.success(`Assigned task "${nextTask.name}" to yourself`);
      }

      // Start session for the task
      startMutation.mutate({
        title: `Working on: ${nextTask.name}`,
        description: nextTask.description || `Working on: ${nextTask.name}`,
        taskId: nextTask.id,
      });
    } catch (error) {
      toast.error('Failed to start task session');
    } finally {
      // Note: setIsLoading(false) is handled in the mutation's onSettled callback
      // to ensure it's called after the mutation completes regardless of success/failure
    }
  };

  const stopQuickTimer = async () => {
    if (runningSession) {
      setIsLoading(true);
      stopMutation.mutate(runningSession.id);
    }
  };

  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task);
    setTaskSearchQuery(task.name);
    setShowTaskDropdown(false);
  };

  const handleTaskSearchChange = (value: string) => {
    setTaskSearchQuery(value);

    // Clear selected task if search is cleared
    if (!value.trim()) {
      setSelectedTask(null);
    }

    // Show dropdown when typing
    setShowTaskDropdown(true);
  };

  const handleBoardChange = (boardId: string) => {
    setSelectedBoardId(boardId);
    // Reset search when changing boards
    setTaskSearchQuery('');
    setSelectedTask(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !runningSession && selectedTask) {
      e.preventDefault();
      startQuickTimer();
    } else if (e.key === 'Escape') {
      setShowTaskDropdown(false);
    } else if (
      e.key === 'ArrowDown' &&
      showTaskDropdown &&
      filteredTasks.length > 0
    ) {
      e.preventDefault();
      // Focus first task in dropdown (could implement arrow navigation)
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

  const getPriorityLabel = (priority: number | null | undefined) => {
    switch (priority) {
      case 1:
        return 'Urgent';
      case 2:
        return 'High';
      case 3:
        return 'Medium';
      case 4:
        return 'Low';
      default:
        return 'No Priority';
    }
  };

  const getPriorityColor = (priority: number | null | undefined) => {
    switch (priority) {
      case 1:
        return 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30';
      case 2:
        return 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30';
      case 3:
        return 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30';
      case 4:
        return 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30';
      default:
        return 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-900/30';
    }
  };

  return (
    <CommandGroup
      heading="Time Tracker"
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
      data-quick-timer
    >
      <div className="px-2 pb-2">
        <div className="space-y-3">
          {/* Current Session Display */}
          {runningSession ? (
            <div className="rounded-lg border border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 p-4 dark:border-green-800 dark:from-green-950/50 dark:to-emerald-950/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500">
                    <Timer className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-green-900 dark:text-green-100">
                      {runningSession.title}
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      Running
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-bold text-green-900 dark:text-green-100">
                    {formatTime(elapsedTime)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={stopQuickTimer}
                  size="sm"
                  variant="outline"
                  className="flex-1 border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/30"
                  disabled={stopMutation.isPending || isLoadingSession}
                >
                  <Square className="mr-2 h-3 w-3" />
                  Stop
                </Button>
                <Link href={`/${wsId}/time-tracker`}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/30"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            /* Task Selection */
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="task-search" className="text-sm font-medium">
                  Select Task
                </Label>

                {/* Search Input with Board Filter */}
                <div className="relative" data-task-dropdown>
                  <div className="flex">
                    <div className="relative flex-1">
                      <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="task-search"
                        placeholder="Search tasks..."
                        value={taskSearchQuery}
                        onChange={(e) => handleTaskSearchChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setShowTaskDropdown(true)}
                        className="h-9 pr-4 pl-10"
                        autoFocus
                      />
                      {selectedTask && (
                        <button
                          onClick={() => {
                            setSelectedTask(null);
                            setTaskSearchQuery('');
                          }}
                          className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* Board Filter Dropdown */}
                    <div className="relative ml-2 w-32" data-board-dropdown>
                      <button
                        data-board-button
                        onClick={() => setShowBoardDropdown(!showBoardDropdown)}
                        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-none"
                      >
                        <span className="truncate">
                          {selectedBoardId === 'all'
                            ? 'All Boards'
                            : boardsData?.find(
                                (board: any) => board.id === selectedBoardId
                              )?.name || 'All Boards'}
                        </span>
                        <ChevronDown className="ml-2 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      </button>

                      {/* Board Dropdown */}
                      {showBoardDropdown && (
                        <div className="absolute top-full right-0 z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                          <div className="max-h-32 overflow-y-auto">
                            <button
                              onClick={() => {
                                handleBoardChange('all');
                                setShowBoardDropdown(false);
                              }}
                              className={cn(
                                'w-full rounded-sm p-2 text-left text-sm transition-colors hover:bg-accent',
                                selectedBoardId === 'all' && 'bg-accent'
                              )}
                            >
                              All Boards
                            </button>
                            {boardsData?.map((board: any) => (
                              <button
                                key={board.id}
                                onClick={() => {
                                  handleBoardChange(board.id);
                                  setShowBoardDropdown(false);
                                }}
                                className={cn(
                                  'w-full rounded-sm p-2 text-left text-sm transition-colors hover:bg-accent',
                                  selectedBoardId === board.id && 'bg-accent'
                                )}
                                title={board.name}
                              >
                                <span className="line-clamp-1">
                                  {board.name}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Task Dropdown */}
                  {showTaskDropdown && (
                    <div className="absolute top-full right-0 left-0 z-50 mt-1 w-full max-w-full rounded-md border bg-popover p-1 shadow-md">
                      <div className="max-h-32 overflow-y-auto">
                        {filteredTasks.length > 0 ? (
                          filteredTasks.slice(0, 12).map((task: any) => (
                            <button
                              key={task.id}
                              onClick={() => handleTaskSelect(task)}
                              className="w-full rounded-sm p-2 text-left transition-colors hover:bg-accent"
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/20 to-dynamic-blue/10">
                                  <CheckCircle className="h-2.5 w-2.5 text-dynamic-blue" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="line-clamp-1 text-xs font-medium">
                                      {task.name}
                                    </span>
                                    {task.is_assigned_to_current_user && (
                                      <span className="inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                                        Assigned
                                      </span>
                                    )}
                                    {task.priority && (
                                      <span
                                        className={cn(
                                          'inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium',
                                          getPriorityColor(task.priority)
                                        )}
                                      >
                                        {getPriorityLabel(task.priority)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-1 flex items-center gap-2">
                                    {task.board_name && (
                                      <div className="flex items-center gap-1">
                                        <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
                                        <span className="text-[10px] text-muted-foreground">
                                          {task.board_name}
                                        </span>
                                      </div>
                                    )}
                                    {task.list_name && (
                                      <div className="flex items-center gap-1">
                                        <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                                        <span className="text-[10px] text-muted-foreground">
                                          {task.list_name}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-xs text-muted-foreground">
                            {taskSearchQuery
                              ? 'No tasks found matching your search'
                              : 'No tasks available'}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Task Display */}
              {selectedTask && (
                <div className="rounded-lg border border-dynamic-green/30 bg-gradient-to-r from-dynamic-green/5 to-dynamic-green/3 p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-dynamic-green/30 bg-gradient-to-br from-dynamic-green/20 to-dynamic-green/10">
                      <CheckCircle className="h-4 w-4 text-dynamic-green" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-dynamic-green">
                          Selected Task
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {selectedTask.name}
                      </p>
                      {selectedTask.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {selectedTask.description}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        {selectedTask.priority && (
                          <span
                            className={cn(
                              'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
                              getPriorityColor(selectedTask.priority)
                            )}
                          >
                            {getPriorityLabel(selectedTask.priority)}
                          </span>
                        )}
                        {selectedTask.board_name && selectedTask.list_name && (
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {selectedTask.board_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Tag className="h-3 w-3 text-dynamic-green" />
                              <span className="text-xs text-dynamic-green">
                                {selectedTask.list_name}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={startQuickTimer}
                  className="flex-1"
                  size="sm"
                  disabled={!selectedTask || startMutation.isPending}
                >
                  <Play className="mr-2 h-3 w-3" />
                  Start Timer
                </Button>
                <Link href={`/${wsId}/time-tracker`}>
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </Link>
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2">
                {/* Continue Last Session */}
                <button
                  onClick={continueLastSession}
                  disabled={
                    !recentSessions?.[0] ||
                    runningSession ||
                    resumeMutation.isPending
                  }
                  className={cn(
                    'group rounded-lg border p-3 text-left transition-all duration-200',
                    recentSessions?.[0] && !runningSession
                      ? 'border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 hover:shadow-md hover:shadow-blue-500/20 active:scale-[0.98] dark:border-blue-800 dark:from-blue-950/30 dark:to-blue-900/20'
                      : 'cursor-not-allowed border-muted bg-muted/30 opacity-60'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        'flex-shrink-0 rounded-full p-1 transition-colors',
                        recentSessions?.[0] && !runningSession
                          ? 'bg-blue-500/20 group-hover:bg-blue-500/30'
                          : 'bg-muted-foreground/20'
                      )}
                    >
                      <RotateCcw
                        className={cn(
                          'h-3 w-3 transition-transform group-hover:rotate-12',
                          recentSessions?.[0] && !runningSession
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-muted-foreground'
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-xs font-medium',
                          recentSessions?.[0] && !runningSession
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-muted-foreground'
                        )}
                      >
                        Continue Last
                      </p>
                      {recentSessions?.[0] ? (
                        <>
                          <p
                            className="line-clamp-1 text-sm font-bold text-blue-900 dark:text-blue-100"
                            title={recentSessions[0].title}
                          >
                            {recentSessions[0].title}
                          </p>
                          {recentSessions[0].category && (
                            <div className="mt-1 flex items-center gap-1">
                              <div
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full',
                                  recentSessions[0].category.color
                                    ? `bg-dynamic-${recentSessions[0].category.color.toLowerCase()}/70`
                                    : 'bg-blue-500/70'
                                )}
                              />
                              <span className="truncate text-xs text-blue-700/80 dark:text-blue-300/80">
                                {recentSessions[0].category.name}
                              </span>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-sm font-bold text-muted-foreground">
                          No recent session
                        </p>
                      )}
                    </div>
                  </div>
                </button>

                {/* Next Task */}
                <button
                  onClick={startNextTask}
                  disabled={
                    !nextTaskData?.nextTask ||
                    runningSession ||
                    startMutation.isPending
                  }
                  className={cn(
                    'group rounded-lg border p-3 text-left transition-all duration-200',
                    nextTaskData?.nextTask && !runningSession
                      ? 'border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100/50 hover:shadow-md hover:shadow-purple-500/20 active:scale-[0.98] dark:border-purple-800 dark:from-purple-950/30 dark:to-purple-900/20'
                      : 'cursor-not-allowed border-muted bg-muted/30 opacity-60'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className={cn(
                        'flex-shrink-0 rounded-full p-1 transition-colors',
                        nextTaskData?.nextTask && !runningSession
                          ? 'bg-purple-500/20 group-hover:bg-purple-500/30'
                          : 'bg-muted-foreground/20'
                      )}
                    >
                      <CheckSquare
                        className={cn(
                          'h-3 w-3 transition-transform group-hover:scale-110',
                          nextTaskData?.nextTask && !runningSession
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-muted-foreground'
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-xs font-medium',
                          nextTaskData?.nextTask && !runningSession
                            ? 'text-purple-700 dark:text-purple-300'
                            : 'text-muted-foreground'
                        )}
                      >
                        Next Task
                      </p>
                      {nextTaskData?.nextTask ? (
                        <>
                          <p
                            className="line-clamp-1 text-sm font-bold text-purple-900 dark:text-purple-100"
                            title={nextTaskData.nextTask.name}
                          >
                            {nextTaskData.nextTask.name}
                          </p>
                          <div className="mt-1 flex items-center gap-1">
                            <span
                              className={cn(
                                'inline-flex items-center rounded px-1 py-0.5 text-xs font-medium',
                                getPriorityColor(nextTaskData.nextTask.priority)
                              )}
                            >
                              {getPriorityLabel(nextTaskData.nextTask.priority)}
                            </span>
                            {nextTaskData.nextTask
                              .is_assigned_to_current_user ? (
                              <span className="text-xs text-purple-600/80 dark:text-purple-400/80">
                                • You
                              </span>
                            ) : (
                              <span className="text-xs text-purple-600/80 dark:text-purple-400/80">
                                • Auto-assign
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-bold text-muted-foreground">
                            No tasks available
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Create or assign tasks
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </CommandGroup>
  );
}
