'use client';

import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  Eye,
  FileText,
  Flag,
  FolderKanban,
  horseHead,
  Icon,
  Layers,
  Plus,
  Rabbit,
  RotateCcw,
  Tag,
  Target,
  Trash2,
  Turtle,
  UserMinus,
  UserPlus,
  unicornHead,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import {
  type EstimationType,
  mapEstimationPoints,
} from '@tuturuuu/ui/tu-do/shared/estimation-mapping';
import { cn } from '@tuturuuu/utils/format';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import type React from 'react';
import { useMemo, useState } from 'react';
import { DescriptionDiffViewer } from '@/components/tasks/description-diff-viewer';
import { TextDiffViewer } from '@/components/tasks/text-diff-viewer';
import type { TaskHistoryLogEntry } from './columns';

// Priority styling constants (matching task card)
const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Urgent',
  high: 'High',
  normal: 'Medium',
  low: 'Low',
};

const PRIORITY_BADGE_COLORS: Record<string, string> = {
  critical:
    'bg-dynamic-red/20 border-dynamic-red/50 text-dynamic-red shadow-sm shadow-dynamic-red/50',
  high: 'bg-dynamic-orange/10 border-dynamic-orange/30 text-dynamic-orange',
  normal: 'bg-dynamic-yellow/10 border-dynamic-yellow/30 text-dynamic-yellow',
  low: 'bg-dynamic-blue/10 border-dynamic-blue/30 text-dynamic-blue',
};

function getPriorityIcon(
  priority: string,
  className?: string
): React.ReactNode {
  const icons: Record<string, React.ReactElement> = {
    critical: <Icon iconNode={unicornHead} className={className} />,
    high: <Icon iconNode={horseHead} className={className} />,
    normal: <Rabbit className={className} />,
    low: <Turtle className={className} />,
  };
  return icons[priority] || null;
}

function renderPriorityBadge(
  priority: string | number | null
): React.ReactNode {
  if (priority === null || priority === undefined) return null;

  // Handle numeric priority (legacy)
  const priorityMap: Record<number, string> = {
    1: 'low',
    2: 'normal',
    3: 'high',
    4: 'critical',
  };

  const priorityKey =
    typeof priority === 'number' ? priorityMap[priority] : priority;
  if (!priorityKey || !PRIORITY_LABELS[priorityKey]) return null;

  return (
    <Badge
      variant="secondary"
      className={cn('gap-1 p-0.75 text-xs', PRIORITY_BADGE_COLORS[priorityKey])}
    >
      {getPriorityIcon(priorityKey, 'size-3')}
      {PRIORITY_LABELS[priorityKey]}
    </Badge>
  );
}

interface LogsTimelineProps {
  entries: TaskHistoryLogEntry[];
  wsId: string;
  locale: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
  className?: string;
  /** Time window in minutes for grouping rapid successive changes (default: 5) */
  rapidChangeWindowMinutes?: number;
  /** Map of board_id -> estimation_type for proper estimation display */
  estimationTypes?: Record<string, string | null>;
}

/** Represents a group of rapid successive changes to the same task by the same user */
interface RapidChangeGroup {
  id: string;
  task_id: string | null;
  task_name: string;
  task_deleted_at?: string;
  task_permanently_deleted?: boolean;
  board_id?: string;
  user: TaskHistoryLogEntry['user'];
  first_changed_at: string;
  last_changed_at: string;
  entries: TaskHistoryLogEntry[];
  is_grouped: true;
  change_count: number;
}

/** Represents an aggregated group of same-type actions (e.g., multiple assignees added at once) */
interface AggregatedActionGroup {
  id: string;
  task_id: string | null;
  task_name: string;
  task_deleted_at?: string;
  task_permanently_deleted?: boolean;
  board_id?: string;
  user: TaskHistoryLogEntry['user'];
  changed_at: string;
  change_type: TaskHistoryLogEntry['change_type'];
  entries: TaskHistoryLogEntry[];
  is_aggregated: true;
  aggregated_items: Array<{
    name: string;
    avatar_url?: string;
    color?: string;
  }>;
}

type TimelineItem =
  | TaskHistoryLogEntry
  | RapidChangeGroup
  | AggregatedActionGroup;

function isRapidChangeGroup(item: TimelineItem): item is RapidChangeGroup {
  return 'is_grouped' in item && item.is_grouped === true;
}

function isAggregatedActionGroup(
  item: TimelineItem
): item is AggregatedActionGroup {
  return 'is_aggregated' in item && item.is_aggregated === true;
}

/** Check if a change type should be aggregated (multiple items shown as one) */
function isAggregatableChangeType(changeType: string): boolean {
  return [
    'assignee_added',
    'assignee_removed',
    'label_added',
    'label_removed',
  ].includes(changeType);
}

/** Extract item details from an entry for aggregation */
function extractAggregatedItem(
  entry: TaskHistoryLogEntry
): { name: string; avatar_url?: string; color?: string } | null {
  const { change_type, old_value, new_value, metadata } = entry;

  switch (change_type) {
    case 'assignee_added': {
      const data = new_value as {
        user_name?: string;
        avatar_url?: string;
      } | null;
      return {
        name:
          data?.user_name || (metadata?.assignee_name as string) || 'Unknown',
        avatar_url: data?.avatar_url,
      };
    }
    case 'assignee_removed': {
      const data = old_value as {
        user_name?: string;
        avatar_url?: string;
      } | null;
      return {
        name:
          data?.user_name || (metadata?.assignee_name as string) || 'Unknown',
        avatar_url: data?.avatar_url,
      };
    }
    case 'label_added': {
      const data = new_value as { name?: string; color?: string } | null;
      return {
        name: data?.name || (metadata?.label_name as string) || 'Unknown',
        color: data?.color || (metadata?.label_color as string),
      };
    }
    case 'label_removed': {
      const data = old_value as { name?: string; color?: string } | null;
      return {
        name: data?.name || (metadata?.label_name as string) || 'Unknown',
        color: data?.color || (metadata?.label_color as string),
      };
    }
    default:
      return null;
  }
}

interface GroupedEntries {
  date: string;
  dateLabel: string;
  entries: TimelineItem[];
}

/**
 * Groups rapid successive changes to the same task by the same user within a time window.
 * Also aggregates same-type actions (like multiple assignee_added) into single entries.
 */
