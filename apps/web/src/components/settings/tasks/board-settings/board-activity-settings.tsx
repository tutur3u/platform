'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  FileText,
  Flag,
  FolderKanban,
  History,
  horseHead,
  Icon,
  Layers,
  Loader2,
  Plus,
  Rabbit,
  RefreshCw,
  Search,
  Tag,
  Target,
  Turtle,
  UserMinus,
  UserPlus,
  unicornHead,
} from '@tuturuuu/icons';
import {
  listWorkspaceTaskHistory,
  type WorkspaceTaskHistoryEntry,
} from '@tuturuuu/internal-api/tasks';
import {
  isTaskPriority,
  type TaskPriority,
} from '@tuturuuu/types/primitives/Priority';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { dispatchRequestOpenTask } from '@tuturuuu/ui/lib/task-open-events';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import React, {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DescriptionDiffViewer } from '@/components/tasks/description-diff-viewer';

const ACTIVITY_PAGE_SIZE = 20;

type TaskListNameSummary = {
  id: string;
  name: string | null;
};

type TranslationFn = (
  key: string,
  options?: { count?: number; defaultValue?: string }
) => string;

const PRIORITY_BADGE_COLORS: Record<TaskPriority, string> = {
  critical:
    'bg-dynamic-red/20 border-dynamic-red/50 text-dynamic-red shadow-sm shadow-dynamic-red/50',
  high: 'bg-dynamic-orange/10 border-dynamic-orange/30 text-dynamic-orange',
  normal: 'bg-dynamic-yellow/10 border-dynamic-yellow/30 text-dynamic-yellow',
  low: 'bg-dynamic-blue/10 border-dynamic-blue/30 text-dynamic-blue',
};

const PRIORITY_ICONS: Record<TaskPriority, React.ReactElement> = {
  critical: <Icon iconNode={unicornHead} />,
  high: <Icon iconNode={horseHead} />,
  normal: <Rabbit />,
  low: <Turtle />,
};

function getPriorityIcon(
  priority: TaskPriority,
  className?: string
): React.ReactNode {
  const icon = PRIORITY_ICONS[priority];
  return React.cloneElement(icon, { className } as any);
}

function ActivityPriorityBadge({ priority }: { priority: TaskPriority }) {
  const t = useTranslations();

  return (
    <Badge
      variant="secondary"
      className={cn(
        'inline-flex h-5 gap-1 px-1.5 py-0 text-[10px]',
        PRIORITY_BADGE_COLORS[priority]
      )}
    >
      {getPriorityIcon(priority, 'h-3 w-3')}
      {t(`tasks.priority_${priority}` as any)}
    </Badge>
  );
}

function getBrowserInternalApiOptions() {
  return typeof window !== 'undefined'
    ? { baseUrl: window.location.origin }
    : undefined;
}

function formatActivityToken(
  value: string | null | undefined,
  fallback: string
) {
  return (
    value
      ?.replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? fallback
  );
}

function getActivityFieldLabel(
  fieldName: string | null | undefined,
  historyT: TranslationFn
) {
  switch (fieldName) {
    case 'name':
      return historyT('field.name');
    case 'description':
      return historyT('field.description');
    case 'priority':
      return historyT('field.priority');
    case 'start_date':
      return historyT('field.start_date');
    case 'end_date':
      return historyT('field.end_date');
    case 'estimation_points':
      return historyT('field.estimation');
    case 'list_id':
      return historyT('field.list');
    case 'completed':
      return historyT('field.completed');
    default:
      return formatActivityToken(fieldName, historyT('unknown_change'));
  }
}

