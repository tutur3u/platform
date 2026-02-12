'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  History,
  MapPin,
  Play,
  RotateCcw,
  Sparkles,
  Tag,
  Timer,
} from '@tuturuuu/icons';
import type { TimeTrackingCategory } from '@tuturuuu/types';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '../../../badge';
import { Button } from '../../../button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../dialog';
import { Input } from '../../../input';
import { Label } from '../../../label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../select';
import { toast } from '../../../sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../tabs';
import { Textarea } from '../../../textarea';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
} from '../../../time-tracker/types';
import { ActiveSessionCard, StatsCards } from './components';
import {
  CreateTaskDialog,
  DeleteSessionDialog,
  EditSessionDialog,
} from './dialogs';
import { useSessions, useTimeTracker } from './hooks';
import { HistoryTab, RecentSessionsTab } from './tabs';
import { TimeTrackerTrigger } from './time-tracker-trigger';
import { formatDuration, getCategoryColor } from './utils';

interface TaskBoard {
  id: string;
  name: string;
  task_lists: { id: string; name: string; color: string }[];
}

interface TimeTrackerProps {
  wsId: string;
  tasks?: ExtendedWorkspaceTask[];
}

export default function TimeTracker({ wsId, tasks = [] }: TimeTrackerProps) {
  const tracker = useTimeTracker({ wsId, tasks });
  const sessions = useSessions({ wsId, onSuccess: tracker.fetchData });

  // Form state
  const [sessionMode, setSessionMode] = useState<'task' | 'manual'>('task');
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDescription, setNewSessionDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [showTaskSuggestion, setShowTaskSuggestion] = useState(false);

  // Task creation state
  const [showTaskCreation, setShowTaskCreation] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // Fetch boards with useQuery
  const { data: boardsData } = useQuery({
    queryKey: ['workspace', wsId, 'boards-with-lists'],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/boards-with-lists`
      );
      if (!response.ok) throw new Error('Failed to fetch boards');
      return response.json();
    },
    enabled: tracker.isOpen,
  });

  const boards: TaskBoard[] = boardsData?.boards || [];

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

  // Handle session mode change
  const handleSessionModeChange = (mode: 'task' | 'manual') => {
    setSessionMode(mode);
    setNewSessionTitle('');
    setNewSessionDescription('');
    setSelectedTaskId('');
    setShowTaskSuggestion(false);
    setSelectedCategoryId('');
  };

  // Handle manual title change
  const handleManualTitleChange = (title: string) => {
    setNewSessionTitle(title);
    const matchingTask = tasks.find(
      (task) =>
        task.name?.toLowerCase().includes(title.toLowerCase()) &&
        title.length > 2
    );
    if (matchingTask && title.length > 2) {
      setSelectedTaskId(matchingTask.id || '');
      setShowTaskSuggestion(false);
    } else if (title.length > 2 && !selectedTaskId) {
      setShowTaskSuggestion(true);
    } else {
      setShowTaskSuggestion(false);
    }
  };

  // Reset form
  const resetForm = useCallback(() => {
    setNewSessionTitle('');
    setNewSessionDescription('');
    setSelectedCategoryId('');
    setSelectedTaskId('');
    setShowTaskSuggestion(false);
  }, []);

  // Start timer
  const handleStartTimer = useCallback(async () => {
    if (sessionMode === 'task' && selectedTaskId) {
      const selectedTask = tasks.find((t) => t.id === selectedTaskId);
      if (selectedTask) {
        await tracker.startTimerWithTask(
          selectedTaskId,
          selectedTask.name || 'Untitled Task',
          newSessionDescription,
          selectedCategoryId
        );
        resetForm();
        return;
      }
    }

    if (sessionMode === 'task' && !selectedTaskId) {
      setShowTaskCreation(true);
      return;
    }

    await tracker.startTimer({
      title: newSessionTitle,
      description: newSessionDescription,
      categoryId: selectedCategoryId,
      taskId: selectedTaskId,
    });
    resetForm();
  }, [
    sessionMode,
    selectedTaskId,
    tasks,
    tracker,
    newSessionDescription,
    selectedCategoryId,
    newSessionTitle,
    resetForm,
  ]);

  // Create task
  const handleCreateTask = async () => {
    if (!newTaskName.trim() || !selectedListId) {
      toast.error('Please enter a task name and select a list');
      return;
    }

    setIsCreatingTask(true);

    try {
      const response = await fetch(`/api/v1/workspaces/${wsId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTaskName,
          description: newTaskDescription || null,
          listId: selectedListId,
        }),
      });

      if (!response.ok) throw new Error('Failed to create task');

      const data = await response.json();
      const newTask = data.task;

      setSelectedTaskId(newTask.id);
      if (sessionMode === 'task') {
        setNewSessionTitle(`Working on: ${newTask.name}`);
      }

      setShowTaskCreation(false);
      setNewTaskName('');
      setNewTaskDescription('');
      setSelectedBoardId('');
      setSelectedListId('');

      toast.success(`Task "${newTask.name}" created successfully!`);

      if (sessionMode === 'task') {
        await tracker.startTimerWithTask(newTask.id, newTask.name);
        resetForm();
      }
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    } finally {
      setIsCreatingTask(false);
    }
  };

  // Handle duplicate
  const handleDuplicate = (session: SessionWithRelations) => {
    const settings = sessions.duplicateSession(session);
    setNewSessionTitle(settings.title);
    setNewSessionDescription(settings.description);
    setSelectedCategoryId(settings.categoryId);
    setSelectedTaskId(settings.taskId);
    tracker.setActiveTab('current');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!tracker.isOpen) return;

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (tracker.isRunning) {
          tracker.stopTimer();
        } else if (newSessionTitle.trim() || selectedTaskId) {
          handleStartTimer();
        }
      }

      if (event.key === 'Escape') {
        tracker.setIsOpen(false);
      }

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === 'p' &&
        tracker.isRunning
      ) {
        event.preventDefault();
        tracker.pauseTimer();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [tracker, newSessionTitle, selectedTaskId, handleStartTimer]);

  return (
    <>
      <Dialog open={tracker.isOpen} onOpenChange={tracker.setIsOpen}>
        <DialogTrigger asChild>
          <TimeTrackerTrigger
            isRunning={tracker.isRunning}
            elapsedTime={tracker.elapsedTime}
            onClick={() => tracker.setIsOpen(true)}
          />
        </DialogTrigger>

        <DialogContent className="@container max-h-[95vh] max-w-7xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              Time Tracker
            </DialogTitle>
            <DialogDescription className="space-y-1">
              <span>Track your time across tasks and projects</span>
              <span className="mt-2 text-muted-foreground text-xs">
                <br />-{' '}
                <kbd className="rounded bg-muted px-1 py-0.5 text-xs">
                  Cmd/Ctrl+Enter
                </kbd>{' '}
                start/stop
                <br />-{' '}
                <kbd className="rounded bg-muted px-1 py-0.5 text-xs">
                  Cmd/Ctrl+P
                </kbd>{' '}
                pause
                <br />-{' '}
                <kbd className="rounded bg-muted px-1 py-0.5 text-xs">Esc</kbd>{' '}
                close
              </span>
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={tracker.activeTab}
            onValueChange={(v) => tracker.setActiveTab(v as any)}
          >
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

            <div className="grid @5xl:grid-cols-2 grid-cols-1 gap-6">
              {/* Current Session Tab */}
              <TabsContent value="current" className="@container space-y-4">
                <Card className="transition-all hover:shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 @lg:text-lg text-base">
                      <Clock className="@lg:h-5 h-4 @lg:w-5 w-4" />
                      Current Session
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {tracker.currentSession ? (
                      <ActiveSessionCard
                        session={tracker.currentSession}
                        elapsedTime={tracker.elapsedTime}
                        isLoading={tracker.isLoading}
                        onPause={tracker.pauseTimer}
                        onStop={tracker.stopTimer}
                        tasks={tasks}
                      />
                    ) : (
                      <NewSessionForm
                        sessionMode={sessionMode}
                        onSessionModeChange={handleSessionModeChange}
                        newSessionTitle={newSessionTitle}
                        setNewSessionTitle={setNewSessionTitle}
                        newSessionDescription={newSessionDescription}
                        setNewSessionDescription={setNewSessionDescription}
                        selectedCategoryId={selectedCategoryId}
                        setSelectedCategoryId={setSelectedCategoryId}
                        selectedTaskId={selectedTaskId}
                        onTaskSelectionChange={handleTaskSelectionChange}
                        showTaskSuggestion={showTaskSuggestion}
                        onManualTitleChange={handleManualTitleChange}
                        onCreateTaskFromManual={() => {
                          setNewTaskName(newSessionTitle);
                          setShowTaskCreation(true);
                          setShowTaskSuggestion(false);
                        }}
                        onStartTimer={handleStartTimer}
                        isLoading={tracker.isLoading}
                        tasks={tasks}
                        categories={tracker.categories}
                        recentSessions={tracker.recentSessions}
                        templates={tracker.templates}
                        onDuplicate={handleDuplicate}
                      />
                    )}
                  </CardContent>
                </Card>

                {tracker.justCompleted && (
                  <CompletionCelebration
                    session={tracker.justCompleted}
                    onClose={tracker.clearJustCompleted}
                  />
                )}

                <StatsCards stats={tracker.timerStats} />
              </TabsContent>

              {/* Recent Sessions Tab */}
              <TabsContent value="recent" className="@container space-y-4">
                <RecentSessionsTab
                  sessions={tracker.recentSessions}
                  categories={tracker.categories}
                  tasks={tasks}
                  justCompletedId={tracker.justCompleted?.id}
                  actionStates={tracker.actionStates}
                  onResume={tracker.resumeSession}
                  onDuplicate={handleDuplicate}
                  onDelete={sessions.setSessionToDelete}
                  onSwitchToCurrentTab={() => tracker.setActiveTab('current')}
                />
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history" className="@container space-y-4">
                <HistoryTab />
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Dialogs */}
      <EditSessionDialog
        session={sessions.sessionToEdit}
        onClose={() => sessions.setSessionToEdit(null)}
        onSave={sessions.saveEdit}
        isEditing={sessions.isEditing}
        editData={sessions.editData}
        onEditDataChange={sessions.setEditData}
        categories={tracker.categories}
        tasks={tasks}
      />

      <DeleteSessionDialog
        session={sessions.sessionToDelete}
        onClose={() => sessions.setSessionToDelete(null)}
        onDelete={sessions.deleteSession}
        isDeleting={sessions.isDeleting}
      />

      <CreateTaskDialog
        isOpen={showTaskCreation}
        onClose={() => setShowTaskCreation(false)}
        onCreate={handleCreateTask}
        isCreating={isCreatingTask}
        taskName={newTaskName}
        setTaskName={setNewTaskName}
        taskDescription={newTaskDescription}
        setTaskDescription={setNewTaskDescription}
        boards={boards}
        selectedBoardId={selectedBoardId}
        setSelectedBoardId={setSelectedBoardId}
        selectedListId={selectedListId}
        setSelectedListId={setSelectedListId}
      />
    </>
  );
}

