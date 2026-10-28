'use client';

import { Box, Inbox, Plus, Search, UserPlus } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Badge } from '@tuturuuu/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type DragEvent, useMemo, useState } from 'react';
import { getPriorityIndicator } from '../../../utils/taskPriorityUtils';
import { DEFAULT_BOARD_FILTERS } from '../../board-header/board-filter-state';
import { BoardProjectFilter } from '../../board-header/board-project-filter';
import { BoardSortMenu } from '../../board-header/board-sort-menu';
import type { BoardMember } from '../../board-members-query';
import { sortLocalTasks } from '../../board-task-filtering';
import type { TaskFilters } from '../../task-filter.types';
import {
  MemberAvatar,
  PlanOwnDueDate,
  PlanTaskTitle,
  writePlanDrag,
} from './plan-parts';

interface PlanBacklogProps {
  canEdit: boolean;
  dropActive: boolean;
  members: BoardMember[];
  onAssign: (task: Task, memberId: string) => void;
  onCreate?: (name: string) => Promise<unknown>;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onOpen: (task: Task) => void;
  tasks: Task[];
  ticketPrefix?: string | null;
  workspaceId: string;
}

/** Unassigned open tasks of the sprint being planned, with priority sort and a Project filter. */
export function PlanBacklog({
  canEdit,
  dropActive,
  members,
  onAssign,
  onCreate,
  onDragEnd,
  onDragOver,
  onDrop,
  onOpen,
  tasks,
  ticketPrefix,
  workspaceId,
}: PlanBacklogProps) {
  const t = useTranslations('ws-task-boards.sprints');
  const [query, setQuery] = useState('');
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
    const needle = query.trim().toLowerCase();
    const projectIds = new Set(filters.projects.map((project) => project.id));
    const matching = tasks.filter((task) => {
      if (needle && !task.name.toLowerCase().includes(needle)) return false;
      if (projectIds.size === 0) return true;
      return (task.projects ?? []).some((project) =>
        projectIds.has(project.id)
      );
    });
    return sortLocalTasks(matching, filters.sortBy, 'last');
  }, [filters, query, tasks]);

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
    <section
      aria-label={t('backlog')}
      className={cn(
        'flex min-h-0 flex-col rounded-xl bg-dynamic-gray/5 transition-shadow',
        dropActive && 'ring-2 ring-dynamic-gray/40'
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="flex items-center gap-2 border-b p-3">
        <Inbox className="size-4 text-muted-foreground" />
        <h3 className="font-semibold text-foreground/90 text-sm">
          {t('backlog')}
        </h3>
        <Badge className="px-2 py-0.5 font-medium text-xs" variant="secondary">
          {tasks.length}
        </Badge>
        <span className="flex-1" />
        <BoardSortMenu
          onChange={(sortBy) => setFilters({ ...filters, sortBy })}
          sortBy={filters.sortBy}
        />
      </div>
      <div className="flex items-center gap-2 p-2">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-background px-2 text-sm">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            aria-label={t('search_backlog')}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search_backlog')}
            value={query}
          />
        </label>
        <BoardProjectFilter
          filters={filters}
          onFiltersChange={setFilters}
          projectTaskCounts={projectTaskCounts}
          workspaceId={workspaceId}
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
        {visible.map((task) => (
          <BacklogCard
            canEdit={canEdit}
            key={task.id}
            members={members}
            onAssign={(memberId) => onAssign(task, memberId)}
            onDragEnd={onDragEnd}
            onOpen={() => onOpen(task)}
            task={task}
            ticketPrefix={ticketPrefix}
          />
        ))}
        {visible.length === 0 ? (
          <p className="px-1 py-4 text-center text-muted-foreground text-xs">
            {t('backlog_empty')}
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

function BacklogCard({
  canEdit,
  members,
  onAssign,
  onDragEnd,
  onOpen,
  task,
  ticketPrefix,
}: {
  canEdit: boolean;
  members: BoardMember[];
  onAssign: (memberId: string) => void;
  onDragEnd: () => void;
  onOpen: () => void;
  task: Task;
  ticketPrefix?: string | null;
}) {
  const t = useTranslations('ws-task-boards.sprints');
  const project = task.projects?.[0];

  return (
    <article
      aria-label={task.name}
      className="relative rounded-lg border bg-background p-3 shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-sm"
      data-plan-task-id={task.id}
      draggable={canEdit}
      onDragEnd={onDragEnd}
      onDragStart={(event) => writePlanDrag(event, task.id, null)}
    >
      <div className="flex items-start gap-2">
        {/* The title button stretches over the card, so a click anywhere opens it. */}
        <button
          className="min-w-0 flex-1 text-left font-medium text-sm leading-5 after:absolute after:inset-0 focus-visible:outline-none"
          onClick={onOpen}
          type="button"
        >
          <PlanTaskTitle task={task} ticketPrefix={ticketPrefix} />
        </button>
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={t('assign', { name: task.name })}
                className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full border border-dashed text-muted-foreground transition-colors hover:border-solid hover:text-foreground"
                type="button"
              >
                <UserPlus className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {t('assign_to')}
              </DropdownMenuLabel>
              {members.map((member) => (
                <DropdownMenuItem
                  className="gap-2"
                  key={member.id}
                  onSelect={() => onAssign(member.id)}
                >
                  <MemberAvatar className="size-5" member={member} />
                  <span className="truncate">{member.display_name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {task.priority || project || task.end_date ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {getPriorityIndicator(task.priority)}
          {project ? (
            <span className="inline-flex h-5 max-w-40 items-center gap-1 rounded-md border border-dynamic-sky/30 bg-dynamic-sky/10 px-1.5 text-dynamic-sky text-xs">
              <Box className="size-3 shrink-0" />
              <span className="truncate">{project.name}</span>
            </span>
          ) : null}
          <PlanOwnDueDate task={task} />
        </div>
      ) : null}
    </article>
  );
}