function getActivityAction(
  entry: WorkspaceTaskHistoryEntry,
  t: ReturnType<typeof useTranslations>
) {
  if (entry.change_type === 'field_updated') {
    switch (entry.field_name) {
      case 'name':
        return t('tasks-logs.field_updated.name' as any);
      case 'description':
        return t('tasks-logs.field_updated.description' as any);
      case 'priority':
        return t('tasks-logs.field_updated.priority' as any);
      case 'start_date':
        return t('tasks-logs.field_updated.start_date' as any);
      case 'end_date':
        return t('tasks-logs.field_updated.end_date' as any);
      case 'estimation_points':
        return t('tasks-logs.field_updated.estimation_points' as any);
      case 'list_id':
        return t('tasks-logs.field_updated.list_id' as any);
      case 'completed':
        return t('tasks-logs.field_updated.completed' as any);
      default:
        return t('tasks-logs.field_updated.unknown' as any);
    }
  }

  switch (entry.change_type) {
    case 'task_created':
      return t('tasks-logs.task_created' as any);
    case 'assignee_added':
      return t('tasks-logs.assignee_added' as any);
    case 'assignee_removed':
      return t('tasks-logs.assignee_removed' as any);
    case 'label_added':
      return t('tasks-logs.label_added' as any);
    case 'label_removed':
      return t('tasks-logs.label_removed' as any);
    case 'project_linked':
      return t('tasks-logs.project_linked' as any);
    case 'project_unlinked':
      return t('tasks-logs.project_unlinked' as any);
    default:
      return t('tasks-logs.unknown_change' as any);
  }
}

function getActivityBadgeLabel(
  entry: WorkspaceTaskHistoryEntry,
  historyT: TranslationFn,
  t: ReturnType<typeof useTranslations>
) {
  if (entry.change_type === 'field_updated' && entry.field_name) {
    return getActivityFieldLabel(entry.field_name, historyT);
  }

  switch (entry.change_type) {
    case 'task_created':
      return t('tasks-logs.change_type.task_created' as any);
    case 'assignee_added':
      return t('tasks-logs.change_type.assignee_added' as any);
    case 'assignee_removed':
      return t('tasks-logs.change_type.assignee_removed' as any);
    case 'label_added':
      return t('tasks-logs.change_type.label_added' as any);
    case 'label_removed':
      return t('tasks-logs.change_type.label_removed' as any);
    case 'project_linked':
      return t('tasks-logs.change_type.project_linked' as any);
    case 'project_unlinked':
      return t('tasks-logs.change_type.project_unlinked' as any);
    default:
      return t('tasks-logs.change_type.field_updated' as any);
  }
}

function getCreatedDescriptionValue(metadata: unknown) {
  if (!isRecord(metadata)) return null;
  return metadata.description ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function formatListActivityValue({
  listNameById,
  unknownListLabel,
  value,
}: {
  listNameById: Map<string, string>;
  unknownListLabel: string;
  value: unknown;
}) {
  if (value === null || value === undefined || value === '') {
    return unknownListLabel;
  }

  if (typeof value === 'string') {
    return (
      listNameById.get(value) ??
      (looksLikeUuid(value) ? unknownListLabel : value)
    );
  }

  if (isRecord(value)) {
    const name = value.name;
    if (typeof name === 'string' && name.trim()) return name;

    const id = value.id;
    if (typeof id === 'string') {
      return listNameById.get(id) ?? unknownListLabel;
    }
  }

  return unknownListLabel;
}

function formatActivityValue(
  value: unknown,
  {
    fieldName,
    listNameById,
    changedLabel,
    noneLabel,
    unknownListLabel,
  }: {
    fieldName?: string | null;
    listNameById?: Map<string, string>;
    changedLabel: string;
    noneLabel: string;
    unknownListLabel: string;
  }
): string {
  if (fieldName === 'list_id' && listNameById) {
    return formatListActivityValue({
      listNameById,
      unknownListLabel,
      value,
    });
  }

  if (value === null || value === undefined || value === '') return noneLabel;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) =>
        formatActivityValue(item, {
          fieldName,
          listNameById,
          changedLabel,
          noneLabel,
          unknownListLabel,
        })
      )
      .filter(Boolean)
      .join(', ');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const name =
      record.name ?? record.title ?? record.label ?? record.display_name;
    if (typeof name === 'string') return name;
    return changedLabel;
  }

  return String(value);
}

