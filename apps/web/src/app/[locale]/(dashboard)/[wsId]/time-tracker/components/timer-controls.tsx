'use client';

import type {
  TimeTrackingCategory,
  TimeTrackingSession,
  WorkspaceTask,
} from '@tuturuuu/types/db';
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
import { useCallback, useEffect, useState } from 'react';

interface ExtendedWorkspaceTask extends Partial<WorkspaceTask> {
  board_name?: string;
  list_name?: string;
}

interface SessionWithRelations extends TimeTrackingSession {
  category: TimeTrackingCategory | null;
  task: WorkspaceTask | null;
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
  apiCall: (url: string, options?: RequestInit) => Promise<any>;
}

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

  // Task creation state
  const [boards, setBoards] = useState<TaskBoard[]>([]);
  const [showTaskCreation, setShowTaskCreation] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

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
  const handleTaskSelectionChange = (taskId: string) => {
    setSelectedTaskId(taskId);
    if (taskId && taskId !== 'none') {
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
    setSelectedTaskId('none');
    setShowTaskSuggestion(false);

    // Reset any temporary states
    setSelectedCategoryId('none');

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
            categoryId:
              selectedCategoryId === 'none' ? null : selectedCategoryId || null,
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
  };

  // Start timer
  const startTimer = async () => {
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

      onSessionUpdate();
      toast.success('Timer paused');
    } catch (error) {
      console.error('Error pausing timer:', error);
      toast.error('Failed to pause timer');
    } finally {
      setIsLoading(false);
    }
  };

  // Start from template
  const startFromTemplate = async (template: SessionTemplate) => {
    setNewSessionTitle(template.title);
    setNewSessionDescription(template.description || '');
    setSelectedCategoryId(template.category_id || 'none');
    setSelectedTaskId(template.task_id || 'none');
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to start/stop timer
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (isRunning) {
          stopTimer();
        } else if (newSessionTitle.trim()) {
          startTimer();
        }
      }

      // Ctrl/Cmd + P to pause
      if ((event.ctrlKey || event.metaKey) && event.key === 'p' && isRunning) {
        event.preventDefault();
        pauseTimer();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isRunning, newSessionTitle, startTimer, stopTimer, pauseTimer]);

  return (
    <>
      <Card className="relative">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Time Tracker
          </CardTitle>
          <div className="space-y-1 text-sm text-muted-foreground">
            <span>Track your time with detailed analytics</span>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-muted px-1.5 py-0.5">
                ⌘/Ctrl + Enter
              </span>
              to start/stop
              <span className="rounded bg-muted px-1.5 py-0.5">⌘/Ctrl + P</span>
              to pause
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {currentSession ? (
            <div className="space-y-6 text-center">
              <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-red-50 to-red-100 p-6 dark:from-red-950/20 dark:to-red-900/20">
                <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-red-500/10 to-transparent opacity-30"></div>
                <div className="relative">
                  <div className="font-mono text-4xl font-bold text-red-600 transition-all duration-300 dark:text-red-400">
                    {formatTime(elapsedTime)}
                  </div>
                  <div className="mt-2 flex items-center justify-center gap-2 text-sm text-red-600/70 dark:text-red-400/70">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-red-500"></div>
                    Started at{' '}
                    {new Date(currentSession.start_time).toLocaleTimeString()}
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
          ) : (
            <div className="space-y-6">
              <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
                <Clock className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
                <p className="text-base text-muted-foreground">
                  Ready to start tracking time
                </p>
              </div>

              {/* Session Mode Toggle */}
              <Tabs
                value={sessionMode}
                onValueChange={(v) => handleSessionModeChange(v as any)}
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
                    <Select
                      value={selectedTaskId}
                      onValueChange={handleTaskSelectionChange}
                    >
                      <SelectTrigger>
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
                                {task.board_name && task.list_name && (
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

                    {(selectedTaskId === 'none' || !selectedTaskId) && (
                      <div className="text-center">
                        <p className="mb-2 text-sm text-muted-foreground">
                          No task selected? We'll help you create one!
                        </p>
                      </div>
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
                    className="w-full"
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
                    className="w-full"
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
                className="flex-1"
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