function groupRapidSuccessiveChanges(
  entries: TaskHistoryLogEntry[],
  timeWindowMinutes: number
): TimelineItem[] {
  if (entries.length <= 1) {
    // Even single entries might need aggregation check
    if (entries.length === 1) return entries;
    return entries;
  }

  // Sort by changed_at descending (newest first)
  const sorted = [...entries].sort(
    (a, b) =>
      new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  );

  const result: TimelineItem[] = [];
  const processed = new Set<string>();

  // Helper to check if two entries refer to the same task
  const isSameTask = (a: TaskHistoryLogEntry, b: TaskHistoryLogEntry) => {
    if (a.task_id && b.task_id) return a.task_id === b.task_id;
    // Fallback for permanently deleted tasks (null task_id)
    return !a.task_id && !b.task_id && a.task_name === b.task_name;
  };

  for (const entry of sorted) {
    if (processed.has(entry.id)) continue;

    const entryTime = new Date(entry.changed_at).getTime();

    // First, try to aggregate same-type actions for the same task by the same user
    if (isAggregatableChangeType(entry.change_type)) {
      const sameTypeEntries: TaskHistoryLogEntry[] = [entry];

      for (const otherEntry of sorted) {
        if (processed.has(otherEntry.id) || otherEntry.id === entry.id)
          continue;

        const otherTime = new Date(otherEntry.changed_at).getTime();
        const diffMinutes = Math.abs(entryTime - otherTime) / (1000 * 60);

        // Aggregate same-type actions for the same task by the same user within the time window
        if (
          isSameTask(otherEntry, entry) &&
          otherEntry.changed_by === entry.changed_by &&
          otherEntry.change_type === entry.change_type &&
          diffMinutes <= timeWindowMinutes
        ) {
          sameTypeEntries.push(otherEntry);
        }
      }

      if (sameTypeEntries.length > 1) {
        // Create an aggregated action group
        const aggregatedItems = sameTypeEntries
          .map(extractAggregatedItem)
          .filter((item): item is NonNullable<typeof item> => item !== null);

        // Sort chronologically
        const chronological = [...sameTypeEntries].sort(
          (a, b) =>
            new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
        );

        result.push({
          id: entry.id,
          task_id: entry.task_id,
          task_name: entry.task_name,
          task_deleted_at: entry.task_deleted_at,
          task_permanently_deleted: entry.task_permanently_deleted,
          board_id: entry.board_id,
          user: entry.user,
          changed_at: chronological[chronological.length - 1]!.changed_at,
          change_type: entry.change_type,
          entries: chronological,
          is_aggregated: true,
          aggregated_items: aggregatedItems,
        });

        sameTypeEntries.forEach((e) => {
          processed.add(e.id);
        });
        continue;
      }
    }

    // Find all entries for the same task by the same user within the time window (different types)
    const groupEntries: TaskHistoryLogEntry[] = [entry];

    for (const otherEntry of sorted) {
      if (processed.has(otherEntry.id) || otherEntry.id === entry.id) continue;

      const otherTime = new Date(otherEntry.changed_at).getTime();
      const diffMinutes = Math.abs(entryTime - otherTime) / (1000 * 60);

      if (
        isSameTask(otherEntry, entry) &&
        otherEntry.changed_by === entry.changed_by &&
        diffMinutes <= timeWindowMinutes
      ) {
        groupEntries.push(otherEntry);
      }
    }

    if (groupEntries.length > 1) {
      // Sort chronologically (oldest first) for display
      const chronological = [...groupEntries].sort(
        (a, b) =>
          new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
      );

      result.push({
        id: entry.id,
        task_id: entry.task_id,
        task_name: entry.task_name,
        task_deleted_at: entry.task_deleted_at,
        task_permanently_deleted: entry.task_permanently_deleted,
        board_id: entry.board_id,
        user: entry.user,
        first_changed_at: chronological[0]!.changed_at,
        last_changed_at: chronological[chronological.length - 1]!.changed_at,
        entries: chronological,
        is_grouped: true,
        change_count: groupEntries.length,
      });

      groupEntries.forEach((e) => {
        processed.add(e.id);
      });
    } else {
      result.push(entry);
      processed.add(entry.id);
    }
  }

  // Sort result by most recent timestamp
  return result.sort((a, b) => {
    const aTime = isRapidChangeGroup(a)
      ? new Date(a.last_changed_at).getTime()
      : isAggregatedActionGroup(a)
        ? new Date(a.changed_at).getTime()
        : new Date((a as TaskHistoryLogEntry).changed_at).getTime();
    const bTime = isRapidChangeGroup(b)
      ? new Date(b.last_changed_at).getTime()
      : isAggregatedActionGroup(b)
        ? new Date(b.changed_at).getTime()
        : new Date((b as TaskHistoryLogEntry).changed_at).getTime();
    return bTime - aTime;
  });
}