function ActivityFieldValue({
  entry,
  listNameById,
  value,
}: {
  entry: WorkspaceTaskHistoryEntry;
  listNameById: Map<string, string>;
  value: unknown;
}) {
  const t = useTranslations();

  if (entry.field_name === 'priority' && isTaskPriority(value)) {
    return <ActivityPriorityBadge priority={value} />;
  }

  return (
    <span className="min-w-0 truncate text-muted-foreground">
      {formatActivityValue(value, {
        fieldName: entry.field_name,
        listNameById,
        changedLabel: t('tasks.history.content_changed' as any),
        noneLabel: t('tasks.priority_none'),
        unknownListLabel: t('common.unknown_list'),
      })}
    </span>
  );
}

function getActivityVisual(entry: WorkspaceTaskHistoryEntry): {
  icon: ReactNode;
  tone: string;
} {
  const iconClassName = 'h-3.5 w-3.5';

  if (entry.change_type === 'field_updated') {
    switch (entry.field_name) {
      case 'name':
      case 'description':
        return {
          icon: <FileText className={cn(iconClassName, 'text-dynamic-blue')} />,
          tone: 'bg-dynamic-blue/10',
        };
      case 'priority':
        return {
          icon: <Flag className={cn(iconClassName, 'text-dynamic-orange')} />,
          tone: 'bg-dynamic-orange/10',
        };
      case 'start_date':
      case 'end_date':
        return {
          icon: (
            <CalendarDays className={cn(iconClassName, 'text-dynamic-red')} />
          ),
          tone: 'bg-dynamic-red/10',
        };
      case 'estimation_points':
        return {
          icon: <Target className={cn(iconClassName, 'text-dynamic-purple')} />,
          tone: 'bg-dynamic-purple/10',
        };
      case 'list_id':
        return {
          icon: (
            <ArrowRight className={cn(iconClassName, 'text-dynamic-cyan')} />
          ),
          tone: 'bg-dynamic-cyan/10',
        };
      case 'completed':
        return {
          icon: (
            <CheckCircle2 className={cn(iconClassName, 'text-dynamic-green')} />
          ),
          tone: 'bg-dynamic-green/10',
        };
      default:
        return {
          icon: (
            <CircleDot className={cn(iconClassName, 'text-muted-foreground')} />
          ),
          tone: 'bg-muted',
        };
    }
  }

  switch (entry.change_type) {
    case 'task_created':
      return {
        icon: <Plus className={cn(iconClassName, 'text-dynamic-green')} />,
        tone: 'bg-dynamic-green/10',
      };
    case 'assignee_added':
      return {
        icon: <UserPlus className={cn(iconClassName, 'text-dynamic-green')} />,
        tone: 'bg-dynamic-green/10',
      };
    case 'assignee_removed':
      return {
        icon: <UserMinus className={cn(iconClassName, 'text-dynamic-red')} />,
        tone: 'bg-dynamic-red/10',
      };
    case 'label_added':
    case 'label_removed':
      return {
        icon: <Tag className={cn(iconClassName, 'text-dynamic-yellow')} />,
        tone: 'bg-dynamic-yellow/10',
      };
    case 'project_linked':
    case 'project_unlinked':
      return {
        icon: (
          <FolderKanban className={cn(iconClassName, 'text-dynamic-purple')} />
        ),
        tone: 'bg-dynamic-purple/10',
      };
    default:
      return {
        icon: <Layers className={cn(iconClassName, 'text-muted-foreground')} />,
        tone: 'bg-muted',
      };
  }
}

function ActivityDescriptionChange({
  historyT,
  newValue,
  oldValue,
}: {
  historyT: TranslationFn;
  newValue: unknown;
  oldValue: unknown;
}) {
  if (!oldValue && !newValue) {
    return (
      <span className="text-muted-foreground text-xs">
        {historyT('no_change')}
      </span>
    );
  }

  return (
    <DescriptionDiffViewer
      newValue={newValue}
      oldValue={oldValue}
      t={historyT}
      triggerVariant="inline"
    />
  );
}

