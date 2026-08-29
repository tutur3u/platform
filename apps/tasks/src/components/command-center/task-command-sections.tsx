'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from '@tuturuuu/icons';
import {
  listWorkspaceBoardsWithLists,
  listWorkspaceTaskLists,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api/tasks';
import type { CommandLauncherExtraSectionContext } from '@tuturuuu/satellite/command-launcher';
import { useTaskDialog } from '@tuturuuu/tasks-ui/tu-do/hooks/useTaskDialog';
import { CommandGroup, CommandItem } from '@tuturuuu/ui/command';
import { toast } from '@tuturuuu/ui/sonner';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { TaskCommandItem } from './task-command-item';
import { selectQuickCreateTarget } from './task-command-utils';
import { CommandIcon, TaskQuickActions } from './task-quick-actions';
import {
  type TaskCommandResult,
  taskCommandQueryKey,
  useTaskCommandData,
} from './use-task-command-data';

export function TaskCommandSections({
  context,
  isPersonalWorkspace,
  workspaceSlug,
  wsId,
}: {
  context: CommandLauncherExtraSectionContext;
  isPersonalWorkspace: boolean;
  workspaceSlug: string;
  wsId: string;
}) {
  const t = useTranslations('command_palette');
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { createTask, openTaskById } = useTaskDialog();
  const showTasks =
    context.activeTab === 'tasks' || context.activeTab === 'all';
  const showQuickActions =
    context.activeTab === 'tasks' ||
    context.activeTab === 'actions' ||
    context.activeTab === 'all';
  const { boards, isLoading, parsed, tasks } = useTaskCommandData({
    enabled: context.isOpen && (showTasks || showQuickActions),
    query: context.query,
    wsId,
  });
  const preferredBoardId = useMemo(
    () => pathname.match(/\/boards\/([^/?]+)/)?.[1] ?? null,
    [pathname]
  );

  const toggleTask = useMutation({
    mutationFn: (task: TaskCommandResult) =>
      updateWorkspaceTask(wsId, task.id, {
        completed: !task.completed,
        completed_at: task.completed ? null : new Date().toISOString(),
      }),
    onError: () => toast.error(t('task_actions.update_failed')),
    onSuccess: (_data, task) => {
      toast.success(
        task.completed
          ? t('task_actions.reopened')
          : t('task_actions.completed')
      );
      void queryClient.invalidateQueries({
        queryKey: taskCommandQueryKey(wsId),
      });
    },
  });

  const createTaskFromCommand = useCallback(
    async (name = '') => {
      try {
        const availableBoards = boards.length
          ? boards
          : (await listWorkspaceBoardsWithLists(wsId)).boards;
        const target = selectQuickCreateTarget(
          availableBoards,
          preferredBoardId
        );
        if (!target) {
          context.onClose();
          router.push(`/${workspaceSlug}/tasks`);
          toast.info(t('task_command.choose_board'));
          return;
        }
        const { lists } = await listWorkspaceTaskLists(wsId, target.board.id);
        const list = lists.find((item) => item.id === target.list.id);
        if (!list) throw new Error('Quick-create list is unavailable');
        context.onClose();
        createTask(target.board.id, list.id, lists, undefined, { name });
      } catch {
        toast.error(t('task_command.create_failed'));
      }
    },
    [
      boards,
      context,
      createTask,
      preferredBoardId,
      router,
      t,
      workspaceSlug,
      wsId,
    ]
  );

  const openTask = useCallback(
    (task: TaskCommandResult) => {
      context.onClose();
      void openTaskById(task.id, {
        initialTask: {
          completed_at: task.completed_at ?? undefined,
          created_at: task.created_at ?? new Date().toISOString(),
          end_date: task.end_date ?? null,
          id: task.id,
          list_id: task.list_id ?? '',
          name: task.name,
          priority: task.priority ?? null,
        },
        taskWorkspacePersonal: isPersonalWorkspace,
        taskWsId: wsId,
      });
    },
    [context, isPersonalWorkspace, openTaskById, wsId]
  );

  const quickActions = showQuickActions ? (
    <TaskQuickActions
      createTask={() => createTaskFromCommand(parsed.query)}
      draftName={parsed.query}
      query={context.query}
      setQuery={context.setQuery}
      workspaceSlug={workspaceSlug}
    />
  ) : null;
  const taskResults = showTasks ? (
    <CommandGroup heading={t('task_command.results', { count: tasks.length })}>
      {isLoading ? (
        <CommandItem disabled value="task-search-loading">
          <Loader2 className="size-4 animate-spin" />
          {t('searching_tasks')}
        </CommandItem>
      ) : null}
      {!isLoading && tasks.length === 0 && parsed.query ? (
        <CommandItem
          onSelect={() => createTaskFromCommand(parsed.query)}
          value={`create-empty-task-${parsed.query}`}
        >
          <CommandIcon icon={<Plus className="size-4" />} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {t('task_command.create_named', { name: parsed.query })}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('task_command.create_named_hint')}
            </p>
          </div>
          <kbd className="rounded border bg-background px-1.5 py-1 font-mono text-[10px] text-muted-foreground">
            ↵
          </kbd>
        </CommandItem>
      ) : null}
      {tasks.map((task) => (
        <TaskCommandItem
          busy={toggleTask.isPending && toggleTask.variables?.id === task.id}
          key={task.id}
          onOpen={() => openTask(task)}
          onToggleComplete={() => toggleTask.mutate(task)}
          task={task}
        />
      ))}
    </CommandGroup>
  ) : null;

  return (
    <>
      {context.query.trim() ? taskResults : quickActions}
      {context.query.trim() ? quickActions : taskResults}
    </>
  );
}