export default function LogsTimeline({
  entries,
  wsId,
  locale,
  t,
  className,
  rapidChangeWindowMinutes = 5,
  estimationTypes,
}: LogsTimelineProps) {
  const dateLocale = locale === 'vi' ? vi : enUS;

  // Calculate latest deletion entries for permanently deleted tasks
  const latestDeletions = useMemo(() => {
    const deletions = new Set<string>();
    const processedTasks = new Set<string>();

    // Entries are typically sorted by date descending, but let's be safe
    // We want the NEWEST 'deleted_at' entry for each task
    const sortedEntries = [...entries].sort(
      (a, b) =>
        new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
    );

    for (const entry of sortedEntries) {
      if (
        entry.task_permanently_deleted &&
        entry.change_type === 'field_updated' &&
        entry.field_name === 'deleted_at' &&
        // Check if it's a delete action (not restore)
        entry.new_value !== null &&
        entry.new_value !== undefined &&
        entry.new_value !== '' &&
        entry.new_value !== 'null'
      ) {
        // For permanently deleted tasks, task_id is null.
        // We use task_name as a fallback key to distinguish between different deleted tasks.
        const taskKey = entry.task_id || `null-${entry.task_name}`;

        if (!processedTasks.has(taskKey)) {
          deletions.add(entry.id);
          processedTasks.add(taskKey);
        }
      }
    }
    return deletions;
  }, [entries]);

  // Group entries by date, then apply rapid change grouping
  const groupedEntries = useMemo(() => {
    const groups = new Map<string, TaskHistoryLogEntry[]>();

    entries.forEach((entry) => {
      const date = new Date(entry.changed_at);
      const dateKey = format(date, 'yyyy-MM-dd');

      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(entry);
    });

    const result: GroupedEntries[] = [];
    groups.forEach((dayEntries, dateKey) => {
      const date = new Date(dateKey);
      let dateLabel: string;

      if (isToday(date)) {
        dateLabel = t('date.today', { defaultValue: 'Today' });
      } else if (isYesterday(date)) {
        dateLabel = t('date.yesterday', { defaultValue: 'Yesterday' });
      } else {
        dateLabel = format(date, 'EEEE, MMMM d, yyyy', { locale: dateLocale });
      }

      // Apply rapid successive change grouping to each day's entries
      const groupedDayEntries = groupRapidSuccessiveChanges(
        dayEntries,
        rapidChangeWindowMinutes
      );

      result.push({
        date: dateKey,
        dateLabel,
        entries: groupedDayEntries,
      });
    });

    return result;
  }, [entries, t, dateLocale, rapidChangeWindowMinutes]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-8', className)}>
      {groupedEntries.map((group, groupIndex) => (
        <motion.div
          key={group.date}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: groupIndex * 0.1 }}
          className="space-y-3"
        >
          {/* Date header */}
          <div className="sticky top-0 z-10 flex items-center gap-3 py-2 backdrop-blur">
            <div className="h-px flex-1 bg-border" />
            <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground text-xs">
              {group.dateLabel}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Entries for this date */}
          <div className="space-y-2">
            {group.entries.map((item, index) =>
              isRapidChangeGroup(item) ? (
                <RapidChangeGroupEntry
                  key={item.id}
                  group={item}
                  wsId={wsId}
                  locale={locale}
                  t={t}
                  index={index}
                  dateLocale={dateLocale}
                  estimationType={
                    item.board_id ? estimationTypes?.[item.board_id] : undefined
                  }
                  latestDeletions={latestDeletions}
                />
              ) : isAggregatedActionGroup(item) ? (
                <AggregatedActionEntry
                  key={item.id}
                  group={item}
                  wsId={wsId}
                  t={t}
                  index={index}
                  dateLocale={dateLocale}
                />
              ) : (
                <TimelineEntry
                  key={item.id}
                  entry={item}
                  wsId={wsId}
                  locale={locale}
                  t={t}
                  index={index}
                  dateLocale={dateLocale}
                  estimationType={
                    item.board_id ? estimationTypes?.[item.board_id] : undefined
                  }
                  isLatestDeletion={latestDeletions.has(item.id)}
                />
              )
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

interface RapidChangeGroupEntryProps {
  group: RapidChangeGroup;
  wsId: string;
  locale: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
  index: number;
  dateLocale: typeof enUS | typeof vi;
  /** Estimation type for proper points display */
  estimationType?: EstimationType;
  /** Set of IDs for entries that are the latest deletion for a permanently deleted task */
  latestDeletions?: Set<string>;
}

function RapidChangeGroupEntry({
  group,
  wsId,
  locale,
  t,
  index,
  dateLocale,
  estimationType,
  latestDeletions,
}: RapidChangeGroupEntryProps) {
  const [expanded, setExpanded] = useState(false);

  const startTime = new Date(group.first_changed_at);
  const endTime = new Date(group.last_changed_at);

  const userName =
    group.user?.name || t('unknown_user', { defaultValue: 'Unknown user' });
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Get change type distribution for summary
  const changeTypeCounts = group.entries.reduce(
    (acc, e) => {
      const key =
        e.change_type === 'field_updated'
          ? `field:${e.field_name}`
          : e.change_type;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const changeTypeSummary = Object.entries(changeTypeCounts)
    .slice(0, 3)
    .map(([type, count]) => {
      let label: string;
      if (type.startsWith('field:')) {
        const fieldName = type.replace('field:', '');
        label = t(`field_name.${fieldName}`, { defaultValue: fieldName });
      } else {
        label = t(`change_type.${type}`, { defaultValue: type });
      }
      return count > 1 ? `${label} (${count})` : label;
    })
    .join(', ');

  const timeAgo = formatDistanceToNow(endTime, {
    addSuffix: true,
    locale: dateLocale,
  });

  // Find description changes in the group for showing diff viewers
  const descriptionChanges = group.entries
    .filter(
      (e) => e.change_type === 'field_updated' && e.field_name === 'description'
    )
    .map((e) => ({
      id: e.id,
      oldValue: e.old_value,
      newValue: e.new_value,
    }));

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group relative overflow-hidden rounded-lg border bg-card transition-all hover:border-foreground/20 hover:shadow-sm"
    >
      {/* Header - clickable to expand */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full gap-3 p-4 text-left"
      >
        {/* Icon indicator */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-dynamic-indigo/10">
          <Layers className="h-4 w-4 text-dynamic-indigo" />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Header row */}
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* User info */}
            <div className="flex items-center gap-1.5">
              <Avatar className="h-5 w-5">
                <AvatarImage
                  src={group.user?.avatar_url || undefined}
                  alt={userName}
                />
                <AvatarFallback className="text-[10px]">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">{userName}</span>
            </div>

            {/* Change count badge */}
            <Badge variant="secondary" className="gap-1 text-xs">
              <Layers className="h-3 w-3" />
              {group.change_count} {t('changes', { defaultValue: 'changes' })}
            </Badge>

            {/* Task link */}
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  {group.task_permanently_deleted ? (
                    <span className="max-w-[150px] truncate font-medium text-muted-foreground text-sm line-through md:max-w-[250px]">
                      {group.task_name}
                    </span>
                  ) : (
                    <Link
                      href={`/${wsId}/tasks/${group.task_id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        'max-w-[150px] truncate font-medium text-sm hover:underline md:max-w-[250px]',
                        group.task_deleted_at
                          ? 'text-muted-foreground line-through'
                          : 'text-foreground'
                      )}
                    >
                      {group.task_name}
                    </Link>
                  )}
                </TooltipTrigger>
                {group.task_name.length > 25 && (
                  <TooltipContent
                    side="bottom"
                    className="wrap-break-word max-w-md text-sm"
                  >
                    {group.task_name}
                  </TooltipContent>
                )}
              </Tooltip>
              {group.task_permanently_deleted ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-dynamic-red/50 bg-dynamic-red/20 px-1.5 py-0.5 text-dynamic-red text-xs"
                >
                  <Trash2 className="h-3 w-3" />
                  {t('permanently_deleted', {
                    defaultValue: 'Permanently Deleted',
                  })}
                </Badge>
              ) : group.task_deleted_at ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-dynamic-orange/30 bg-dynamic-orange/10 px-1.5 py-0.5 text-dynamic-orange text-xs"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t('in_trash', { defaultValue: 'In Trash' })}
                </Badge>
              ) : null}
            </div>

            {/* Expand indicator */}
            <ChevronDown
              className={cn(
                'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-180'
              )}
            />
          </div>

          {/* Change type summary */}
          <p className="mb-1 text-muted-foreground text-xs">
            {changeTypeSummary}
          </p>

          {/* Timestamp row */}
          <p className="text-muted-foreground text-xs">
            {(() => {
              const startFormatted = format(startTime, 'HH:mm', {
                locale: dateLocale,
              });
              const endFormatted = format(endTime, 'HH:mm', {
                locale: dateLocale,
              });
              const isSameTime = startFormatted === endFormatted;

              return (
                <>
                  <span className="font-medium">{startFormatted}</span>
                  {!isSameTime && (
                    <>
                      <span className="mx-1 opacity-50">-</span>
                      <span className="font-medium">{endFormatted}</span>
                    </>
                  )}
                </>
              );
            })()}
            <span className="mx-1.5 opacity-50">·</span>
            <span>{timeAgo}</span>
          </p>
        </div>
      </button>

      {/* Show diff viewers for description changes in the group - outside button to avoid nesting */}
      {descriptionChanges.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t px-4 py-2">
          {descriptionChanges.map((change, idx) => (
            <DescriptionDiffViewer
              key={change.id}
              oldValue={change.oldValue}
              newValue={change.newValue}
              t={t}
              triggerVariant="inline"
              trigger={
                descriptionChanges.length > 1 ? (
                  <span className="inline-flex cursor-pointer items-center gap-1 text-dynamic-blue text-xs hover:underline">
                    <Eye className="h-3 w-3" />
                    {t('view_changes', {
                      defaultValue: 'View changes',
                    })}{' '}
                    #{idx + 1}
                  </span>
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t"
          >
            <div className="space-y-2 p-4 pt-3">
              {group.entries.map((entry, i) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  wsId={wsId}
                  locale={locale}
                  t={t}
                  index={i}
                  dateLocale={dateLocale}
                  compact
                  estimationType={estimationType}
                  isLatestDeletion={latestDeletions?.has(entry.id)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface AggregatedActionEntryProps {
  group: AggregatedActionGroup;
  wsId: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
  index: number;
  dateLocale: typeof enUS | typeof vi;
}

function AggregatedActionEntry({
  group,
  wsId,
  t,
  index,
  dateLocale,
}: AggregatedActionEntryProps) {
  const { icon, color } = getChangeIcon(group.change_type, null);
  const timeAgo = formatDistanceToNow(new Date(group.changed_at), {
    addSuffix: true,
    locale: dateLocale,
  });
  const exactTime = format(new Date(group.changed_at), 'HH:mm', {
    locale: dateLocale,
  });

  const userName =
    group.user?.name || t('unknown_user', { defaultValue: 'Unknown user' });
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  // Get action label based on change type
  const getActionLabel = () => {
    switch (group.change_type) {
      case 'assignee_added':
        return t('assigned_multiple', { defaultValue: 'assigned' });
      case 'assignee_removed':
        return t('unassigned_multiple', { defaultValue: 'unassigned' });
      case 'label_added':
        return t('added_labels', { defaultValue: 'added labels' });
      case 'label_removed':
        return t('removed_labels', { defaultValue: 'removed labels' });
      default:
        return t('updated', { defaultValue: 'updated' });
    }
  };

  // Format aggregated items list
  const formatItemsList = () => {
    const items = group.aggregated_items;
    if (items.length === 0) return null;

    const isAssignee =
      group.change_type === 'assignee_added' ||
      group.change_type === 'assignee_removed';
    const isLabel =
      group.change_type === 'label_added' ||
      group.change_type === 'label_removed';
    const isRemoved =
      group.change_type === 'assignee_removed' ||
      group.change_type === 'label_removed';

    if (isAssignee) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {items.map((item, i) => (
            <Badge
              key={i}
              variant={isRemoved ? 'outline' : 'secondary'}
              className={cn('gap-1.5 text-xs', isRemoved && 'opacity-70')}
            >
              <Avatar className="h-4 w-4">
                <AvatarImage
                  src={item.avatar_url || undefined}
                  alt={item.name}
                />
                <AvatarFallback className="text-[8px]">
                  {item.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <span className={cn(isRemoved && 'line-through')}>
                {item.name}
              </span>
            </Badge>
          ))}
        </div>
      );
    }

    if (isLabel) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {items.map((item, i) => (
            <Badge
              key={i}
              variant={isRemoved ? 'outline' : 'secondary'}
              className={cn('gap-1.5 text-xs', isRemoved && 'opacity-70')}
              style={
                item.color
                  ? isRemoved
                    ? { borderColor: `${item.color}60`, color: item.color }
                    : {
                        backgroundColor: `${item.color}20`,
                        borderColor: `${item.color}40`,
                        color: item.color,
                      }
                  : undefined
              }
            >
              {item.color && (
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    isRemoved && 'opacity-60'
                  )}
                  style={{ backgroundColor: item.color }}
                />
              )}
              {item.name}
            </Badge>
          ))}
        </div>
      );
    }

    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group relative flex gap-3 rounded-lg border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
    >
      {/* Icon indicator */}
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          color
        )}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header row */}
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* User info */}
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              <AvatarImage
                src={group.user?.avatar_url || undefined}
                alt={userName}
              />
              <AvatarFallback className="text-[10px]">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-sm">{userName}</span>
          </div>

          {/* Action */}
          <span className="text-muted-foreground text-sm">
            {getActionLabel()}
          </span>

          {/* Task link */}
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                {group.task_permanently_deleted ? (
                  <span className="max-w-[200px] truncate font-medium text-muted-foreground text-sm line-through md:max-w-[300px]">
                    {group.task_name}
                  </span>
                ) : (
                  <Link
                    href={`/${wsId}/tasks/${group.task_id}`}
                    className={cn(
                      'max-w-[200px] truncate font-medium text-sm hover:underline md:max-w-[300px]',
                      group.task_deleted_at
                        ? 'text-muted-foreground line-through'
                        : 'text-foreground'
                    )}
                  >
                    {group.task_name}
                  </Link>
                )}
              </TooltipTrigger>
              {group.task_name.length > 30 && (
                <TooltipContent
                  side="bottom"
                  className="wrap-break-word max-w-md text-sm"
                >
                  {group.task_name}
                </TooltipContent>
              )}
            </Tooltip>
            {group.task_permanently_deleted ? (
              <Badge
                variant="outline"
                className="gap-1 border-dynamic-red/50 bg-dynamic-red/20 px-1.5 py-0.5 text-dynamic-red text-xs"
              >
                <Trash2 className="h-3 w-3" />
                {t('permanently_deleted', {
                  defaultValue: 'Permanently Deleted',
                })}
              </Badge>
            ) : group.task_deleted_at ? (
              <Badge
                variant="outline"
                className="gap-1 border-dynamic-orange/30 bg-dynamic-orange/10 px-1.5 py-0.5 text-dynamic-orange text-xs"
              >
                <RotateCcw className="h-3 w-3" />
                {t('in_trash', { defaultValue: 'In Trash' })}
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Aggregated items */}
        <div className="mb-2">{formatItemsList()}</div>

        {/* Timestamp */}
        <p className="text-muted-foreground text-xs">
          <span className="font-medium">{exactTime}</span>
          <span className="mx-1.5 opacity-50">·</span>
          <span>{timeAgo}</span>
        </p>
      </div>
    </motion.div>
  );
}

interface TimelineEntryProps {
  entry: TaskHistoryLogEntry;
  wsId: string;
  locale: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
  index: number;
  dateLocale: typeof enUS | typeof vi;
  /** Compact mode for nested display within groups */
  compact?: boolean;
  /** Estimation type for proper points display */
  estimationType?: EstimationType;
  /** Whether this entry is the latest deletion for a permanently deleted task */
  isLatestDeletion?: boolean;
}

function TimelineEntry({
  entry,
  wsId,
  t,
  index,
  dateLocale,
  compact = false,
  estimationType,
  isLatestDeletion,
}: TimelineEntryProps) {
  const { icon, color } = getChangeIcon(
    entry.change_type,
    entry.field_name,
    entry.new_value
  );
  const description = getChangeDescription(
    entry,
    t,
    estimationType,
    isLatestDeletion
  );
  const timeAgo = formatDistanceToNow(new Date(entry.changed_at), {
    addSuffix: true,
    locale: dateLocale,
  });
  const exactTime = format(new Date(entry.changed_at), 'HH:mm', {
    locale: dateLocale,
  });

  const userName =
    entry.user?.name || t('unknown_user', { defaultValue: 'Unknown user' });
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        'group relative flex gap-3 rounded-lg transition-all',
        compact
          ? 'bg-muted/30 p-3'
          : 'border bg-card p-4 hover:border-foreground/20 hover:shadow-sm'
      )}
    >
      {/* Icon indicator */}
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          compact ? 'h-7 w-7' : 'h-9 w-9',
          color
        )}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header row */}
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* User info - hidden in compact mode since parent shows it */}
          {!compact && (
            <div className="flex items-center gap-1.5">
              <Avatar className="h-5 w-5">
                <AvatarImage
                  src={entry.user?.avatar_url || undefined}
                  alt={userName}
                />
                <AvatarFallback className="text-[10px]">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-sm">{userName}</span>
            </div>
          )}

          {/* Action */}
          <span
            className={cn(
              'text-muted-foreground text-sm',
              compact && 'capitalize'
            )}
          >
            {description.action}
          </span>

          {/* Task link - hidden in compact mode since parent shows it */}
          {!compact && (
            <div className="flex items-center gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  {entry.task_permanently_deleted ? (
                    <span className="max-w-[200px] truncate font-medium text-muted-foreground text-sm line-through md:max-w-[300px]">
                      {entry.task_name}
                    </span>
                  ) : (
                    <Link
                      href={`/${wsId}/tasks/${entry.task_id}`}
                      className={cn(
                        'max-w-[200px] truncate font-medium text-sm hover:underline md:max-w-[300px]',
                        entry.task_deleted_at
                          ? 'text-muted-foreground line-through'
                          : 'text-foreground'
                      )}
                    >
                      {entry.task_name}
                    </Link>
                  )}
                </TooltipTrigger>
                {entry.task_name.length > 30 && (
                  <TooltipContent
                    side="bottom"
                    className="wrap-break-word max-w-md text-sm"
                  >
                    {entry.task_name}
                  </TooltipContent>
                )}
              </Tooltip>
              {entry.task_permanently_deleted ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-dynamic-red/50 bg-dynamic-red/20 px-1.5 py-0.5 text-dynamic-red text-xs"
                >
                  <Trash2 className="h-3 w-3" />
                  {t('permanently_deleted', {
                    defaultValue: 'Permanently Deleted',
                  })}
                </Badge>
              ) : entry.task_deleted_at ? (
                <Badge
                  variant="outline"
                  className="gap-1 border-dynamic-orange/30 bg-dynamic-orange/10 px-1.5 py-0.5 text-dynamic-orange text-xs"
                >
                  <RotateCcw className="h-3 w-3" />
                  {t('in_trash', { defaultValue: 'In Trash' })}
                </Badge>
              ) : null}
            </div>
          )}
        </div>

        {/* Change details */}
        {description.details && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {description.noDetailsWrapper ? (
              <div className="inline-flex items-center gap-2 text-sm">
                {description.details}
              </div>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                {description.details}
              </div>
            )}
            {description.showDescriptionDiff && (
              <DescriptionDiffViewer
                oldValue={entry.old_value}
                newValue={entry.new_value}
                t={t}
              />
            )}
            {description.showNameDiff && (
              <TextDiffViewer
                oldValue={
                  typeof entry.old_value === 'string'
                    ? entry.old_value
                    : String(entry.old_value || '')
                }
                newValue={
                  typeof entry.new_value === 'string'
                    ? entry.new_value
                    : String(entry.new_value || '')
                }
                t={t}
                fieldLabel={t('name_changes', {
                  defaultValue: 'Task Name Changes',
                })}
              />
            )}
          </div>
        )}

        {/* Timestamp */}
        <p className="text-muted-foreground text-xs">
          <span className="font-medium">{exactTime}</span>
          {!compact && (
            <>
              <span className="mx-1.5 opacity-50">·</span>
              <span>{timeAgo}</span>
            </>
          )}
        </p>
      </div>
    </motion.div>
  );
}

function getChangeIcon(
  changeType: string,
  fieldName?: string | null,
  newValue?: unknown
): { icon: React.ReactNode; color: string } {
  if (changeType === 'field_updated') {
    switch (fieldName) {
      case 'name':
        return {
          icon: <FileText className="h-4 w-4 text-dynamic-blue" />,
          color: 'bg-dynamic-blue/10',
        };
      case 'description':
        return {
          icon: <FileText className="h-4 w-4 text-dynamic-purple" />,
          color: 'bg-dynamic-purple/10',
        };
      case 'priority':
        return {
          icon: <Flag className="h-4 w-4 text-dynamic-orange" />,
          color: 'bg-dynamic-orange/10',
        };
      case 'end_date':
        return {
          icon: <Calendar className="h-4 w-4 text-dynamic-red" />,
          color: 'bg-dynamic-red/10',
        };
      case 'start_date':
        return {
          icon: <Clock className="h-4 w-4 text-dynamic-cyan" />,
          color: 'bg-dynamic-cyan/10',
        };
      case 'estimation_points':
        return {
          icon: <Target className="h-4 w-4 text-dynamic-pink" />,
          color: 'bg-dynamic-pink/10',
        };
      case 'list_id':
        return {
          icon: <ArrowRight className="h-4 w-4 text-dynamic-indigo" />,
          color: 'bg-dynamic-indigo/10',
        };
      case 'completed':
        return {
          icon: <CheckCircle2 className="h-4 w-4 text-dynamic-green" />,
          color: 'bg-dynamic-green/10',
        };
      case 'deleted_at': {
        // Check if task was deleted or restored based on new_value
        const wasDeleted =
          newValue !== null &&
          newValue !== undefined &&
          newValue !== '' &&
          newValue !== 'null';
        return wasDeleted
          ? {
              icon: <RotateCcw className="h-4 w-4 text-dynamic-orange" />,
              color: 'bg-dynamic-orange/10',
            }
          : {
              icon: <RotateCcw className="h-4 w-4 text-dynamic-green" />,
              color: 'bg-dynamic-green/10',
            };
      }
      default:
        return {
          icon: <CircleDot className="h-4 w-4 text-muted-foreground" />,
          color: 'bg-muted',
        };
    }
  }

  switch (changeType) {
    case 'task_created':
      return {
        icon: <Plus className="h-4 w-4 text-dynamic-green" />,
        color: 'bg-dynamic-green/10',
      };
    case 'assignee_added':
      return {
        icon: <UserPlus className="h-4 w-4 text-dynamic-green" />,
        color: 'bg-dynamic-green/10',
      };
    case 'assignee_removed':
      return {
        icon: <UserMinus className="h-4 w-4 text-dynamic-red" />,
        color: 'bg-dynamic-red/10',
      };
    case 'label_added':
      return {
        icon: <Tag className="h-4 w-4 text-dynamic-yellow" />,
        color: 'bg-dynamic-yellow/10',
      };
    case 'label_removed':
      return {
        icon: <Tag className="h-4 w-4 text-dynamic-orange" />,
        color: 'bg-dynamic-orange/10',
      };
    case 'project_linked':
      return {
        icon: <FolderKanban className="h-4 w-4 text-dynamic-purple" />,
        color: 'bg-dynamic-purple/10',
      };
    case 'project_unlinked':
      return {
        icon: <FolderKanban className="h-4 w-4 text-dynamic-pink" />,
        color: 'bg-dynamic-pink/10',
      };
    default:
      return {
        icon: <CircleDot className="h-4 w-4 text-muted-foreground" />,
        color: 'bg-muted',
      };
  }
}

interface ChangeDescription {
  action: string;
  details?: React.ReactNode;
  showDescriptionDiff?: boolean;
  showNameDiff?: boolean;
  /** If true, details won't be wrapped with background/padding (for items with their own styling) */
  noDetailsWrapper?: boolean;
}

function getChangeDescription(
  entry: TaskHistoryLogEntry,
  t: (key: string, options?: { defaultValue?: string }) => string,
  estimationType?: EstimationType,
  isLatestDeletion?: boolean
): ChangeDescription {
  // Handle task_created
  if (entry.change_type === 'task_created') {
    const metadata = entry.metadata as Record<string, unknown> | null;
    const hasDescription = !!metadata?.description;
    const hasEstimation = metadata?.estimation_points != null;
    const hasStartDate = !!metadata?.start_date;
    const hasEndDate = !!metadata?.end_date;
    const listName = metadata?.list_name as string | undefined;

    const badges: React.ReactNode[] = [];
    if (listName) {
      badges.push(
        <Badge key="list" variant="outline" className="gap-1 text-xs">
          <ArrowRight className="h-3 w-3" />
          {listName}
        </Badge>
      );
    }
    if (hasDescription) {
      badges.push(
        <Badge key="desc" variant="secondary" className="text-xs">
          {t('with_description', { defaultValue: 'with description' })}
        </Badge>
      );
    }
    if (hasEstimation) {
      const points = metadata.estimation_points as number;
      const displayPoints = estimationType
        ? mapEstimationPoints(points, estimationType)
        : `${points} ${t('points', { defaultValue: 'pts' })}`;
      badges.push(
        <Badge key="est" variant="secondary" className="gap-1 text-xs">
          <Target className="h-3 w-3" />
          {displayPoints}
        </Badge>
      );
    }
    if (hasStartDate) {
      badges.push(
        <Badge key="start" variant="secondary" className="gap-1 text-xs">
          <Clock className="h-3 w-3" />
          {format(new Date(metadata.start_date as string), 'MMM d')}
        </Badge>
      );
    }
    if (hasEndDate) {
      badges.push(
        <Badge key="end" variant="secondary" className="gap-1 text-xs">
          <Calendar className="h-3 w-3" />
          {format(new Date(metadata.end_date as string), 'MMM d')}
        </Badge>
      );
    }

    return {
      action: t('task_created', { defaultValue: 'created' }),
      details:
        badges.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">{badges}</div>
        ) : undefined,
      noDetailsWrapper: true,
    };
  }

  if (entry.change_type === 'field_updated') {
    const fieldLabels: Record<string, string> = {
      name: t('field_updated.name', { defaultValue: 'updated the name of' }),
      description: t('field_updated.description', {
        defaultValue: 'updated description for',
      }),
      priority: t('field_updated.priority', {
        defaultValue: 'changed priority of',
      }),
      end_date: t('field_updated.end_date', {
        defaultValue: 'updated due date for',
      }),
      start_date: t('field_updated.start_date', {
        defaultValue: 'set start date for',
      }),
      estimation_points: t('field_updated.estimation_points', {
        defaultValue: 'updated points for',
      }),
      list_id: t('field_updated.list_id', { defaultValue: 'moved' }),
      completed: t('field_updated.completed', {
        defaultValue: 'changed status of',
      }),
      deleted_at: t('field_updated.deleted_at', {
        defaultValue: 'deleted',
      }),
    };

    const action =
      fieldLabels[entry.field_name || ''] ||
      t('field_updated.unknown', { defaultValue: 'updated' });

    // For description changes, show a simplified view with diff button
    if (entry.field_name === 'description') {
      const oldText = getDescriptionText(entry.old_value);
      const newText = getDescriptionText(entry.new_value);
      const oldSummary = oldText
        ? oldText.length > 30
          ? oldText.slice(0, 27) + '...'
          : oldText
        : t('value.empty', { defaultValue: 'Empty' });
      const newSummary = newText
        ? newText.length > 30
          ? newText.slice(0, 27) + '...'
          : newText
        : t('value.empty', { defaultValue: 'Empty' });

      const details = (
        <>
          <span className="text-muted-foreground line-through">
            {oldSummary}
          </span>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <span className="font-medium">{newSummary}</span>
        </>
      );

      return { action, details, showDescriptionDiff: true };
    }

    // For name changes, show truncated values with diff button for long names
    if (entry.field_name === 'name') {
      const oldName = String(entry.old_value || '');
      const newName = String(entry.new_value || '');
      const isLongChange = oldName.length > 40 || newName.length > 40;

      const oldSummary =
        oldName.length > 40 ? oldName.slice(0, 37) + '...' : oldName;
      const newSummary =
        newName.length > 40 ? newName.slice(0, 37) + '...' : newName;

      const details = (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="max-w-[150px] truncate text-muted-foreground line-through">
                {oldSummary}
              </span>
            </TooltipTrigger>
            {oldName.length > 40 && (
              <TooltipContent
                side="bottom"
                className="wrap-break-word max-w-md"
              >
                {oldName}
              </TooltipContent>
            )}
          </Tooltip>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="max-w-[150px] truncate font-medium">
                {newSummary}
              </span>
            </TooltipTrigger>
            {newName.length > 40 && (
              <TooltipContent
                side="bottom"
                className="wrap-break-word max-w-md"
              >
                {newName}
              </TooltipContent>
            )}
          </Tooltip>
        </>
      );

      return { action, details, showNameDiff: isLongChange };
    }

    // For priority changes, show styled priority badges
    if (entry.field_name === 'priority') {
      const oldPriorityBadge = renderPriorityBadge(
        entry.old_value as string | number | null
      );
      const newPriorityBadge = renderPriorityBadge(
        entry.new_value as string | number | null
      );

      const details = (
        <div className="flex items-center gap-2">
          {oldPriorityBadge ? (
            <span className="opacity-60">{oldPriorityBadge}</span>
          ) : (
            <span className="text-muted-foreground text-xs">
              {t('value.none', { defaultValue: 'None' })}
            </span>
          )}
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          {newPriorityBadge || (
            <span className="text-muted-foreground text-xs">
              {t('value.none', { defaultValue: 'None' })}
            </span>
          )}
        </div>
      );

      return { action, details, noDetailsWrapper: true };
    }

    // For list_id changes, show actual column names from metadata
    if (entry.field_name === 'list_id') {
      const metadata = entry.metadata as Record<string, unknown> | null;
      const oldListName =
        (metadata?.old_list_name as string) ||
        t('value.unknown_column', { defaultValue: 'Unknown' });
      const newListName =
        (metadata?.new_list_name as string) ||
        t('value.unknown_column', { defaultValue: 'Unknown' });

      const details = (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs opacity-70">
            {oldListName}
          </Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Badge variant="secondary" className="text-xs">
            {newListName}
          </Badge>
        </div>
      );

      return { action, details, noDetailsWrapper: true };
    }

    // For estimation_points changes, use proper estimation type formatting
    if (entry.field_name === 'estimation_points') {
      const oldPoints = entry.old_value as number | null;
      const newPoints = entry.new_value as number | null;

      const formatPoints = (points: number | null) => {
        if (points === null || points === undefined) {
          return t('value.none', { defaultValue: 'None' });
        }
        if (estimationType) {
          return mapEstimationPoints(points, estimationType);
        }
        return `${points} ${t('points', { defaultValue: 'pts' })}`;
      };

      const details = (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs opacity-70">
            <Target className="h-3 w-3" />
            {formatPoints(oldPoints)}
          </Badge>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Badge variant="secondary" className="gap-1 text-xs">
            <Target className="h-3 w-3" />
            {formatPoints(newPoints)}
          </Badge>
        </div>
      );

      return { action, details, noDetailsWrapper: true };
    }

    // For deleted_at changes, show task moved to trash/restored status
    // If the task is now permanently deleted, show that instead of "In Trash"
    if (entry.field_name === 'deleted_at') {
      // Check if task was deleted (new_value has a timestamp) or restored (new_value is null/undefined/empty)
      // Handle various representations of null from JSONB: null, undefined, empty string, "null" string
      const newValue = entry.new_value;
      const wasDeleted =
        newValue !== null &&
        newValue !== undefined &&
        newValue !== '' &&
        newValue !== 'null';

      // If the task was subsequently permanently deleted, show that status
      // Otherwise show the soft-delete (moved to trash) status
      const showPermanentlyDeleted = wasDeleted && isLatestDeletion;

      const action = wasDeleted
        ? showPermanentlyDeleted
          ? t('field_updated.deleted_at', {
              defaultValue: 'permanently deleted',
            })
          : t('field_updated.deleted_at', { defaultValue: 'moved to trash' })
        : t('task_restored', { defaultValue: 'restored' });

      const details = (
        <Badge
          variant="outline"
          className={cn(
            'gap-1 text-xs',
            showPermanentlyDeleted
              ? 'border-dynamic-red/50 bg-dynamic-red/20 text-dynamic-red'
              : wasDeleted
                ? 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
                : 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
          )}
        >
          {showPermanentlyDeleted ? (
            <Trash2 className="h-3 w-3" />
          ) : wasDeleted ? (
            <RotateCcw className="h-3 w-3" />
          ) : (
            <RotateCcw className="h-3 w-3" />
          )}
          {showPermanentlyDeleted
            ? t('permanently_deleted', { defaultValue: 'Permanently Deleted' })
            : wasDeleted
              ? t('in_trash', { defaultValue: 'In Trash' })
              : t('status.restored', { defaultValue: 'Restored' })}
        </Badge>
      );

      return { action, details, noDetailsWrapper: true };
    }

    // Format the old and new values
    const oldValue = formatValue(entry.old_value, entry.field_name, t);
    const newValue = formatValue(entry.new_value, entry.field_name, t);

    const details = (
      <>
        <span className="text-muted-foreground line-through">{oldValue}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium">{newValue}</span>
      </>
    );

    return { action, details };
  }

  // Handle relationship changes
  switch (entry.change_type) {
    case 'assignee_added': {
      // Extract assignee data from new_value or metadata
      const assigneeData = entry.new_value as {
        user_id?: string;
        user_name?: string;
        avatar_url?: string;
      } | null;
      const assigneeName =
        assigneeData?.user_name ||
        entry.metadata?.assignee_name ||
        t('unknown_user', { defaultValue: 'Unknown user' });
      const assigneeAvatar = assigneeData?.avatar_url;
      const assigneeInitials = assigneeName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      return {
        action: t('assignee_added', { defaultValue: 'assigned' }),
        details: (
          <Badge variant="secondary" className="gap-1.5 text-xs">
            <Avatar className="h-4 w-4">
              <AvatarImage
                src={assigneeAvatar || undefined}
                alt={assigneeName}
              />
              <AvatarFallback className="text-[8px]">
                {assigneeInitials}
              </AvatarFallback>
            </Avatar>
            {assigneeName}
          </Badge>
        ),
        noDetailsWrapper: true,
      };
    }
    case 'assignee_removed': {
      // Extract assignee data from old_value or metadata
      const assigneeData = entry.old_value as {
        user_id?: string;
        user_name?: string;
        avatar_url?: string;
      } | null;
      const assigneeName =
        assigneeData?.user_name ||
        entry.metadata?.assignee_name ||
        t('unknown_user', { defaultValue: 'Unknown user' });
      const assigneeAvatar = assigneeData?.avatar_url;
      const assigneeInitials = assigneeName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      return {
        action: t('assignee_removed', { defaultValue: 'unassigned' }),
        details: (
          <Badge variant="outline" className="gap-1.5 text-xs">
            <Avatar className="h-4 w-4 opacity-60">
              <AvatarImage
                src={assigneeAvatar || undefined}
                alt={assigneeName}
              />
              <AvatarFallback className="text-[8px]">
                {assigneeInitials}
              </AvatarFallback>
            </Avatar>
            {assigneeName}
          </Badge>
        ),
        noDetailsWrapper: true,
      };
    }
    case 'label_added': {
      // Extract label data from new_value or metadata
      const labelData = entry.new_value as {
        id?: string;
        name?: string;
        color?: string;
      } | null;
      const labelName =
        labelData?.name ||
        entry.metadata?.label_name ||
        t('unknown_label', { defaultValue: 'Unknown label' });
      const labelColor = labelData?.color || entry.metadata?.label_color;

      return {
        action: t('label_added', { defaultValue: 'added label to' }),
        details: (
          <Badge
            variant="secondary"
            className="gap-1.5 text-xs"
            style={
              labelColor
                ? {
                    backgroundColor: `${labelColor}20`,
                    borderColor: `${labelColor}40`,
                    color: labelColor,
                  }
                : undefined
            }
          >
            {labelColor && (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: labelColor }}
              />
            )}
            {labelName}
          </Badge>
        ),
        noDetailsWrapper: true,
      };
    }
    case 'label_removed': {
      // Extract label data from old_value or metadata
      const labelData = entry.old_value as {
        id?: string;
        name?: string;
        color?: string;
      } | null;
      const labelName =
        labelData?.name ||
        entry.metadata?.label_name ||
        t('unknown_label', { defaultValue: 'Unknown label' });
      const labelColor = labelData?.color || entry.metadata?.label_color;

      return {
        action: t('label_removed', { defaultValue: 'removed label from' }),
        details: (
          <Badge
            variant="outline"
            className="gap-1.5 text-xs opacity-70"
            style={
              labelColor
                ? {
                    borderColor: `${labelColor}60`,
                    color: labelColor,
                  }
                : undefined
            }
          >
            {labelColor && (
              <span
                className="h-2 w-2 rounded-full opacity-60"
                style={{ backgroundColor: labelColor }}
              />
            )}
            {labelName}
          </Badge>
        ),
        noDetailsWrapper: true,
      };
    }
    case 'project_linked': {
      // Extract project name from various possible locations
      const newValueData =
        typeof entry.new_value === 'string'
          ? (() => {
              try {
                return JSON.parse(entry.new_value);
              } catch {
                return null;
              }
            })()
          : (entry.new_value as Record<string, unknown> | null);

      const projectName =
        (entry.metadata?.project_name as string) ||
        newValueData?.project_name ||
        newValueData?.name ||
        // If new_value is a plain string (not JSON), use it directly
        (typeof entry.new_value === 'string' && !newValueData
          ? entry.new_value
          : null) ||
        t('unknown_project', { defaultValue: 'Unknown project' });

      return {
        action: t('project_linked', { defaultValue: 'linked' }),
        details: (
          <>
            <span className="text-muted-foreground">
              {t('to_project', { defaultValue: 'to' })}
            </span>
            <Badge variant="secondary" className="gap-1 text-xs">
              <FolderKanban className="h-3 w-3" />
              {projectName}
            </Badge>
          </>
        ),
        noDetailsWrapper: true,
      };
    }
    case 'project_unlinked': {
      // Extract project name from various possible locations
      const oldValueData =
        typeof entry.old_value === 'string'
          ? (() => {
              try {
                return JSON.parse(entry.old_value);
              } catch {
                return null;
              }
            })()
          : (entry.old_value as Record<string, unknown> | null);

      const projectName =
        (entry.metadata?.project_name as string) ||
        oldValueData?.project_name ||
        oldValueData?.name ||
        // If old_value is a plain string (not JSON), use it directly
        (typeof entry.old_value === 'string' && !oldValueData
          ? entry.old_value
          : null) ||
        t('unknown_project', { defaultValue: 'Unknown project' });

      return {
        action: t('project_unlinked', { defaultValue: 'unlinked' }),
        details: (
          <>
            <span className="text-muted-foreground">
              {t('from_project', { defaultValue: 'from' })}
            </span>
            <Badge variant="outline" className="gap-1 text-xs opacity-70">
              <FolderKanban className="h-3 w-3" />
              {projectName}
            </Badge>
          </>
        ),
        noDetailsWrapper: true,
      };
    }
    default:
      return {
        action: t('unknown_change', { defaultValue: 'made a change to' }),
      };
  }
}

function formatValue(
  value: unknown,
  fieldName?: string | null,
  t?: (key: string, options?: { defaultValue?: string }) => string
): string {
  const translate =
    t ||
    ((key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue || key);

  if (value === null || value === undefined) {
    return translate('value.none', { defaultValue: 'None' });
  }

  // Handle boolean values
  if (typeof value === 'boolean') {
    return value
      ? translate('value.yes', { defaultValue: 'Yes' })
      : translate('value.no', { defaultValue: 'No' });
  }

  // Handle dates
  if (fieldName === 'end_date' || fieldName === 'start_date') {
    try {
      return format(new Date(value as string), 'MMM d, yyyy');
    } catch {
      return String(value);
    }
  }

  // Handle priority
  if (fieldName === 'priority') {
    const priorityLabels: Record<number, string> = {
      1: translate('priority.low', { defaultValue: 'Low' }),
      2: translate('priority.medium', { defaultValue: 'Medium' }),
      3: translate('priority.high', { defaultValue: 'High' }),
      4: translate('priority.urgent', { defaultValue: 'Urgent' }),
    };
    return priorityLabels[value as number] || String(value);
  }

  // Handle completed status
  if (fieldName === 'completed') {
    return value
      ? translate('status.completed', { defaultValue: 'Completed' })
      : translate('status.pending', { defaultValue: 'Pending' });
  }

  // Handle list_id
  if (fieldName === 'list_id') {
    return translate('value.column', { defaultValue: 'Column' });
  }

  // Default: convert to string
  const strValue = String(value);
  if (strValue.length > 40) {
    return strValue.slice(0, 37) + '...';
  }
  return strValue;
}
