'use client';

import {
  ArrowDownAZ,
  CalendarDays,
  Check,
  KanbanSquare,
  List,
  Search,
  X,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type {
  PublicTaskBoardList,
  PublicTaskBoardPayload,
  PublicTaskBoardPriority,
  PublicTaskBoardTask,
} from '@/lib/tasks/public-task-board';

type PublicBoardView = 'kanban' | 'list';
type PublicStatusFilter = 'all' | 'not_started' | 'active' | 'review' | 'done';
type PublicSort = 'board' | 'due_asc' | 'due_desc' | 'created_desc';

const STATUS_FILTERS: PublicStatusFilter[] = [
  'all',
  'not_started',
  'active',
  'review',
  'done',
];
const PRIORITY_LABEL_KEYS = {
  critical: 'priority.critical',
  high: 'priority.high',
  low: 'priority.low',
  normal: 'priority.normal',
} as const satisfies Record<PublicTaskBoardPriority, string>;

function matchesSearch(task: PublicTaskBoardTask, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    task.name,
    String(task.display_number ?? ''),
    ...task.labels.map((label) => label.name),
    ...task.projects.map((project) => project.name),
    ...task.assignees.map(
      (assignee) => assignee.display_name ?? assignee.handle ?? ''
    ),
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery);
}

function sortTasks(tasks: PublicTaskBoardTask[], sort: PublicSort) {
  return [...tasks].sort((a, b) => {
    if (sort === 'due_asc' || sort === 'due_desc') {
      const aTime = a.end_date ? new Date(a.end_date).getTime() : Infinity;
      const bTime = b.end_date ? new Date(b.end_date).getTime() : Infinity;
      return sort === 'due_asc' ? aTime - bTime : bTime - aTime;
    }

    if (sort === 'created_desc') {
      return (
        new Date(b.created_at ?? 0).getTime() -
        new Date(a.created_at ?? 0).getTime()
      );
    }

    const sortDelta = (a.sort_key ?? 0) - (b.sort_key ?? 0);
    if (sortDelta !== 0) return sortDelta;
    return (
      new Date(a.created_at ?? 0).getTime() -
      new Date(b.created_at ?? 0).getTime()
    );
  });
}

function formatDate(value: string | null, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getTicketId(task: PublicTaskBoardTask, ticketPrefix: string | null) {
  if (!task.display_number) return null;
  return ticketPrefix
    ? `${ticketPrefix}-${task.display_number}`
    : `#${task.display_number}`;
}

function TaskCard({
  task,
  ticketPrefix,
}: {
  task: PublicTaskBoardTask;
  ticketPrefix: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations('ws-task-boards.public');
  const ticketId = getTicketId(task, ticketPrefix);
  const dueDate = formatDate(task.end_date, locale);

  return (
    <article className="space-y-3 rounded-md border bg-background p-3 shadow-xs">
      <div className="space-y-1">
        {ticketId && (
          <div className="font-medium text-muted-foreground text-xs">
            {ticketId}
          </div>
        )}
        <h3 className="font-medium text-sm leading-5">{task.name}</h3>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {task.priority && (
          <Badge variant="outline" className="font-normal">
            {t(PRIORITY_LABEL_KEYS[task.priority])}
          </Badge>
        )}
        {dueDate && (
          <Badge variant="secondary" className="gap-1 font-normal">
            <CalendarDays className="h-3 w-3" />
            {dueDate}
          </Badge>
        )}
        {task.estimation_points !== null && (
          <Badge variant="outline" className="font-normal">
            {t('points', { count: task.estimation_points })}
          </Badge>
        )}
      </div>

      {(task.labels.length > 0 ||
        task.projects.length > 0 ||
        task.assignees.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {task.labels.map((label) => (
            <Badge
              key={label.id}
              variant="outline"
              className="gap-1 font-normal"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </Badge>
          ))}
          {task.projects.map((project) => (
            <Badge key={project.id} variant="outline" className="font-normal">
              {project.name}
            </Badge>
          ))}
          {task.assignees.map((assignee) => (
            <Badge
              key={assignee.id}
              variant="secondary"
              className="font-normal"
            >
              {assignee.display_name ??
                (assignee.handle ? `@${assignee.handle}` : t('assignee'))}
            </Badge>
          ))}
        </div>
      )}
    </article>
  );
}

function KanbanColumn({
  list,
  tasks,
  ticketPrefix,
}: {
  list: PublicTaskBoardList;
  tasks: PublicTaskBoardTask[];
  ticketPrefix: string | null;
}) {
  const t = useTranslations('ws-task-boards.public');

  return (
    <section className="flex h-full min-h-[24rem] w-80 shrink-0 flex-col rounded-md bg-muted/40">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-sm">
            {list.name || t('untitled_list')}
          </h2>
          <p className="text-muted-foreground text-xs">
            {t('task_count', { count: tasks.length })}
          </p>
        </div>
        <Badge variant="outline">{tasks.length}</Badge>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {tasks.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">
            {t('empty_list')}
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} ticketPrefix={ticketPrefix} />
          ))
        )}
      </div>
    </section>
  );
}

