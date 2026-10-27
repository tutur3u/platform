'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { moveTasksToWorkspaceTaskBoardSprint } from '@tuturuuu/internal-api/task-sprints';
import { createWorkspaceTask } from '@tuturuuu/internal-api/tasks';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type DragEvent, useMemo, useState } from 'react';
import { useTaskDialog } from '../../../hooks/useTaskDialog';
import {
  getBoardSprintsQueryKey,
  useBoardSprintMutations,
  type useBoardSprints,
} from '../use-board-sprints';
import { PlanBacklog } from './plan-backlog';
import { isPlanDrag, readPlanDrag } from './plan-parts';
import { PlanOwnerSection, PlanSprintHeader } from './plan-sprint-panel';
import { usePlanAssignment } from './use-plan-assignment';
import {
  getSprintTasksQueryKey,
  useBoardMembers,
  useSprintPlanGroups,
  useSprintTasks,
} from './use-sprint-plan-data';

const BACKLOG_DROP = 'backlog';

/**
 * The Plan tab: the backlog of the sprint being planned beside one section per
 * person. Assigning is the planning; the sprint end is the default due date.
 */
export function BoardPlanView({
  boardId,
  canManage,
  canPlan,
  currentUserId,
  defaultListId,
  lists,
  onEndActive,
  onStarted,
  sprints,
  ticketPrefix,
  wsId,
}: {
  boardId: string;
  canManage: boolean;
  canPlan: boolean;
  currentUserId?: string;
  defaultListId?: string | null;
  lists: TaskList[];
  onEndActive?: () => void;
  onStarted?: () => void;
  sprints: ReturnType<typeof useBoardSprints>;
  ticketPrefix?: string | null;
  wsId: string;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const queryClient = useQueryClient();
  const { openTask } = useTaskDialog();
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const planning = sprints.planningSprint;
  const active = sprints.sprints.find((sprint) => sprint.status === 'active');

  const { data: tasks = [] } = useSprintTasks({
    boardId,
    enabled: Boolean(planning),
    wsId,
  });
  const { data: members = [] } = useBoardMembers({
    boardId,
    enabled: Boolean(planning),
    wsId,
  });
  const { backlog, owners } = useSprintPlanGroups({
    currentUserId,
    members,
    sprint: planning,
    tasks,
  });
  const { move } = usePlanAssignment({ boardId, members, wsId });
  const { start, updateGoal } = useBoardSprintMutations({ boardId, wsId });
  const listsById = useMemo(
    () => new Map(lists.map((list) => [list.id, list])),
    [lists]
  );
  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );
  const createListId =
    lists.find((list) => list.id === defaultListId && !list.deleted)?.id ??
    lists.find((list) => list.status === 'not_started' && !list.deleted)?.id ??
    lists.find((list) => list.status === 'active' && !list.deleted)?.id;

  const create = useMutation({
    mutationFn: async (name: string) => {
      if (!createListId || !planning) throw new Error('No list to create in');
      const { task } = await createWorkspaceTask(wsId, {
        name,
        listId: createListId,
      });
      // While a sprint runs, new tasks join it; the backlog is the next one.
      if (active) {
        await moveTasksToWorkspaceTaskBoardSprint(wsId, boardId, planning.id, [
          task.id,
        ]);
      }
      return task as Task;
    },
    onSuccess: (task) => {
      queryClient.setQueryData<Task[]>(
        getSprintTasksQueryKey(boardId),
        (current) => (current ? [...current, task] : current)
      );
    },
    onError: () => toast.error(t('create_failed')),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: getBoardSprintsQueryKey(boardId),
      }),
  });

  if (!planning) return null;

  const openPlanTask = (task: Task) =>
    openTask(task, boardId, lists, false, { taskWsId: wsId });

  const dragOver = (key: string) => (event: DragEvent) => {
    if (!canPlan || !isPlanDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    if (dropTarget !== key) setDropTarget(key);
  };
  const drop = (to: string | null) => (event: DragEvent) => {
    event.preventDefault();
    setDropTarget(null);
    const payload = readPlanDrag(event);
    const task = payload ? taskById.get(payload.taskId) : undefined;
    if (!payload || !task) return;
    move(task, { from: payload.from, to });
  };
  const dragEnd = () => setDropTarget(null);

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-hidden p-2 md:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
      <PlanBacklog
        canEdit={canPlan}
        dropActive={dropTarget === BACKLOG_DROP}
        members={members}
        onAssign={(task, memberId) => move(task, { from: null, to: memberId })}
        onCreate={
          canPlan && createListId
            ? (name) => create.mutateAsync(name).catch(() => undefined)
            : undefined
        }
        onDragEnd={dragEnd}
        onDragOver={dragOver(BACKLOG_DROP)}
        onDrop={drop(null)}
        onOpen={openPlanTask}
        tasks={backlog}
        ticketPrefix={ticketPrefix}
        workspaceId={wsId}
      />
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
        <PlanSprintHeader
          activeSprint={active ?? null}
          canManage={canManage}
          canPlan={canPlan}
          onEndActive={onEndActive}
          onSaveGoal={(goal) =>
            updateGoal.mutate(
              { goal, sprintId: planning.id },
              { onError: () => toast.error(t('goal_failed')) }
            )
          }
          onStart={() =>
            start.mutate(planning.id, {
              onSuccess: () => {
                toast.success(t('started', { name: planning.name }));
                onStarted?.();
              },
              onError: () => toast.error(t('start_failed')),
            })
          }
          sprint={planning}
          starting={start.isPending}
        />
        {owners.map((owner) => (
          <PlanOwnerSection
            canEdit={canPlan}
            dropActive={dropTarget === owner.member.id}
            key={owner.member.id}
            listsById={listsById}
            onDragEnd={dragEnd}
            onDragOver={dragOver(owner.member.id)}
            onDrop={drop(owner.member.id)}
            onOpen={openPlanTask}
            owner={owner}
            ticketPrefix={ticketPrefix}
          />
        ))}
        {canPlan ? (
          <p className="px-1 text-muted-foreground text-xs">{t('plan_hint')}</p>
        ) : null}
      </div>
    </div>
  );
}
