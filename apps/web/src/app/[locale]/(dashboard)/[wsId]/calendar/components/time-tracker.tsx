'use client';

import type { TimeTrackingCategory, WorkspaceTask } from '@tuturuuu/types/db';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  Calendar,
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  History,
  MapPin,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  Tag,
  Timer,
  Trash2,
  TrendingUp,
  Zap,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useState } from 'react';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
  TimerStats,
} from '../../time-tracker/types';

interface TimeTrackerProps {
  wsId: string;
  tasks?: ExtendedWorkspaceTask[];
}

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

export default function TimeTracker({ wsId, tasks = [] }: TimeTrackerProps) {
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

  // Task creation state
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [showTaskCreation, setShowTaskCreation] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Timer state
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDescription, setNewSessionDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [sessionMode, setSessionMode] = useState<'task' | 'manual'>('task');
  const [showTaskSuggestion, setShowTaskSuggestion] = useState(false);

  // Dialog states
  const [sessionToDelete, setSessionToDelete] =
    useState<SessionWithRelations | null>(null);
  const [sessionToEdit, setSessionToEdit] =
    useState<SessionWithRelations | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Enhanced UX states
  const [actionStates, setActionStates] = useState<{ [key: string]: boolean }>(
    {}
  );
  const [justCompleted, setJustCompleted] =
    useState<SessionWithRelations | null>(null);
  const [showQuickActions, setShowQuickActions] = useState(false);

  // Filter states
  const [activeTab, setActiveTab] = useState<'current' | 'recent' | 'history'>(
    'current'
  );
  const [filterCategoryId, setFilterCategoryId] = useState<string>('');
  const [filterTaskId, setFilterTaskId] = useState<string>('');

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTaskId, setEditTaskId] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // Format time display
  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Format duration for display
  const formatDuration = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, []);

  // API call helpers
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

  // Fetch data
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
          (new Date().getTime() -
            new Date(runningRes.session.start_time).getTime()) /
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

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isRunning && currentSession) {
      interval = setInterval(() => {
        const elapsed = Math.floor(
          (new Date().getTime() -
            new Date(currentSession.start_time).getTime()) /
            1000
        );
        setElapsedTime(elapsed);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, currentSession]);

  // Load data on mount and when dialog opens
  useEffect(() => {
    if (isOpen) {
      fetchData();
      fetchBoards();
    }
  }, [isOpen, fetchData, fetchBoards]);

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
  const startTimerWithTask = async (taskId: string, taskName: string) => {
    setIsLoading(true);

    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: `Working on: ${taskName}`,
            description: newSessionDescription || null,
            categoryId: selectedCategoryId || null,
            taskId: taskId,
          }),
        }
      );

      setCurrentSession(response.session);
      setIsRunning(true);
      setElapsedTime(0);
      setNewSessionTitle('');
      setNewSessionDescription('');
      setSelectedCategoryId('');
      setSelectedTaskId('');

      fetchData();
      toast.success('Timer started!');
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error('Failed to start timer');
    } finally {
      setIsLoading(false);
    }
  };

  // Start timer
  const startTimer = async () => {
    if (sessionMode === 'task' && selectedTaskId) {
      const selectedTask = tasks.find((t) => t.id === selectedTaskId);
      if (selectedTask) {
        await startTimerWithTask(selectedTaskId, selectedTask.name!);
        return;
      }
    }

    if (sessionMode === 'task' && !selectedTaskId) {
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
            categoryId: selectedCategoryId || null,
            taskId: selectedTaskId || null,
          }),
        }
      );

      setCurrentSession(response.session);
      setIsRunning(true);
      setElapsedTime(0);
      setNewSessionTitle('');
      setNewSessionDescription('');
      setSelectedCategoryId('');
      setSelectedTaskId('');

      fetchData();
      toast.success('Timer started!');
    } catch (error) {
      console.error('Error starting timer:', error);
      toast.error('Failed to start timer');
    } finally {
      setIsLoading(false);
    }
  };

  // Stop timer
  const stopTimer = async () => {
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
      setActiveTab('recent'); // Switch to recent tab to see completed session

      // Show completion celebration
      setTimeout(() => setJustCompleted(null), 3000);

      fetchData();
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
  };

  // Pause timer
  const pauseTimer = async () => {
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
  };

  // Resume session (creates new session with same details)
  const resumeSession = async (session: SessionWithRelations) => {
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
      setActiveTab('current'); // Switch to current tab

      fetchData();
      toast.success(`Started new session: "${session.title}"`);
    } catch (error) {
      console.error('Error resuming session:', error);
      toast.error('Failed to start new session');
    } finally {
      setActionStates((prev) => ({ ...prev, [`resume-${session.id}`]: false }));
    }
  };

  // Start from template
  const startFromTemplate = async (template: SessionTemplate) => {
    setNewSessionTitle(template.title);
    setNewSessionDescription(template.description || '');
    setSelectedCategoryId(template.category_id || '');
    setSelectedTaskId(template.task_id || '');
    setActiveTab('current');
  };

  // Duplicate session
  const duplicateSession = async (session: SessionWithRelations) => {
    setNewSessionTitle(session.title);
    setNewSessionDescription(session.description || '');
    setSelectedCategoryId(session.category_id || '');
    setSelectedTaskId(session.task_id || '');
    setActiveTab('current');
    toast.success('Session settings copied');
  };

  // Edit session
  // const openEditDialog = (session: SessionWithRelations) => {
  //   setSessionToEdit(session);
  //   setEditTitle(session.title);
  //   setEditDescription(session.description || '');
  //   setEditCategoryId(session.category_id || '');
  //   setEditTaskId(session.task_id || '');
  //   setEditStartTime(new Date(session.start_time).toISOString().slice(0, 16));
  //   setEditEndTime(
  //     session.end_time
  //       ? new Date(session.end_time).toISOString().slice(0, 16)
  //       : ''
  //   );
  // };

  const saveEdit = async () => {
    if (!sessionToEdit) return;

    setIsEditing(true);

    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToEdit.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            action: 'edit',
            title: editTitle,
            description: editDescription,
            categoryId: editCategoryId || null,
            taskId: editTaskId || null,
            startTime: editStartTime
              ? new Date(editStartTime).toISOString()
              : undefined,
            endTime: editEndTime
              ? new Date(editEndTime).toISOString()
              : undefined,
          }),
        }
      );

      setSessionToEdit(null);
      fetchData();
      toast.success('Session updated successfully');
    } catch (error) {
      console.error('Error updating session:', error);
      toast.error('Failed to update session');
    } finally {
      setIsEditing(false);
    }
  };

  // Delete session
  const deleteSession = async () => {
    if (!sessionToDelete) return;

    setIsDeleting(true);

    try {
      await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions/${sessionToDelete.id}`,
        {
          method: 'DELETE',
        }
      );

      setSessionToDelete(null);
      fetchData();
      toast.success('Time session deleted successfully');
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error('Failed to delete session');
    } finally {
      setIsDeleting(false);
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

  const filteredSessions = recentSessions.filter((session) => {
    if (filterCategoryId && session.category_id !== filterCategoryId)
      return false;
    if (filterTaskId && session.task_id !== filterTaskId) return false;
    return true;
  });

  // Get lists for selected board
  const selectedBoard = boards.find((board) => board.id === selectedBoardId);
  const availableLists = selectedBoard?.task_lists || [];

  // Handle task selection change
  const handleTaskSelectionChange = (taskId: string) => {
    setSelectedTaskId(taskId);
    if (taskId) {
      const selectedTask = tasks.find((t) => t.id === taskId);
      if (selectedTask) {
        setNewSessionTitle(`Working on: ${selectedTask.name}`);
      }
    } else {
      setNewSessionTitle('');
    }
  };

  // Handle session mode change with cleanup
  const handleSessionModeChange = (mode: 'task' | 'manual') => {
    const previousMode = sessionMode;
    setSessionMode(mode);

    // Clear form state when switching modes for better UX
    setNewSessionTitle('');
    setNewSessionDescription('');
    setSelectedTaskId('');
    setShowTaskSuggestion(false);

    // Reset any temporary states
    setSelectedCategoryId('');

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
      setSelectedTaskId(matchingTask.id!);
      setShowTaskSuggestion(false);
    } else if (title.length > 2 && !selectedTaskId) {
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

  // Keyboard shortcuts (placed after function declarations)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      // Ctrl/Cmd + Enter to start/stop timer
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (isRunning) {
          stopTimer();
        } else if (newSessionTitle.trim()) {
          startTimer();
        }
      }

      // Escape to close dialog
      if (event.key === 'Escape') {
        setIsOpen(false);
      }

      // Ctrl/Cmd + P to pause
      if ((event.ctrlKey || event.metaKey) && event.key === 'p' && isRunning) {
        event.preventDefault();
        pauseTimer();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isRunning, newSessionTitle, startTimer, stopTimer, pauseTimer]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant={isRunning ? 'destructive' : 'outline'}
            size="sm"
            className={cn('gap-2', 'relative w-full')}
          >
            {isRunning && (
              <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-red-600/20 to-transparent" />
            )}
            <div className="relative flex items-center gap-2">
              {isRunning ? (
                <>
                  <Square className="h-3 w-3 animate-pulse" />
                  <span className="hidden font-mono @[100px]:inline">
                    {formatTime(elapsedTime)}
                  </span>
                  <span className="font-mono @[100px]:hidden">
                    {Math.floor(elapsedTime / 60)}m
                  </span>
                </>
              ) : (
                <>
                  <Timer className="h-3 w-3" />
                  <span className="hidden @[100px]:inline">Time Tracker</span>
                  <span className="@[100px]:hidden">Timer</span>
                </>
              )}
            </div>
          </Button>
        </DialogTrigger>

        <DialogContent className="@container max-h-[95vh] max-w-7xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Time Tracker
            </DialogTitle>
            <DialogDescription className="space-y-1">
              <span>
                Track your time across tasks and projects with detailed
                analytics
              </span>
              <span className="mt-2 text-xs text-muted-foreground">
                <br />•{' '}
                <span className="rounded bg-muted px-1 py-0.5 text-xs">
                  ⌘/Ctrl + Enter
                </span>{' '}
                to start/stop
                <br />•{' '}
                <span className="rounded bg-muted px-1 py-0.5 text-xs">
                  ⌘/Ctrl + P
                </span>{' '}
                to pause
                <br />•{' '}
                <span className="rounded bg-muted px-1 py-0.5 text-xs">
                  Esc
                </span>{' '}
                to close
              </span>
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="current" className="flex items-center gap-2">
                <Play className="h-4 w-4" />
                Current
              </TabsTrigger>
              <TabsTrigger value="recent" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Recent
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                History
              </TabsTrigger>
            </TabsList>

            <div className="grid grid-cols-1 gap-6 @5xl:grid-cols-2">
              {/* Current Session Tab */}
              <TabsContent value="current" className="@container space-y-4">
                <Card className="transition-all hover:shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base @lg:text-lg">
                      <Clock className="h-4 w-4 @lg:h-5 @lg:w-5" />
                      Current Session
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {currentSession ? (
                      <div className="space-y-4 text-center">
                        <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-red-50 to-red-100 p-4 @lg:p-6 dark:from-red-950/20 dark:to-red-900/20">
                          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-red-500/10 to-transparent opacity-30"></div>
                          <div className="relative">
                            <div className="font-mono text-3xl font-bold text-red-600 transition-all duration-300 @lg:text-4xl dark:text-red-400">
                              {formatTime(elapsedTime)}
                            </div>
                            <div className="mt-2 flex items-center gap-2 text-xs text-red-600/70 @lg:text-sm dark:text-red-400/70">
                              <div className="h-2 w-2 animate-pulse rounded-full bg-red-500"></div>
                              Started at{' '}
                              {new Date(
                                currentSession.start_time
                              ).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>

                        <div className="text-left">
                          <h3 className="text-sm font-medium @lg:text-base">
                            {currentSession.title}
                          </h3>
                          {currentSession.description && (
                            <p className="mt-1 text-xs text-muted-foreground @lg:text-sm">
                              {currentSession.description}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap gap-1 @lg:gap-2">
                            {currentSession.category && (
                              <Badge
                                className={cn(
                                  'text-xs @lg:text-sm',
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
                                  <span className="text-xs font-medium text-dynamic-blue @lg:text-sm">
                                    {currentSession.task.name}
                                  </span>
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
                                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
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

                        <div className="flex gap-2">
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
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 text-center @lg:p-6">
                          <Clock className="mx-auto mb-2 h-8 w-8 text-muted-foreground @lg:h-12 @lg:w-12" />
                          <p className="text-sm text-muted-foreground @lg:text-base">
                            Ready to start tracking time
                          </p>
                        </div>

                        {/* Session Mode Toggle */}
                        <Tabs
                          value={sessionMode}
                          onValueChange={(v) =>
                            handleSessionModeChange(v as any)
                          }
                        >
                          <TabsList className="grid h-full w-full grid-cols-2 bg-muted/50">
                            <TabsTrigger
                              value="task"
                              className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                            >
                              <CheckCircle className="h-4 w-4" />
                              <div className="flex flex-col items-start">
                                <span className="text-sm font-medium">
                                  Task-based
                                </span>
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
                                <span className="text-sm font-medium">
                                  Manual
                                </span>
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
                              <Select
                                value={selectedTaskId}
                                onValueChange={handleTaskSelectionChange}
                              >
                                <SelectTrigger className="text-sm transition-all duration-200 @lg:text-base">
                                  <SelectValue placeholder="Choose a task or create new..." />
                                </SelectTrigger>
                                <SelectContent className="w-[400px]">
                                  {tasks.map((task) => (
                                    <SelectItem
                                      key={task.id}
                                      value={task.id!}
                                      className="p-0"
                                    >
                                      <div className="flex w-full items-start gap-3 p-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/20 to-dynamic-blue/10">
                                          <CheckCircle className="h-4 w-4 text-dynamic-blue" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium">
                                              {task.name}
                                            </span>
                                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                          </div>
                                          {task.description && (
                                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                              {task.description}
                                            </p>
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
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              {!selectedTaskId && (
                                <div className="text-center">
                                  <p className="mb-2 text-sm text-muted-foreground">
                                    No task selected? We'll help you create one!
                                  </p>
                                </div>
                              )}
                            </div>

                            <Textarea
                              placeholder="Add session notes (optional)"
                              value={newSessionDescription}
                              onChange={(e) =>
                                setNewSessionDescription(e.target.value)
                              }
                              rows={2}
                              className="text-sm @lg:text-base"
                            />

                            <Select
                              value={selectedCategoryId}
                              onValueChange={setSelectedCategoryId}
                            >
                              <SelectTrigger className="text-sm @lg:text-base">
                                <SelectValue placeholder="Category (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map((category) => (
                                  <SelectItem
                                    key={category.id}
                                    value={category.id}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={cn(
                                          'h-3 w-3 rounded-full',
                                          getCategoryColor(
                                            category.color || 'BLUE'
                                          )
                                        )}
                                      />
                                      {category.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Button
                              onClick={startTimer}
                              disabled={isLoading}
                              className="w-full border border-border bg-muted text-foreground hover:border-accent hover:bg-muted/80 dark:bg-muted dark:text-foreground dark:hover:bg-accent"
                              size="lg"
                            >
                              <Play className="mr-2 h-4 w-4" />
                              {selectedTaskId
                                ? 'Start Timer'
                                : 'Create Task & Start Timer'}
                            </Button>
                          </TabsContent>

                          <TabsContent
                            value="manual"
                            className="space-y-4 duration-300 animate-in fade-in-50 slide-in-from-bottom-2"
                          >
                            <div className="space-y-2">
                              <Input
                                placeholder="What are you working on?"
                                value={newSessionTitle}
                                onChange={(e) =>
                                  handleManualTitleChange(e.target.value)
                                }
                                className="text-sm @lg:text-base"
                                autoFocus={sessionMode === 'manual'}
                              />

                              {/* Task suggestion */}
                              {showTaskSuggestion &&
                                newSessionTitle.length > 2 && (
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
                                            Create "{newSessionTitle}" as a new
                                            task for better organization and
                                            tracking.
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
                              {selectedTaskId && !showTaskSuggestion && (
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
                                            setSelectedTaskId('');
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
                                              Time will be automatically tracked
                                              for this task
                                            </p>
                                          </div>
                                        ) : null;
                                      })()}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            <Textarea
                              placeholder="Add description (optional)"
                              value={newSessionDescription}
                              onChange={(e) =>
                                setNewSessionDescription(e.target.value)
                              }
                              rows={3}
                              className="text-sm @lg:text-base"
                            />

                            <Select
                              value={selectedCategoryId}
                              onValueChange={setSelectedCategoryId}
                            >
                              <SelectTrigger className="text-sm @lg:text-base">
                                <SelectValue placeholder="Category (optional)" />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map((category) => (
                                  <SelectItem
                                    key={category.id}
                                    value={category.id}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div
                                        className={cn(
                                          'h-3 w-3 rounded-full',
                                          getCategoryColor(
                                            category.color || 'BLUE'
                                          )
                                        )}
                                      />
                                      {category.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Button
                              onClick={startTimer}
                              disabled={!newSessionTitle.trim() || isLoading}
                              className="w-full border border-border bg-muted text-foreground hover:border-accent hover:bg-muted/80 dark:bg-muted dark:text-foreground dark:hover:bg-accent"
                              size="lg"
                            >
                              <Play className="mr-2 h-4 w-4" />
                              Start Timer
                            </Button>
                          </TabsContent>
                        </Tabs>

                        {/* Quick Actions */}
                        {(recentSessions.length > 0 ||
                          templates.length > 0) && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs text-muted-foreground">
                                Quick Start:
                              </Label>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setShowQuickActions(!showQuickActions)
                                }
                                className="h-6 px-2 text-xs"
                              >
                                {showQuickActions ? 'Less' : 'More'}
                              </Button>
                            </div>

                            <div className="space-y-2">
                              {/* Most recent session */}
                              {recentSessions.length > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    duplicateSession(recentSessions[0]!)
                                  }
                                  className="w-full justify-start text-xs"
                                >
                                  <RotateCcw className="mr-2 h-3 w-3" />
                                  Repeat: {recentSessions[0]?.title}
                                </Button>
                              )}

                              {/* Templates */}
                              {showQuickActions &&
                                templates.slice(0, 3).map((template, idx) => (
                                  <Button
                                    key={idx}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startFromTemplate(template)}
                                    className="w-full justify-start text-xs"
                                  >
                                    <Copy className="mr-2 h-3 w-3" />
                                    {template.title}
                                    <Badge
                                      variant="secondary"
                                      className="ml-auto text-xs"
                                    >
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
                </Card>

                {/* Completion Celebration */}
                {justCompleted && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm duration-300 animate-in fade-in">
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
                          {formatDuration(justCompleted.duration_seconds || 0)}{' '}
                          tracked
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-2 @lg:gap-4">
                  <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
                    <CardContent className="p-3 @lg:p-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-500 transition-transform group-hover:scale-110" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground @lg:text-sm">
                            Today
                          </p>
                          <p className="truncate text-sm font-medium transition-all @lg:text-base">
                            {formatDuration(timerStats.todayTime)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
                    <CardContent className="p-3 @lg:p-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500 transition-transform group-hover:scale-110" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground @lg:text-sm">
                            Week
                          </p>
                          <p className="truncate text-sm font-medium transition-all @lg:text-base">
                            {formatDuration(timerStats.weekTime)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="group cursor-pointer transition-all hover:scale-105 hover:shadow-md">
                    <CardContent className="p-3 @lg:p-4">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-purple-500 transition-transform group-hover:scale-110" />
                        <div className="min-w-0">
                          <p className="text-xs text-muted-foreground @lg:text-sm">
                            Month
                          </p>
                          <p className="truncate text-sm font-medium transition-all @lg:text-base">
                            {formatDuration(timerStats.monthTime)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Recent Sessions Tab */}
              <TabsContent value="recent" className="@container space-y-4">
                <Card className="transition-all hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base @lg:text-lg">
                        <Zap className="h-4 w-4 @lg:h-5 @lg:w-5" />
                        Recent Sessions
                      </CardTitle>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Filter className="mr-2 h-4 w-4" />
                            Filter
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80" align="end">
                          <div className="space-y-4">
                            <div>
                              <Label className="text-sm font-medium">
                                Category
                              </Label>
                              <Select
                                value={filterCategoryId}
                                onValueChange={setFilterCategoryId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="All categories" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">
                                    All categories
                                  </SelectItem>
                                  {categories.map((category) => (
                                    <SelectItem
                                      key={category.id}
                                      value={category.id}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div
                                          className={cn(
                                            'h-3 w-3 rounded-full',
                                            getCategoryColor(
                                              category.color || 'BLUE'
                                            )
                                          )}
                                        />
                                        {category.name}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-sm font-medium">
                                Task
                              </Label>
                              <Select
                                value={filterTaskId}
                                onValueChange={setFilterTaskId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="All tasks" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">All tasks</SelectItem>
                                  {tasks.map((task) => (
                                    <SelectItem key={task.id} value={task.id!}>
                                      {task.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {filteredSessions.length === 0 ? (
                      <div className="py-8 text-center">
                        <div className="relative mx-auto mb-3 h-16 w-16">
                          <Zap className="h-16 w-16 text-muted-foreground/50" />
                          {recentSessions.length === 0 && (
                            <Sparkles className="absolute -top-1 -right-1 h-6 w-6 animate-pulse text-primary" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground @lg:text-base">
                          {recentSessions.length === 0
                            ? 'Ready to start tracking time?'
                            : 'No sessions match your filters'}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground @lg:text-sm">
                          {recentSessions.length === 0
                            ? 'Start your first timer to see your productivity journey!'
                            : 'Try adjusting your filters above'}
                        </p>
                        {recentSessions.length === 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveTab('current')}
                            className="mt-4"
                          >
                            <Play className="mr-2 h-4 w-4" />
                            Start First Timer
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="max-h-96 space-y-3 overflow-y-auto @lg:max-h-[500px]">
                        {filteredSessions.map((session) => (
                          <div
                            key={session.id}
                            className={cn(
                              'group relative rounded-lg border p-3 transition-all hover:bg-accent/50 hover:shadow-sm @lg:p-4',
                              justCompleted?.id === session.id &&
                                'bg-green-50 ring-2 ring-green-500 duration-500 animate-in slide-in-from-top dark:bg-green-950/20'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <h4 className="truncate text-sm font-medium @lg:text-base">
                                  {session.title}
                                </h4>
                                {session.description && (
                                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground @lg:text-sm">
                                    {session.description}
                                  </p>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-1 @lg:gap-2">
                                  {session.category && (
                                    <Badge
                                      variant="secondary"
                                      className={cn(
                                        'text-xs @lg:text-sm',
                                        getCategoryColor(
                                          session.category.color || 'BLUE'
                                        )
                                      )}
                                    >
                                      {session.category.name}
                                    </Badge>
                                  )}
                                  {session.task && (
                                    <div className="flex items-center gap-1.5 rounded-md border border-dynamic-blue/20 bg-gradient-to-r from-dynamic-blue/10 to-dynamic-blue/5 px-2 py-1">
                                      <CheckCircle className="h-3 w-3 text-dynamic-blue" />
                                      <span className="text-xs font-medium text-dynamic-blue @lg:text-sm">
                                        {session.task.name}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                {session.task &&
                                  (() => {
                                    const taskWithDetails = tasks.find(
                                      (t) => t.id === session.task?.id
                                    );
                                    return taskWithDetails?.board_name &&
                                      taskWithDetails?.list_name ? (
                                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                          <MapPin className="h-3 w-3" />
                                          <span>
                                            {taskWithDetails.board_name}
                                          </span>
                                        </div>
                                        <span>•</span>
                                        <div className="flex items-center gap-1">
                                          <Tag className="h-3 w-3" />
                                          <span>
                                            {taskWithDetails.list_name}
                                          </span>
                                        </div>
                                      </div>
                                    ) : null;
                                  })()}
                              </div>

                              <div className="flex items-start gap-2">
                                <div className="text-right">
                                  <p className="text-sm font-medium @lg:text-base">
                                    {session.duration_seconds
                                      ? formatDuration(session.duration_seconds)
                                      : '-'}
                                  </p>
                                  <p className="text-xs text-muted-foreground @lg:text-sm">
                                    {new Date(
                                      session.start_time
                                    ).toLocaleDateString()}
                                  </p>
                                </div>

                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => resumeSession(session)}
                                      disabled={
                                        actionStates[`resume-${session.id}`]
                                      }
                                    >
                                      {actionStates[`resume-${session.id}`] ? (
                                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                      ) : (
                                        <RotateCcw className="mr-2 h-4 w-4" />
                                      )}
                                      Start New Session
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => duplicateSession(session)}
                                    >
                                      <Copy className="mr-2 h-4 w-4" />
                                      Duplicate
                                    </DropdownMenuItem>
                                    {/* <DropdownMenuItem
                                      onClick={() => openEditDialog(session)}
                                    >
                                      <Edit className="mr-2 h-4 w-4" />
                                      Edit Session
                                    </DropdownMenuItem> */}
                                    <Separator />
                                    <DropdownMenuItem
                                      onClick={() =>
                                        setSessionToDelete(session)
                                      }
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete Session
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* History Tab - Same as recent but with different API call */}
              <TabsContent value="history" className="@container space-y-4">
                <Card className="transition-all hover:shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base @lg:text-lg">
                      <History className="h-4 w-4 @lg:h-5 @lg:w-5" />
                      Session History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="py-8 text-center">
                      <History className="mx-auto mb-3 h-8 w-8 text-muted-foreground @lg:h-12 @lg:w-12" />
                      <p className="text-sm text-muted-foreground @lg:text-base">
                        Full history view coming soon
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground @lg:text-sm">
                        Advanced filtering, date ranges, and export features
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit Session Dialog */}
      <Dialog
        open={!!sessionToEdit}
        onOpenChange={() => setSessionToEdit(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Session</DialogTitle>
            <DialogDescription>
              Modify the details of this time tracking session
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Session title"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="edit-category">Category</Label>
                <Select
                  value={editCategoryId}
                  onValueChange={setEditCategoryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No category</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-task">Task</Label>
                <Select value={editTaskId} onValueChange={setEditTaskId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select task" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No task</SelectItem>
                    {tasks.map((task) => (
                      <SelectItem key={task.id} value={task.id!}>
                        {task.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {sessionToEdit && !sessionToEdit.is_running && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="edit-start-time">Start Time</Label>
                  <Input
                    id="edit-start-time"
                    type="datetime-local"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-end-time">End Time</Label>
                  <Input
                    id="edit-end-time"
                    type="datetime-local"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setSessionToEdit(null)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={saveEdit}
                disabled={isEditing || !editTitle.trim()}
                className="flex-1"
              >
                {isEditing ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!sessionToDelete}
        onOpenChange={() => setSessionToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Time Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the session "
              {sessionToDelete?.title}"? This action cannot be undone and will
              permanently remove the tracked time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteSession}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Session'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </>
  );
}