// New Session Form (inline component to keep file manageable)
function NewSessionForm({
  sessionMode,
  onSessionModeChange,
  newSessionTitle,
  setNewSessionTitle: _setNewSessionTitle,
  newSessionDescription,
  setNewSessionDescription,
  selectedCategoryId,
  setSelectedCategoryId,
  selectedTaskId,
  onTaskSelectionChange,
  showTaskSuggestion,
  onManualTitleChange,
  onCreateTaskFromManual,
  onStartTimer,
  isLoading,
  tasks,
  categories,
  recentSessions,
  templates,
  onDuplicate,
}: {
  sessionMode: 'task' | 'manual';
  onSessionModeChange: (mode: 'task' | 'manual') => void;
  newSessionTitle: string;
  setNewSessionTitle: (v: string) => void;
  newSessionDescription: string;
  setNewSessionDescription: (v: string) => void;
  selectedCategoryId: string;
  setSelectedCategoryId: (v: string) => void;
  selectedTaskId: string;
  onTaskSelectionChange: (taskId: string) => void;
  showTaskSuggestion: boolean;
  onManualTitleChange: (title: string) => void;
  onCreateTaskFromManual: () => void;
  onStartTimer: () => void;
  isLoading: boolean;
  tasks: ExtendedWorkspaceTask[];
  categories: TimeTrackingCategory[];
  recentSessions: SessionWithRelations[];
  templates: { title: string; usage_count: number }[];
  onDuplicate: (session: SessionWithRelations) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed @lg:p-6 p-4 text-center">
        <Clock className="mx-auto mb-2 @lg:h-12 h-8 @lg:w-12 w-8 text-muted-foreground" />
        <p className="@lg:text-base text-muted-foreground text-sm">
          Ready to start tracking time
        </p>
      </div>

      {/* Session Mode Toggle */}
      <Tabs
        value={sessionMode}
        onValueChange={(v) => onSessionModeChange(v as 'task' | 'manual')}
      >
        <TabsList className="grid h-full w-full grid-cols-2 bg-muted/50">
          <TabsTrigger
            value="task"
            className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <CheckCircle className="h-4 w-4" />
            <div className="flex flex-col items-start">
              <span className="font-medium text-sm">Task-based</span>
              <span className="text-muted-foreground text-xs">
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
              <span className="font-medium text-sm">Manual</span>
              <span className="text-muted-foreground text-xs">
                Free-form entry
              </span>
            </div>
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="task"
          className="fade-in-50 slide-in-from-bottom-2 animate-in space-y-4 duration-300"
        >
          <div className="space-y-3">
            <Label className="font-medium text-sm">
              Select a task to track time for:
            </Label>
            <Select
              value={selectedTaskId}
              onValueChange={onTaskSelectionChange}
            >
              <SelectTrigger className="@lg:text-base text-sm transition-all duration-200">
                <SelectValue placeholder="Choose a task or create new..." />
              </SelectTrigger>
              <SelectContent className="w-100">
                {tasks.map((task) => (
                  <SelectItem
                    key={task.id}
                    value={task.id || ''}
                    className="p-0"
                  >
                    <div className="flex w-full items-start gap-3 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/20 to-dynamic-blue/10">
                        <CheckCircle className="h-4 w-4 text-dynamic-blue" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {task.name}
                          </span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                        {task.board_name && task.list_name && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium text-xs">
                                {task.board_name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 rounded-md border border-dynamic-green/20 bg-linear-to-r from-dynamic-green/10 to-dynamic-green/5 px-2 py-1">
                              <Tag className="h-3 w-3 text-dynamic-green" />
                              <span className="font-medium text-dynamic-green text-xs">
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
          </div>

          <Textarea
            placeholder="Add session notes (optional)"
            value={newSessionDescription}
            onChange={(e) => setNewSessionDescription(e.target.value)}
            rows={2}
            className="@lg:text-base text-sm"
          />

          <CategorySelect
            categories={categories}
            value={selectedCategoryId}
            onChange={setSelectedCategoryId}
          />

          <Button
            onClick={onStartTimer}
            disabled={isLoading}
            className="w-full border border-border bg-muted text-foreground hover:border-accent hover:bg-muted/80"
            size="lg"
          >
            <Play className="mr-2 h-4 w-4" />
            {selectedTaskId ? 'Start Timer' : 'Create Task & Start Timer'}
          </Button>
        </TabsContent>

        <TabsContent
          value="manual"
          className="fade-in-50 slide-in-from-bottom-2 animate-in space-y-4 duration-300"
        >
          <div className="space-y-2">
            <Input
              placeholder="What are you working on?"
              value={newSessionTitle}
              onChange={(e) => onManualTitleChange(e.target.value)}
              className="@lg:text-base text-sm"
              autoFocus={sessionMode === 'manual'}
            />

            {showTaskSuggestion && newSessionTitle.length > 2 && (
              <TaskSuggestionCard
                title={newSessionTitle}
                onCreateTask={onCreateTaskFromManual}
              />
            )}

            {selectedTaskId && !showTaskSuggestion && (
              <LinkedTaskCard
                task={tasks.find((t) => t.id === selectedTaskId)}
                onUnlink={() => onTaskSelectionChange('')}
              />
            )}
          </div>

          <Textarea
            placeholder="Add description (optional)"
            value={newSessionDescription}
            onChange={(e) => setNewSessionDescription(e.target.value)}
            rows={3}
            className="@lg:text-base text-sm"
          />

          <CategorySelect
            categories={categories}
            value={selectedCategoryId}
            onChange={setSelectedCategoryId}
          />

          <Button
            onClick={onStartTimer}
            disabled={!newSessionTitle.trim() || isLoading}
            className="w-full border border-border bg-muted text-foreground hover:border-accent hover:bg-muted/80"
            size="lg"
          >
            <Play className="mr-2 h-4 w-4" />
            Start Timer
          </Button>
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      {(recentSessions.length > 0 || templates.length > 0) && (
        <QuickActions
          recentSessions={recentSessions}
          templates={templates}
          onDuplicate={onDuplicate}
        />
      )}
    </div>
  );
}

// Helper components
function CategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: TimeTrackingCategory[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="@lg:text-base text-sm">
        <SelectValue placeholder="Category (optional)" />
      </SelectTrigger>
      <SelectContent>
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
  );
}

function TaskSuggestionCard({
  title,
  onCreateTask,
}: {
  title: string;
  onCreateTask: () => void;
}) {
  return (
    <div className="rounded-lg border border-dynamic-blue/30 bg-linear-to-r from-dynamic-blue/10 to-dynamic-blue/5 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <div className="rounded-full bg-dynamic-blue/20 p-1">
            <Sparkles className="h-3 w-3 text-dynamic-blue" />
          </div>
          <div className="flex-1">
            <span className="font-medium text-dynamic-blue text-sm">
              Convert to task?
            </span>
            <p className="mt-0.5 text-muted-foreground text-xs">
              Create "{title}" as a new task for better organization.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onCreateTask}
          className="h-8 border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue text-xs hover:bg-dynamic-blue/20"
        >
          Create Task
        </Button>
      </div>
    </div>
  );
}

function LinkedTaskCard({
  task,
  onUnlink,
}: {
  task?: ExtendedWorkspaceTask;
  onUnlink: () => void;
}) {
  if (!task) return null;

  return (
    <div className="rounded-lg border border-dynamic-green/30 bg-linear-to-r from-dynamic-green/5 to-dynamic-green/3 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-dynamic-green/30 bg-linear-to-br from-dynamic-green/20 to-dynamic-green/10">
          <CheckCircle className="h-5 w-5 text-dynamic-green" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-dynamic-green text-sm">
              Task Linked
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onUnlink}
              className="h-7 px-2 text-muted-foreground text-xs hover:text-foreground"
            >
              Unlink
            </Button>
          </div>
          <p className="font-medium text-foreground text-sm">{task.name}</p>
          {task.board_name && task.list_name && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium text-xs">{task.board_name}</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md border border-dynamic-green/20 bg-linear-to-r from-dynamic-green/10 to-dynamic-green/5 px-2 py-1">
                <Tag className="h-3 w-3 text-dynamic-green" />
                <span className="font-medium text-dynamic-green text-xs">
                  {task.list_name}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickActions({
  recentSessions,
  templates,
  onDuplicate,
}: {
  recentSessions: SessionWithRelations[];
  templates: { title: string; usage_count: number }[];
  onDuplicate: (session: SessionWithRelations) => void;
}) {
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground text-xs">Quick Start:</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowMore(!showMore)}
          className="h-6 px-2 text-xs"
        >
          {showMore ? 'Less' : 'More'}
        </Button>
      </div>

      <div className="space-y-2">
        {recentSessions.length > 0 && recentSessions[0] && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDuplicate(recentSessions[0]!)}
            className="w-full justify-start text-xs"
          >
            <RotateCcw className="mr-2 h-3 w-3" />
            Repeat: {recentSessions[0].title}
          </Button>
        )}

        {showMore &&
          templates.slice(0, 3).map((template) => (
            <Button
              key={`template-${template.title}`}
              variant="outline"
              size="sm"
              className="w-full justify-start text-xs"
            >
              <Copy className="mr-2 h-3 w-3" />
              {template.title}
              <Badge variant="secondary" className="ml-auto text-xs">
                {template.usage_count}x
              </Badge>
            </Button>
          ))}
      </div>
    </div>
  );
}

function CompletionCelebration({
  session,
  onClose,
}: {
  session: SessionWithRelations;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fade-in fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/20 backdrop-blur-sm duration-300">
      <div className="zoom-in animate-in rounded-lg border bg-background p-6 shadow-xl duration-300">
        <div className="text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12 animate-pulse text-dynamic-green" />
          <h3 className="mb-2 font-semibold text-lg">Session Completed!</h3>
          <p className="mb-1 text-muted-foreground">{session.title}</p>
          <p className="font-medium text-dynamic-green text-sm">
            {formatDuration(session.duration_seconds || 0)} tracked
          </p>
        </div>
      </div>
    </div>
  );
}