function ActivityTimelineEntry({
  entry,
  historyT,
  listNameById,
  onOpenTask,
}: {
  entry: WorkspaceTaskHistoryEntry;
  historyT: TranslationFn;
  listNameById: Map<string, string>;
  onOpenTask: (entry: WorkspaceTaskHistoryEntry) => void;
}) {
  const t = useTranslations();
  const { icon, tone } = getActivityVisual(entry);
  const actorName = entry.user?.name ?? t('common.unknown');
  const changedAt = new Date(entry.changed_at);
  const fieldLabel = entry.field_name
    ? getActivityFieldLabel(entry.field_name, historyT)
    : null;
  const action = getActivityAction(entry, t);
  const badgeLabel = getActivityBadgeLabel(entry, historyT, t);
  const createdDescription = getCreatedDescriptionValue(entry.metadata);
  const canOpenTask =
    Boolean(entry.task_id) &&
    !entry.task_deleted_at &&
    !entry.task_permanently_deleted;

  return (
    <div className="group grid grid-cols-[auto_1fr] gap-3 rounded-md p-2 transition-colors hover:bg-muted/40">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full',
            tone
          )}
        >
          {icon}
        </div>
        <div className="mt-2 h-full w-px bg-border group-last:hidden" />
      </div>

      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Avatar className="h-5 w-5">
            <AvatarImage src={entry.user?.avatar_url ?? undefined} />
            <AvatarFallback className="text-[9px]">
              {getInitials(actorName)}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-sm">{actorName}</span>
          <span className="text-muted-foreground text-sm">{action}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {badgeLabel}
          </Badge>
        </div>

        <div className="min-w-0">
          {canOpenTask ? (
            <button
              className="block max-w-full truncate text-left font-medium text-sm underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onOpenTask(entry)}
              type="button"
            >
              {entry.task_name}
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate font-medium text-muted-foreground text-sm">
                {entry.task_name}
              </p>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {t('tasks-logs.deleted' as any)}
              </Badge>
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(changedAt)}
          </p>
        </div>

        {fieldLabel &&
          !(
            entry.change_type === 'field_updated' &&
            entry.field_name === 'description'
          ) && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className="h-5 px-1.5">
                {fieldLabel}
              </Badge>
              {entry.change_type === 'field_updated' &&
                entry.field_name !== 'description' && (
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <ActivityFieldValue
                      entry={entry}
                      listNameById={listNameById}
                      value={entry.old_value}
                    />
                    <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <ActivityFieldValue
                      entry={entry}
                      listNameById={listNameById}
                      value={entry.new_value}
                    />
                  </span>
                )}
            </div>
          )}

        {entry.change_type === 'field_updated' &&
          entry.field_name === 'description' && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className="h-5 px-1.5">
                {historyT('field.description')}
              </Badge>
              <ActivityDescriptionChange
                historyT={historyT}
                newValue={entry.new_value}
                oldValue={entry.old_value}
              />
            </div>
          )}

        {entry.change_type === 'task_created' && createdDescription && (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline" className="h-5 px-1.5">
              {historyT('field.description')}
            </Badge>
            <ActivityDescriptionChange
              historyT={historyT}
              newValue={createdDescription}
              oldValue={null}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function BoardActivitySettings({
  boardId,
  taskLists = [],
  wsId,
}: {
  boardId: string;
  taskLists?: TaskListNameSummary[];
  wsId: string;
}) {
  const t = useTranslations();
  const historyT = useTranslations('tasks.history') as TranslationFn;
  const [changeType, setChangeType] = useState('all');
  const [search, setSearch] = useState('');
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const changeTypeOptions = useMemo(
    () =>
      [
        'all',
        'task_created',
        'field_updated',
        'assignee_added',
        'assignee_removed',
        'label_added',
        'label_removed',
        'project_linked',
        'project_unlinked',
      ].map((value) => ({
        value,
        label:
          value === 'all' ? t('common.all') : formatActivityToken(value, value),
      })),
    [t]
  );

  const listNameById = useMemo(() => {
    const map = new Map<string, string>();

    for (const list of taskLists) {
      if (list.name) map.set(list.id, list.name);
    }

    return map;
  }, [taskLists]);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useInfiniteQuery({
    queryKey: [
      'task-board-settings-activity',
      wsId,
      boardId,
      changeType,
      search,
    ],
    queryFn: ({ pageParam }) =>
      listWorkspaceTaskHistory(
        wsId,
        {
          boardId,
          changeType: changeType === 'all' ? undefined : changeType,
          page: pageParam,
          pageSize: ACTIVITY_PAGE_SIZE,
          search: search.trim() || undefined,
        },
        getBrowserInternalApiOptions()
      ),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (total, page) => total + page.data.length,
        0
      );

      return loaded < lastPage.count ? lastPage.page + 1 : undefined;
    },
    enabled: Boolean(wsId && boardId),
    staleTime: 30_000,
  });

  const entries = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data?.pages]
  );
  const totalCount = data?.pages[0]?.count ?? 0;
  const loadedCount = entries.length;
  const mostCommonChangeType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const key = entry.change_type ?? 'unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [entries]);
  const lastActivity = entries[0]?.changed_at
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(entries[0].changed_at))
    : null;

  const handleOpenTask = useCallback(
    (entry: WorkspaceTaskHistoryEntry) => {
      if (!entry.task_id) return;

      dispatchRequestOpenTask({
        taskId: entry.task_id,
        wsId,
      });
    },
    [wsId]
  );

  useEffect(() => {
    const node = loadMoreRef.current;
    if (
      !node ||
      !hasNextPage ||
      isFetchingNextPage ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (observedEntries) => {
        if (observedEntries.some((entry) => entry.isIntersecting)) {
          void fetchNextPage();
        }
      },
      { rootMargin: '120px' }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 font-medium">
            <History className="h-4 w-4" />
            {t('settings.tasks.board_activity')}
          </h3>
          <p className="text-muted-foreground text-sm">
            {t('settings.tasks.board_activity_description')}
          </p>
        </div>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              disabled={isFetching}
              onClick={() => void refetch()}
              size="icon"
              type="button"
              variant="outline"
              aria-label={t('common.refresh')}
              className="h-8 w-8"
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('common.refresh')}</TooltipContent>
        </Tooltip>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border bg-muted/20 p-2">
          <div className="text-muted-foreground text-xs">
            {t('settings.tasks.board_activity')}
          </div>
          <div className="font-medium text-sm">{totalCount}</div>
          {totalCount > 0 && (
            <div className="text-[10px] text-muted-foreground">
              {loadedCount}/{totalCount}
            </div>
          )}
        </div>
        <div className="rounded-md border bg-muted/20 p-2">
          <div className="text-muted-foreground text-xs">
            {t('common.lastModified')}
          </div>
          <div className="truncate font-medium text-sm">
            {lastActivity ?? '-'}
          </div>
        </div>
        <div className="rounded-md border bg-muted/20 p-2">
          <div className="text-muted-foreground text-xs">
            {t('common.status')}
          </div>
          <div className="truncate font-medium text-sm">
            {mostCommonChangeType
              ? formatActivityToken(mostCommonChangeType, mostCommonChangeType)
              : '-'}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-[12rem_1fr]">
        <Combobox
          mode="single"
          options={changeTypeOptions}
          selected={changeType}
          onChange={(value) => setChangeType(value as string)}
          placeholder={t('common.all')}
          searchPlaceholder={t('common.search_tasks')}
          className="[&_button]:h-9"
          contentWidth="md"
        />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('common.search_tasks')}
            className="h-9 pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-destructive text-sm">
            {t('settings.tasks.activity_load_failed')}
          </p>
          <Button
            className="h-8 shrink-0"
            onClick={() => void refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t('common.refresh')}
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground text-sm">
          {t('settings.tasks.no_board_activity')}
        </p>
      ) : (
        <div className="rounded-md border p-2">
          {entries.map((entry) => (
            <ActivityTimelineEntry
              entry={entry}
              historyT={historyT}
              key={entry.id}
              listNameById={listNameById}
              onOpenTask={handleOpenTask}
            />
          ))}
          <div ref={loadMoreRef} className="flex justify-center px-2 pt-2">
            {hasNextPage ? (
              <Button
                className="h-8"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
                size="sm"
                type="button"
                variant="ghost"
              >
                {isFetchingNextPage ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {isFetchingNextPage
                  ? t('common.loading')
                  : t('common.load_more')}
              </Button>
            ) : (
              <span className="py-1 text-muted-foreground text-xs">
                {t('settings.tasks.board_activity_end')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
