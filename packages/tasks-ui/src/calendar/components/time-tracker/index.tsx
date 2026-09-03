'use client';

import {
  CheckCircle,
  Clock,
  ExternalLink,
  History,
  MapPin,
  Play,
  Tag,
  Timer,
} from '@tuturuuu/icons';
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
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
} from '@tuturuuu/ui/time-tracker/types';
import { usePlatform } from '@tuturuuu/utils/hooks/use-platform';
import { useCallback, useEffect, useState } from 'react';
import { ActiveSessionCard, StatsCards } from './components';
import {
  CategorySelect,
  CompletionCelebration,
  LinkedTaskCard,
  QuickActions,
  TaskSuggestionCard,
} from './components/new-session-support';
import {
  CreateTaskDialog,
  DeleteSessionDialog,
  EditSessionDialog,
} from './dialogs';
import { useSessions, useTimeTracker } from './hooks';
import { HistoryTab, RecentSessionsTab } from './tabs';
import { TimeTrackerTrigger } from './time-tracker-trigger';
import type { NewSessionFormProps, TaskBoard } from './types';

interface TimeTrackerProps {
  wsId: string;
  tasks?: ExtendedWorkspaceTask[];
}

export default function TimeTracker({ wsId, tasks = [] }: TimeTrackerProps) {
  const { modKey } = usePlatform();
  const tracker = useTimeTracker({ wsId, tasks });
  const sessions = useSessions({ wsId, onSuccess: tracker.fetchData });

  const [sessionMode, setSessionMode] = useState<'task' | 'manual'>('task');
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [newSessionDescription, setNewSessionDescription] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [showTaskSuggestion, setShowTaskSuggestion] = useState(false);

  const [showTaskCreation, setShowTaskCreation] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const [boards, setBoards] = useState<TaskBoard[]>([]);

  useEffect(() => {
    if (!tracker.isOpen) return;
    void fetch(`/api/v1/workspaces/${wsId}/boards-with-lists`, {
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to fetch boards');
        return response.json();
      })
      .then((data) => setBoards(data.boards || []))
      .catch((error) => {
        console.error('Error fetching boards:', error);
        toast.error('Failed to load boards');
      });
  }, [tracker.isOpen, wsId]);

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

  const handleSessionModeChange = (mode: 'task' | 'manual') => {
    setSessionMode(mode);
    setNewSessionTitle('');
    setNewSessionDescription('');
    setSelectedTaskId('');
    setShowTaskSuggestion(false);
    setSelectedCategoryId('');
    toast.success(
      mode === 'manual'
        ? 'Switched to manual mode - start typing freely!'
        : 'Switched to task-based mode - select or create a task!',
      { duration: 2000 }
    );
  };

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

  const resetForm = useCallback(() => {
    setNewSessionTitle('');
    setNewSessionDescription('');
    setSelectedCategoryId('');
    setSelectedTaskId('');
    setShowTaskSuggestion(false);
  }, []);

  const handleStartTimer = useCallback(async () => {
    if (sessionMode === 'task' && selectedTaskId) {
      const selectedTask = tasks.find((t) => t.id === selectedTaskId);
      if (selectedTask) {
        const started = await tracker.startTimerWithTask(
          selectedTaskId,
          selectedTask.name || 'Untitled Task',
          newSessionDescription,
          selectedCategoryId
        );
        if (started) resetForm();
        return;
      }
    }

    if (sessionMode === 'task' && !selectedTaskId) {
      setShowTaskCreation(true);
      return;
    }

    const started = await tracker.startTimer({
      title: newSessionTitle,
      description: newSessionDescription,
      categoryId: selectedCategoryId,
      taskId: selectedTaskId,
    });
    if (started) resetForm();
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

  const handleCreateTask = async () => {
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
      setShowTaskSuggestion(false);

      toast.success(`Task "${newTask.name}" created successfully!`);

      if (sessionMode === 'task') {
        const started = await tracker.startTimerWithTask(
          newTask.id,
          newTask.name,
          newSessionDescription,
          selectedCategoryId
        );
        if (started) resetForm();
      }
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error('Failed to create task');
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleDuplicate = (session: SessionWithRelations) => {
    const settings = sessions.duplicateSession(session);
    setNewSessionTitle(settings.title);
    setNewSessionDescription(settings.description);
    setSelectedCategoryId(settings.categoryId);
    setSelectedTaskId(settings.taskId);
    tracker.setActiveTab('current');
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!tracker.isOpen) return;

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (tracker.isRunning) {
          tracker.stopTimer();
        } else if (newSessionTitle.trim()) {
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
  }, [tracker, newSessionTitle, handleStartTimer]);

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
              <span>
                Track your time across tasks and projects with detailed
                analytics
              </span>
              <span className="mt-2 text-muted-foreground text-xs">
                <br />-{' '}
                <kbd className="rounded bg-muted px-1 py-0.5 text-xs">
                  {modKey} + Enter
                </kbd>{' '}
                to start/stop
                <br />-{' '}
                <kbd className="rounded bg-muted px-1 py-0.5 text-xs">
                  {modKey} + P
                </kbd>{' '}
                to pause
                <br />-{' '}
                <kbd className="rounded bg-muted px-1 py-0.5 text-xs">Esc</kbd>{' '}
                to close
              </span>
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={tracker.activeTab}
            onValueChange={(v) =>
              tracker.setActiveTab(v as 'current' | 'recent' | 'history')
            }
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
                        onTemplate={(template) => {
                          void tracker.startTimer({
                            title: template.title,
                            description: template.description,
                            categoryId: template.category_id,
                            taskId: template.task_id,
                          });
                        }}
                      />
                    )}
                  </CardContent>
                </Card>

                {tracker.justCompleted && (
                  <CompletionCelebration session={tracker.justCompleted} />
                )}

                <StatsCards stats={tracker.timerStats} />
              </TabsContent>

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

              <TabsContent value="history" className="@container space-y-4">
                <HistoryTab />
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

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
  onTemplate,
}: NewSessionFormProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed @lg:p-6 p-4 text-center">
        <Clock className="mx-auto mb-2 @lg:h-12 h-8 @lg:w-12 w-8 text-muted-foreground" />
        <p className="@lg:text-base text-muted-foreground text-sm">
          Ready to start tracking time
        </p>
      </div>

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
                        {task.description && (
                          <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                            {task.description}
                          </p>
                        )}
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
            {!selectedTaskId && (
              <p className="text-muted-foreground text-xs">
                No task selected? We'll help you create one!
              </p>
            )}
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
            className="w-full border border-border bg-muted text-foreground hover:border-accent hover:bg-muted/80 dark:bg-muted dark:text-foreground dark:hover:bg-accent"
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
                onUnlink={() => {
                  onTaskSelectionChange('');
                }}
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
            className="w-full border border-border bg-muted text-foreground hover:border-accent hover:bg-muted/80 dark:bg-muted dark:text-foreground dark:hover:bg-accent"
            size="lg"
          >
            <Play className="mr-2 h-4 w-4" />
            Start Timer
          </Button>
        </TabsContent>
      </Tabs>

      {(recentSessions.length > 0 || templates.length > 0) && (
        <QuickActions
          recentSessions={recentSessions}
          templates={templates}
          onDuplicate={onDuplicate}
          onTemplate={onTemplate}
        />
      )}
    </div>
  );
}
