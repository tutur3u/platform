'use client';

import { Inbox, Plus } from '@tuturuuu/icons';
import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type DragEvent, useMemo, useState } from 'react';
import {
  TaskCard,
  type TaskCardProps,
} from '../../../boards/boardId/task-card/task-card';
import { DEFAULT_BOARD_FILTERS } from '../../board-header/board-filter-state';
import { BoardProjectFilter } from '../../board-header/board-project-filter';
import { BoardSortMenu } from '../../board-header/board-sort-menu';
import { sortLocalTasks } from '../../board-task-filtering';
import type { TaskFilters } from '../../task-filter.types';
import { SprintLabel } from '../sprint-label';
import { setPlanCardDragImage, writePlanDrag } from './plan-parts';

/** What the Board passes its cards, so backlog cards behave the same. */
export type PlanBoardCardProps = Pick<
  TaskCardProps,
  | 'assigneeMemberSource'
  | 'canUseBoardAssignees'
  | 'isPersonalWorkspace'
  | 'readOnly'
>;

interface PlanBacklogProps {
  boardCard?: PlanBoardCardProps;
  boardId: string;
  canEdit: boolean;
  dropActive: boolean;
  /** What an empty backlog says; a search says what found nothing. */
  emptyLabel: string;
  /** Open tasks parked outside every sprint, shown as ghosts. */
  isGhost: (task: Task) => boolean;
  lists: TaskList[];
  listsById: Map<string, TaskList>;
  onCreate?: (name: string) => Promise<unknown>;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  /** The task's sprint, when it is not the shown one. */
  sprintTag: (task: Task) => BoardSprint | null;
  tasks: Task[];
  workspaceId: string;
}

/**
 * Open tasks nobody owns in any open sprint, tagged when not in the shown
 * one, and open tasks in no sprint, with a Project filter and priority sort.
 * The header search filters it from outside.
 */
export function PlanBacklog({
  boardCard,
  boardId,
  canEdit,
  dropActive,
  emptyLabel,
  isGhost,
  lists,
  listsById,
  onCreate,
  onDragEnd,
  onDragOver,
  onDrop,
  sprintTag,
  tasks,
  workspaceId,
}: PlanBacklogProps) {
  const t = useTranslations('ws-task-boards.sprints');
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_BOARD_FILTERS);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');

  const projectTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      for (const project of task.projects ?? []) {
        counts.set(project.id, (counts.get(project.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  const visible = useMemo(() => {
    const projectIds = new Set(filters.projects.map((project) => project.id));
    const matching = tasks.filter((task) => {
      if (projectIds.size === 0) return true;
      return (task.projects ?? []).some((project) =>
        projectIds.has(project.id)
      );
    });
    return sortLocalTasks(matching, filters.sortBy, 'last');
  }, [filters, tasks]);

  async function submitDraft() {
    const name = draft.trim();
    if (!name || !onCreate) return;
    setDraft('');
    try {
      await onCreate(name);
    } catch {
      // Creating failed (and was reported); keep the name to retry.
      setDraft(name);
    }
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a drop zone; the row menus plan without a mouse
    <section
      aria-label={t('backlog')}
      className={cn(
        'flex min-h-0 flex-col rounded-xl bg-dynamic-gray/5 transition-shadow',
        dropActive && 'ring-2 ring-dynamic-gray/40'
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2 border-b p-2">
        <Inbox className="ml-2 size-4 text-muted-foreground" />
        <h3 className="font-semibold text-foreground/90 text-sm">
          {t('backlog')}
        </h3>
        <Badge className="px-2 py-0.5 font-medium text-xs" variant="secondary">
          {tasks.length}
        </Badge>
        <span className="flex-1" />
        <BoardProjectFilter
          filters={filters}
          onFiltersChange={setFilters}
          projectTaskCounts={projectTaskCounts}
          workspaceId={workspaceId}
        />
        <BoardSortMenu
          onChange={(sortBy) => setFilters({ ...filters, sortBy })}
          sortBy={filters.sortBy}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
        {composing ? (
          <input
            aria-label={t('new_backlog_task')}
            className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onBlur={() => {
              if (!draft.trim()) setComposing(false);
            }}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter') {
                event.preventDefault();
                void submitDraft();
              }
              if (event.key === 'Escape') {
                setDraft('');
                setComposing(false);
              }
            }}
            placeholder={t('new_task_placeholder')}
            // Opened by an explicit click, so focus follows it.
            ref={(input) => input?.focus()}
            value={draft}
          />
        ) : null}
        {visible.map((task) => {
          const ghost = isGhost(task);
          const tag = ghost ? null : sprintTag(task);
          return (
            // Native drag plans the task onto a person; the card is the
            // Board's own, with its sortable drag off.
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the row menus plan without a mouse
            <article
              aria-label={task.name}
              data-plan-ghost={ghost || undefined}
              data-plan-task-id={task.id}
              draggable={canEdit}
              key={task.id}
              onDragEnd={onDragEnd}
              onDragStart={(event) => {
                writePlanDrag(event, task.id, null);
                setPlanCardDragImage(event);
              }}
            >
              {ghost || tag ? (
                <p className="flex px-1 pb-1 text-muted-foreground text-xs">
                  {tag ? <SprintLabel sprint={tag} /> : t('not_in_sprint')}
                </p>
              ) : null}
              <TaskCard
                {...boardCard}
                availableLists={lists}
                boardId={boardId}
                dragDisabled
                onUpdate={() => {}}
                task={task}
                taskList={listsById.get(task.list_id)}
                workspaceId={workspaceId}
              />
            </article>
          );
        })}
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-muted-foreground text-sm">
            {emptyLabel}
          </p>
        ) : null}
      </div>
      {canEdit && onCreate ? (
        <div className="border-t p-2">
          <button
            className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setComposing(true)}
            type="button"
          >
            <Plus className="size-3.5" />
            {t('add_to_backlog')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
