'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import { isBoardSprintOpen } from '@tuturuuu/utils/task-helper/sprints';
import { useTranslations } from 'next-intl';
import { type DragEvent, useMemo, useState } from 'react';
import { useTaskDialog } from '../../../hooks/useTaskDialog';
import {
  useBoardSprintMutations,
  type useBoardSprints,
} from '../use-board-sprints';
import { PlanBacklog } from './plan-backlog';
import { isPlanDrag, readPlanDrag } from './plan-parts';
import { PlanSprintMenu } from './plan-sprint-menu';
import { PlanOwnerSection, PlanSprintHeader } from './plan-sprint-panel';
import { ALL_SPRINTS, PlanSprintPicker } from './plan-sprint-picker';
import { type PlanMove, usePlanAssignment } from './use-plan-assignment';
import { usePlanCreate } from './use-plan-create';
import {
  useBoardMembers,
  useSprintPlanGroups,
  useSprintTasks,
} from './use-sprint-plan-data';

const BACKLOG_DROP = 'backlog';

/**
 * The Plan tab: the backlog of the shown sprint (the next one by default)
 * beside one section per person. Assigning is the planning; the sprint end is
 * the default due date. Tasks move to any open sprint, or out of every sprint
 * into the backlog as ghosts.
 */
export function BoardPlanView({
  boardId,
  canManage,
  canPlan,
  currentUserId,
  defaultListId,
  lists,
  onEndActive,
  onSelectSprint,
  onStarted,
  selectedSprintId,
  sprints,
  wsId,
}: {
  boardId: string;
  canManage: boolean;
  canPlan: boolean;
  currentUserId?: string;
  defaultListId?: string | null;
  lists: TaskList[];
  onEndActive?: () => void;
  /** With selectedSprintId, the owner keeps which sprint shows. */
  onSelectSprint?: (sprintId: string | null) => void;
  onStarted?: () => void;
  selectedSprintId?: string | null;
  sprints: ReturnType<typeof useBoardSprints>;
  wsId: string;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const { openTask } = useTaskDialog();
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // null shows the next sprint; a removed sprint falls back to it too.
  const [ownSelectedId, setOwnSelectedId] = useState<string | null>(null);
  const selectedId =
    selectedSprintId === undefined ? ownSelectedId : selectedSprintId;
  const setSelectedId = onSelectSprint ?? setOwnSelectedId;
  const planning = sprints.planningSprint;
  const active = sprints.sprints.find((sprint) => sprint.status === 'active');
  const openSprints = useMemo(
    () => sprints.sprints.filter(isBoardSprintOpen),
    [sprints.sprints]
  );
  const showAll = selectedId === ALL_SPRINTS;
  const selected = showAll
    ? null
    : (sprints.sprints.find((sprint) => sprint.id === selectedId) ?? planning);
  const selectedOpen =
    selected && isBoardSprintOpen(selected) ? selected : null;
  const scope = useMemo(
    () =>
      showAll
        ? { tasks: openSprints.flatMap((sprint) => sprint.tasks) }
        : selected,
    [openSprints, selected, showAll]
  );

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
    sprint: scope,
    tasks,
    unfinishedOnly: showAll,
    unplannedTaskIds: sprints.unplannedTaskIds,
  });
  const { move } = usePlanAssignment({ boardId, members, wsId });
  const { addSprint, moveTasks, removeSprint, start, updateGoal } =
    useBoardSprintMutations({ boardId, wsId });
  const listsById = useMemo(
    () => new Map(lists.map((list) => [list.id, list])),
    [lists]
  );
  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );
  const createListId =
    // A Done or Closed default would create the task already finished.
    lists.find(
      (list) =>
        list.id === defaultListId &&
        !list.deleted &&
        list.status !== 'done' &&
        list.status !== 'closed'
    )?.id ??
    lists.find((list) => list.status === 'not_started' && !list.deleted)?.id ??
    lists.find((list) => list.status === 'active' && !list.deleted)?.id;

  // New tasks go to the shown open sprint; with every sprint shown, to none.
  const createTarget = showAll ? null : (selectedOpen?.id ?? undefined);
  const create = usePlanCreate({
    boardId,
    createListId,
    // The database puts new tasks in the running sprint, else the next one.
    joinsSprintId: (active ?? planning)?.id ?? null,
    target: createTarget,
    wsId,
  });

  if (!planning) return null;

  const openPlanTask = (task: Task) =>
    openTask(task, boardId, lists, false, { taskWsId: wsId });
  const canDrag = canPlan && (showAll || Boolean(selectedOpen));
  const isGhost = (task: Task) => sprints.unplannedTaskIds.has(task.id);
  const sprintTag = (task: Task) =>
    showAll ? (sprints.openSprintByTaskId.get(task.id)?.name ?? null) : null;
  const moveToSprint = (task: Task, sprintId: string | null) => {
    const name = openSprints.find((sprint) => sprint.id === sprintId)?.name;
    moveTasks.mutate(
      { sprintId, taskIds: [task.id] },
      {
        onSuccess: () =>
          toast.success(
            name ? t('moved_to_sprint', { name }) : t('moved_out_of_sprints')
          ),
        onError: () => toast.error(t('move_failed')),
      }
    );
  };
  const renderSprintMenu = canPlan
    ? (task: Task) => (
        <PlanSprintMenu
          current={sprints.openSprintByTaskId.get(task.id) ?? null}
          onMove={(sprintId) => moveToSprint(task, sprintId)}
          openSprints={openSprints}
          task={task}
        />
      )
    : undefined;
  // Giving a ghost an owner plans it into the shown sprint, else the next.
  const plan = (task: Task, planMove: PlanMove) => {
    if (planMove.to !== null && isGhost(task)) {
      const target = selectedOpen ?? planning;
      moveTasks.mutate(
        { sprintId: target.id, taskIds: [task.id] },
        { onError: () => toast.error(t('move_failed')) }
      );
    }
    move(task, planMove);
  };

  const dragOver = (key: string) => (event: DragEvent) => {
    if (!canDrag || !isPlanDrag(event)) return;
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
    plan(task, { from: payload.from, to });
  };
  const dragEnd = () => setDropTarget(null);

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-hidden p-2 md:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
      <PlanBacklog
        canEdit={canDrag}
        dropActive={dropTarget === BACKLOG_DROP}
        isGhost={isGhost}
        members={members}
        onAssign={(task, memberId) => plan(task, { from: null, to: memberId })}
        onCreate={
          canPlan && createListId && createTarget !== undefined
            ? (name) => create.mutateAsync(name)
            : undefined
        }
        onDragEnd={dragEnd}
        onDragOver={dragOver(BACKLOG_DROP)}
        onDrop={drop(null)}
        onOpen={openPlanTask}
        renderSprintMenu={renderSprintMenu}
        sprintTag={sprintTag}
        tasks={backlog}
        workspaceId={wsId}
      />
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
        <PlanSprintHeader
          activeSprint={active ?? null}
          canManage={canManage}
          canPlan={canPlan}
          isNext={selected?.id === planning.id}
          onEndActive={onEndActive}
          onSaveGoal={(goal) =>
            selectedOpen &&
            updateGoal.mutate(
              { goal, sprintId: selectedOpen.id },
              { onError: () => toast.error(t('goal_failed')) }
            )
          }
          picker={
            <PlanSprintPicker
              canPlan={canPlan}
              onAdd={() =>
                addSprint.mutate(undefined, {
                  onError: () => toast.error(t('add_sprint_failed')),
                })
              }
              onRemove={(sprint) =>
                removeSprint.mutate(sprint.id, {
                  onError: () => toast.error(t('remove_sprint_failed')),
                })
              }
              onSelect={setSelectedId}
              selected={selected}
              sprints={sprints.sprints}
            />
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
          sprint={selected}
          starting={start.isPending}
        />
        {owners.map((owner) => (
          <PlanOwnerSection
            canEdit={canDrag}
            dropActive={dropTarget === owner.member.id}
            key={owner.member.id}
            listsById={listsById}
            onDragEnd={dragEnd}
            onDragOver={dragOver(owner.member.id)}
            onDrop={drop(owner.member.id)}
            onOpen={openPlanTask}
            owner={owner}
            renderSprintMenu={renderSprintMenu}
            sprintTag={sprintTag}
          />
        ))}
        {canPlan ? (
          <p className="px-1 text-muted-foreground text-xs">{t('plan_hint')}</p>
        ) : null}
      </div>
    </div>
  );
}
