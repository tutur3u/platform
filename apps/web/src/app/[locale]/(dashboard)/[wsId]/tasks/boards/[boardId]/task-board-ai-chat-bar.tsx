'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, MessageCircle, Plus, Sparkles, X } from '@tuturuuu/icons';
import {
  createWorkspaceTask,
  createWorkspaceTaskJournal,
  listWorkspaceTaskLists,
} from '@tuturuuu/internal-api/tasks';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { getActiveBroadcast } from '@tuturuuu/ui/tu-do/shared/board-broadcast-context';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ModeButton,
  TaskBoardMiraChatPopup,
  TaskBoardTaskComposer,
} from './task-board-ai-chat-bar-controls';
import type {
  TaskBoardAiChatBarMode,
  TaskBoardAiChatBarTask,
  TaskBoardAiChatBarUser,
} from './task-board-ai-chat-bar-types';
import { mergeCreatedTasks } from './task-board-ai-chat-bar-utils';

interface TaskBoardAiChatBarProps {
  assistantName: string;
  boardId: string;
  currentUser: TaskBoardAiChatBarUser;
  wsId: string;
}

export function TaskBoardAiChatBar({
  assistantName,
  boardId,
  currentUser,
  wsId,
}: TaskBoardAiChatBarProps) {
  const tCommon = useTranslations('common');
  const tMira = useTranslations('dashboard.mira_chat');
  const tTasks = useTranslations('ws-tasks');
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<TaskBoardAiChatBarMode>('task');
  const [taskInput, setTaskInput] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [aiTaskMode, setAiTaskMode] = useState(true);
  const [chatPanelResetKey, setChatPanelResetKey] = useState(0);

  const { data: lists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['task_lists', boardId],
    queryFn: async () => {
      const payload = await listWorkspaceTaskLists(wsId, boardId);
      return payload.lists ?? [];
    },
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
  });

  const activeLists = useMemo(
    () =>
      lists
        .filter((list) => !list.deleted)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [lists]
  );

  const defaultList = useMemo(
    () =>
      activeLists.find(
        (list) => list.status === 'not_started' || list.status === 'active'
      ) ??
      activeLists[0] ??
      null,
    [activeLists]
  );

  useEffect(() => {
    if (!defaultList) return;
    const selectedStillExists = activeLists.some(
      (list) => list.id === selectedListId
    );
    if (!selectedStillExists) {
      setSelectedListId(defaultList.id);
    }
  }, [activeLists, defaultList, selectedListId]);

  const selectedList = activeLists.find((list) => list.id === selectedListId);
  const canCreateTask = taskInput.trim().length > 0 && Boolean(selectedListId);

  const publishCreatedTasks = useCallback(
    (tasks: TaskBoardAiChatBarTask[]) => {
      if (!tasks.length) return;

      queryClient.setQueryData<TaskBoardAiChatBarTask[]>(
        ['tasks', boardId],
        (current) => mergeCreatedTasks(current, tasks)
      );
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      queryClient.invalidateQueries({
        queryKey: ['task-board', wsId, boardId],
      });

      const broadcast = getActiveBroadcast();
      for (const task of tasks) {
        broadcast?.('task:upsert', { task });
      }

      const tasksWithRelations = tasks
        .filter(
          (task) =>
            (task.assignee_ids?.length ?? 0) > 0 ||
            (task.label_ids?.length ?? 0) > 0 ||
            (task.project_ids?.length ?? 0) > 0
        )
        .map((task) => task.id);

      if (tasksWithRelations.length > 0) {
        broadcast?.('task:relations-changed', { taskIds: tasksWithRelations });
      }
    },
    [boardId, queryClient, wsId]
  );

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const entry = taskInput.trim();
      if (!entry || !selectedListId) return [];

      if (aiTaskMode) {
        const payload = await createWorkspaceTaskJournal(wsId, {
          entry,
          listId: selectedListId,
          assigneeIds: [currentUser.id],
          generateDescriptions: true,
          generateLabels: true,
          generatePriority: true,
          clientTimezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
          clientTimestamp: new Date().toISOString(),
        });
        return payload.tasks ?? [];
      }

      const payload = await createWorkspaceTask(wsId, {
        name: entry,
        listId: selectedListId,
        assignee_ids: [currentUser.id],
      });
      return payload.task ? [payload.task] : [];
    },
    onSuccess: (tasks) => {
      if (!tasks.length) {
        toast.error(tTasks('errors.failed_create_task'));
        return;
      }

      publishCreatedTasks(tasks);
      toast.success(
        tasks.length > 1
          ? tTasks('tasks_created_successfully')
          : tTasks('task_created_successfully')
      );
      setTaskInput('');
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : tTasks('errors.failed_create_task')
      );
    },
  });

  const handleTaskSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canCreateTask || createTaskMutation.isPending) return;
    createTaskMutation.mutate();
  };

  const userName =
    currentUser.display_name || currentUser.full_name || currentUser.email;

  return (
    <TooltipProvider>
      <div className="pointer-events-none fixed inset-x-3 bottom-4 z-40 flex justify-center sm:bottom-6">
        <div
          className={cn(
            'pointer-events-auto flex w-full max-w-3xl flex-col items-stretch transition-[max-width] duration-300',
            expanded && mode === 'chat' && 'max-w-5xl'
          )}
        >
          {expanded && mode === 'chat' && (
            <TaskBoardMiraChatPopup
              assistantName={assistantName}
              boardId={boardId}
              chatPanelResetKey={chatPanelResetKey}
              currentUser={currentUser}
              onResetPanelState={() =>
                setChatPanelResetKey((current) => current + 1)
              }
              userName={userName ?? undefined}
              wsId={wsId}
            />
          )}

          <div
            className={cn(
              'overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/90 shadow-2xl backdrop-blur-xl',
              'transition-[width,opacity,transform] duration-300',
              expanded ? 'w-full' : 'mx-auto w-full max-w-2xl'
            )}
          >
            <div className="flex items-center gap-2 px-2 py-2 sm:px-3">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-full px-2 py-1.5 text-left transition hover:bg-muted/70"
                onClick={() => setExpanded(true)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
                  {mode === 'task'
                    ? tTasks('cmd_ai_placeholder')
                    : tMira('placeholder', { name: assistantName })}
                </span>
                {selectedList && mode === 'task' && (
                  <span className="hidden max-w-40 truncate rounded-full border border-border/70 px-2 py-1 text-muted-foreground text-xs sm:inline">
                    {selectedList.name || tCommon('list')}
                  </span>
                )}
              </button>

              <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-muted/40 p-1">
                <ModeButton
                  active={mode === 'task'}
                  icon={Plus}
                  onClick={() => {
                    setMode('task');
                    setExpanded(true);
                  }}
                >
                  {tCommon('add_task')}
                </ModeButton>
                <ModeButton
                  active={mode === 'chat'}
                  icon={MessageCircle}
                  onClick={() => {
                    setMode('chat');
                    setExpanded(true);
                  }}
                >
                  {tCommon('ai-assistant')}
                </ModeButton>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0 rounded-full"
                    onClick={() => setExpanded((value) => !value)}
                  >
                    {expanded ? (
                      <X className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4 rotate-180" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {expanded ? tCommon('close') : tCommon('expand')}
                </TooltipContent>
              </Tooltip>
            </div>

            {expanded && mode === 'task' && (
              <TaskBoardTaskComposer
                activeLists={activeLists}
                aiTaskMode={aiTaskMode}
                canCreateTask={canCreateTask}
                isCreating={createTaskMutation.isPending}
                listsLoading={listsLoading}
                onAiTaskModeChange={setAiTaskMode}
                onInputChange={setTaskInput}
                onListChange={setSelectedListId}
                onSubmit={handleTaskSubmit}
                onSubmitShortcut={() => createTaskMutation.mutate()}
                selectedList={selectedList}
                selectedListId={selectedListId}
                taskInput={taskInput}
              />
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