export default function PublicTaskBoardContent({
  payload,
}: {
  payload: PublicTaskBoardPayload;
}) {
  const t = useTranslations('ws-task-boards.public');
  const [view, setView] = useState<PublicBoardView>('kanban');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<PublicStatusFilter>('all');
  const [sort, setSort] = useState<PublicSort>('board');

  const listsById = useMemo(
    () => new Map(payload.lists.map((list) => [list.id, list] as const)),
    [payload.lists]
  );

  const filteredTasks = useMemo(() => {
    const statusFilteredTasks =
      statusFilter === 'all'
        ? payload.tasks
        : payload.tasks.filter(
            (task) => listsById.get(task.list_id)?.status === statusFilter
          );

    return sortTasks(
      statusFilteredTasks.filter((task) => matchesSearch(task, query)),
      sort
    );
  }, [listsById, payload.tasks, query, sort, statusFilter]);

  const tasksByList = useMemo(() => {
    const grouped = new Map<string, PublicTaskBoardTask[]>();
    for (const task of filteredTasks) {
      const tasks = grouped.get(task.list_id) ?? [];
      tasks.push(task);
      grouped.set(task.list_id, tasks);
    }
    return grouped;
  }, [filteredTasks]);

  const visibleLists = useMemo(
    () =>
      payload.lists.filter(
        (list) => statusFilter === 'all' || list.status === statusFilter
      ),
    [payload.lists, statusFilter]
  );

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-48 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-semibold text-xl">
                {payload.board.name || t('untitled_board')}
              </h1>
              <Badge variant="secondary">{t('read_only')}</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {t('summary', {
                lists: payload.lists.length,
                tasks: payload.tasks.length,
              })}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-72">
            <Search className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search_placeholder')}
              className="h-9 pr-8 pl-8"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={t('clear_search')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select
            value={statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value as PublicStatusFilter)
            }
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`status.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sort}
            onValueChange={(value) => setSort(value as PublicSort)}
          >
            <SelectTrigger className="h-9 w-44">
              <ArrowDownAZ className="h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="board">{t('sort.board')}</SelectItem>
              <SelectItem value="due_asc">{t('sort.due_asc')}</SelectItem>
              <SelectItem value="due_desc">{t('sort.due_desc')}</SelectItem>
              <SelectItem value="created_desc">
                {t('sort.created_desc')}
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center rounded-md border bg-background p-0.5">
            <Button
              type="button"
              size="sm"
              variant={view === 'kanban' ? 'secondary' : 'ghost'}
              onClick={() => setView('kanban')}
              className="h-8 gap-1.5"
            >
              <KanbanSquare className="h-4 w-4" />
              <span className="hidden sm:inline">{t('kanban')}</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === 'list' ? 'secondary' : 'ghost'}
              onClick={() => setView('list')}
              className="h-8 gap-1.5"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">{t('list')}</span>
            </Button>
          </div>
        </div>
      </header>

      {payload.truncated && (
        <div className="border-b bg-muted/40 px-4 py-2 text-muted-foreground text-sm">
          {t('truncated')}
        </div>
      )}

      {view === 'kanban' ? (
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full gap-3 overflow-x-auto p-3 sm:p-4">
            {visibleLists.map((list) => (
              <KanbanColumn
                key={list.id}
                list={list}
                tasks={tasksByList.get(list.id) ?? []}
                ticketPrefix={payload.board.ticket_prefix}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-3 sm:p-4">
          <div className="mx-auto max-w-5xl space-y-2">
            {filteredTasks.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
                {t('empty_results')}
              </div>
            ) : (
              filteredTasks.map((task) => {
                const list = listsById.get(task.list_id);
                return (
                  <div
                    key={task.id}
                    className={cn(
                      'grid items-start gap-3',
                      'sm:grid-cols-[minmax(0,1fr)_12rem]'
                    )}
                  >
                    <TaskCard
                      task={task}
                      ticketPrefix={payload.board.ticket_prefix}
                    />
                    <div className="flex items-start justify-between gap-2 sm:justify-end">
                      <Badge variant="outline" className="font-normal">
                        {list?.name || t('untitled_list')}
                      </Badge>
                      {task.completed_at && <Check className="h-4 w-4" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </main>
  );
}
