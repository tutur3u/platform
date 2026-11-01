'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import { isBoardSprintOpen } from '@tuturuuu/utils/task-helper/sprints';
import { useTranslations } from 'next-intl';
import { type DragEvent, useMemo, useState } from 'react';
import { useTaskDialog } from '../../../hooks/useTaskDialog';
import { taskMatchesBoardSearch } from '../../board-task-search';
import {
  NEW_SPRINT,
  type SprintMoveTarget,
  useBoardSprintMutations,
  type useBoardSprints,
} from '../use-board-sprints';
import { PlanBacklog, type PlanBoardCardProps } from './plan-backlog';
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
 * The Plan tab: the backlog of unowned work beside one section per person
 * in the shown sprint (the next one by default). Assigning is the planning; the sprint end is
 * the default due date. Tasks move to any open sprint, or out of every sprint
 * into the backlog as ghosts.
 */
export function BoardPlanView({
  boardCard,
  boardId,
  canManage,
  canPlan,
  currentUserId,
  defaultListId,
  lists,
  onEndActive,
  onSelectSprint,
  onStarted,
  searchQuery,
  selectedSprintId,
  sprints,
  wsId,
}: {
  boardCard?: PlanBoardCardProps;
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
  /** The header search: matches from every open sprint and the backlog. */
  searchQuery?: string;
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
  const searching = Boolean(searchQuery?.trim());
  // A search looks through every open sprint, as All sprints does.
  const wide = showAll || searching;
  const selected = showAll
    ? null
    : (sprints.sprints.find((sprint) => sprint.id === selectedId) ?? planning);
  const selectedOpen =
    selected && isBoardSprintOpen(selected) ? selected : null;
  const scope = useMemo(
    () =>
      wide
        ? { tasks: openSprints.flatMap((sprint) => sprint.tasks) }
        : selected,
    [openSprints, selected, wide]
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
  const groups = useSprintPlanGroups({
    currentUserId,
    members,
    // A closed sprint's review keeps to its own tasks.
    openSprintTaskIds:
      wide || selectedOpen ? sprints.openSprintByTaskId : undefined,
    sprint: scope,
    tasks,
    unfinishedOnly: wide,
    unplannedTaskIds: sprints.unplannedTaskIds,
  });
  const { backlog, owners } = useMemo(() => {
    if (!searching) return groups;
    const matches = (task: Task) => taskMatchesBoardSearch(task, searchQuery);
    // Every person stays, so a match can still be dragged onto anyone.
    return {
      backlog: groups.backlog.filter(matches),
      owners: groups.owners.map((owner) => ({
        ...owner,
        tasks: owner.tasks.filter(matches),
      })),
    };
  }, [groups, searchQuery, searching]);
  const { move } = usePlanAssignment({ boardId, members, wsId });
  const { addSprint, moveTasks, removeSprint, start } = useBoardSprintMutations(
    { boardId, wsId }
  );
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
  const sprintOf = (task: Task) => sprints.openSprintByTaskId.get(task.id);
  // Tag tasks from other sprints, or every task when all sprints show.
  const sprintTag = (task: Task) => {
    const sprint = sprintOf(task);
    return sprint && (wide || sprint.id !== selectedOpen?.id) ? sprint : null;
  };
  const moveToSprint = (task: Task, target: SprintMoveTarget) =>
    moveTasks.mutate(
      {
        sprintId: target === NEW_SPRINT ? NEW_SPRINT : (target?.id ?? null),
        taskIds: [task.id],
      },
      {
        onSuccess: (data) => {
          const name = target === NEW_SPRINT ? data.sprintName : target?.name;
          toast.success(
            name ? t('moved_to_sprint', { name }) : t('moved_out_of_sprints')
          );
        },
        onError: () => toast.error(t('move_failed')),
      }
    );
  const renderSprintMenu = canPlan
    ? (task: Task) => (
        <PlanSprintMenu
          current={sprints.openSprintByTaskId.get(task.id) ?? null}
          disabled={moveTasks.isPending}
          onMove={(target) => moveToSprint(task, target)}
          openSprints={openSprints}
          task={task}
        />
      )
    : undefined;
  // Giving a ghost, or a task from another sprint, an owner plans it into
  // the shown sprint, else the next. The owner changes only once the move
  // lands, so a failed move leaves the task as it was.
  const plan = (task: Task, planMove: PlanMove) => {
    const elsewhere =
      isGhost(task) ||
      (!showAll && sprintOf(task)?.id !== (selectedOpen ?? planning).id);
    if (planMove.to === null || !elsewhere) {
      move(task, planMove);
      return;
    }
    const target = selectedOpen ?? planning;
    // The owner shows at once and is saved once the task is in the sprint;
    // a failed move takes the owner back off. mutateAsync, not mutate:
    // overlapping mutate calls run only the latest onSuccess.
    const moved = moveTasks.mutateAsync({
      sprintId: target.id,
      taskIds: [task.id],
    });
    moved.catch(() => toast.error(t('move_failed')));
    move(task, planMove, moved);
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
        boardCard={boardCard}
        boardId={boardId}
        canEdit={canDrag}
        dropActive={dropTarget === BACKLOG_DROP}
        emptyLabel={
          searching
            ? t('search_empty_backlog', { query: searchQuery?.trim() ?? '' })
            : t('backlog_empty')
        }
        isGhost={isGhost}
        lists={lists}
        listsById={listsById}
        onCreate={
          canPlan && createListId && createTarget !== undefined
            ? (name) => create.mutateAsync(name)
            : undefined
        }
        onDragEnd={dragEnd}
        onDragOver={dragOver(BACKLOG_DROP)}
        onDrop={drop(null)}
        sprintTag={sprintTag}
        tasks={backlog}
        workspaceId={wsId}
      />
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
        <PlanSprintHeader
          activeSprint={active ?? null}
          canManage={canManage}
          isNext={selected?.id === planning.id}
          onEndActive={onEndActive}
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
        {searching && owners.every((owner) => owner.tasks.length === 0) ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-muted-foreground text-sm">
            {t('search_empty_owners', { query: searchQuery?.trim() ?? '' })}
          </p>
        ) : null}
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
