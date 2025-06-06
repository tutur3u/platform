'use client';

import type {
  TimeTrackingCategory,
  TimeTrackingSession,
  WorkspaceTask,
} from '@ncthub/types/db';
import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@ncthub/ui/card';
import {
  CheckCircle,
  Clock,
  Copy,
  Pause,
  Play,
  Square,
  Timer,
} from '@ncthub/ui/icons';
import { Input } from '@ncthub/ui/input';
import { Label } from '@ncthub/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ncthub/ui/select';
import { toast } from '@ncthub/ui/sonner';
import { Textarea } from '@ncthub/ui/textarea';
import { cn } from '@ncthub/utils/format';
import { useCallback, useEffect, useState } from 'react';

interface SessionWithRelations extends TimeTrackingSession {
  category?: TimeTrackingCategory;
  task?: WorkspaceTask;
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

interface TimerControlsProps {
  wsId: string;
  currentSession: SessionWithRelations | null;
  setCurrentSession: (session: SessionWithRelations | null) => void;
  elapsedTime: number;
  setElapsedTime: (time: number) => void;
  isRunning: boolean;
  setIsRunning: (running: boolean) => void;
  categories: TimeTrackingCategory[];
  tasks: Partial<WorkspaceTask>[];
  onSessionUpdate: () => void;
  formatTime: (seconds: number) => string;
  formatDuration: (seconds: number) => string;
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
  const [templates, setTemplates] = useState<SessionTemplate[]>([]);
  const [justCompleted, setJustCompleted] =
    useState<SessionWithRelations | null>(null);

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
  }, [fetchTemplates]);

  // Start timer
  const startTimer = async () => {
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
      RED: 'bg-red-500',
      BLUE: 'bg-blue-500',
      GREEN: 'bg-green-500',
      YELLOW: 'bg-yellow-500',
      ORANGE: 'bg-orange-500',
      PURPLE: 'bg-purple-500',
      PINK: 'bg-pink-500',
      INDIGO: 'bg-indigo-500',
      CYAN: 'bg-cyan-500',
      GRAY: 'bg-gray-500',
    };
    return colorMap[color] || 'bg-blue-500';
  };

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
  }, [isRunning, newSessionTitle]);

  return (
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
                      getCategoryColor(currentSession.category.color || 'BLUE')
                    )}
                  >
                    {currentSession.category.name}
                  </Badge>
                )}
                {currentSession.task && (
                  <Badge variant="outline" className="text-sm">
                    {currentSession.task.name}
                  </Badge>
                )}
              </div>
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

            <div className="space-y-4">
              <div>
                <Label htmlFor="session-title">What are you working on?</Label>
                <Input
                  id="session-title"
                  placeholder="Enter session title..."
                  value={newSessionTitle}
                  onChange={(e) => setNewSessionTitle(e.target.value)}
                  className="mt-1"
                />
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="category-select">Category</Label>
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

                <div>
                  <Label htmlFor="task-select">Task (optional)</Label>
                  <Select
                    value={selectedTaskId}
                    onValueChange={setSelectedTaskId}
                  >
                    <SelectTrigger id="task-select" className="mt-1">
                      <SelectValue placeholder="Link to task" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No task</SelectItem>
                      {tasks.map((task) => (
                        <SelectItem key={task.id} value={task.id!}>
                          {task.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
          </div>
        )}
      </CardContent>

      {/* Completion Celebration */}
      {justCompleted && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-black/20 backdrop-blur-sm duration-300 animate-in fade-in">
          <div className="rounded-lg border bg-background p-6 shadow-xl duration-300 animate-in zoom-in">
            <div className="text-center">
              <CheckCircle className="mx-auto mb-4 h-12 w-12 animate-pulse text-green-500" />
              <h3 className="mb-2 text-lg font-semibold">Session Completed!</h3>
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
  );
}
