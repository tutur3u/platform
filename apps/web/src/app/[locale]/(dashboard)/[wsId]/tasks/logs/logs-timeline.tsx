'use client';

import { DescriptionDiffViewer } from '@/components/tasks/description-diff-viewer';
import { type TaskHistoryLogEntry } from './columns';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  CircleDot,
  Clock,
  FileText,
  Flag,
  FolderKanban,
  Plus,
  Tag,
  Target,
  User,
  UserMinus,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useMemo } from 'react';

interface LogsTimelineProps {
  entries: TaskHistoryLogEntry[];
  wsId: string;
  locale: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
  className?: string;
}

interface GroupedEntries {
  date: string;
  dateLabel: string;
  entries: TaskHistoryLogEntry[];
}

export default function LogsTimeline({
  entries,
  wsId,
  locale,
  t,
  className,
}: LogsTimelineProps) {
  const dateLocale = locale === 'vi' ? vi : enUS;

  // Group entries by date
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
    groups.forEach((groupEntries, dateKey) => {
      const date = new Date(dateKey);
      let dateLabel: string;

      if (isToday(date)) {
        dateLabel = t('date.today', { defaultValue: 'Today' });
      } else if (isYesterday(date)) {
        dateLabel = t('date.yesterday', { defaultValue: 'Yesterday' });
      } else {
        dateLabel = format(date, 'EEEE, MMMM d, yyyy', { locale: dateLocale });
      }

      result.push({
        date: dateKey,
        dateLabel,
        entries: groupEntries,
      });
    });

    return result;
  }, [entries, t, dateLocale]);

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
          <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/95 py-2 backdrop-blur">
            <div className="h-px flex-1 bg-border" />
            <span className="rounded-full bg-muted px-3 py-1 font-medium text-muted-foreground text-xs">
              {group.dateLabel}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Entries for this date */}
          <div className="space-y-2">
            {group.entries.map((entry, index) => (
              <TimelineEntry
                key={entry.id}
                entry={entry}
                wsId={wsId}
                locale={locale}
                t={t}
                index={index}
                dateLocale={dateLocale}
              />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

interface TimelineEntryProps {
  entry: TaskHistoryLogEntry;
  wsId: string;
  locale: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
  index: number;
  dateLocale: typeof enUS | typeof vi;
}

function TimelineEntry({
  entry,
  wsId,
  t,
  index,
  dateLocale,
}: TimelineEntryProps) {
  const { icon, color } = getChangeIcon(entry.change_type, entry.field_name);
  const description = getChangeDescription(entry, t);
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
                src={entry.user?.avatar_url || undefined}
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
            {description.action}
          </span>

          {/* Task link */}
          <Link
            href={`/${wsId}/tasks/boards`}
            className="truncate font-medium text-sm text-foreground hover:underline"
          >
            {entry.task_name}
          </Link>
        </div>

        {/* Change details */}
        {description.details && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
              {description.details}
            </div>
            {description.showDiffButton && (
              <DescriptionDiffViewer
                oldValue={entry.old_value}
                newValue={entry.new_value}
                t={t}
              />
            )}
          </div>
        )}

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

function getChangeIcon(
  changeType: string,
  fieldName?: string | null
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
        icon: <User className="h-4 w-4 text-dynamic-green" />,
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

function getChangeDescription(
  entry: TaskHistoryLogEntry,
  t: (key: string, options?: { defaultValue?: string }) => string
): { action: string; details?: React.ReactNode; showDiffButton?: boolean } {
  // Handle task_created
  if (entry.change_type === 'task_created') {
    return {
      action: t('task_created', { defaultValue: 'created' }),
      details: entry.metadata?.description ? (
        <Badge variant="secondary" className="text-xs">
          {t('with_description', { defaultValue: 'with description' })}
        </Badge>
      ) : undefined,
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

      return { action, details, showDiffButton: true };
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
    case 'assignee_added':
      return {
        action: t('assignee_added', { defaultValue: 'assigned' }),
        details: entry.metadata?.assignee_name ? (
          <Badge variant="secondary" className="text-xs">
            {entry.metadata.assignee_name}
          </Badge>
        ) : undefined,
      };
    case 'assignee_removed':
      return {
        action: t('assignee_removed', { defaultValue: 'unassigned' }),
        details: entry.metadata?.assignee_name ? (
          <Badge variant="outline" className="text-xs">
            {entry.metadata.assignee_name}
          </Badge>
        ) : undefined,
      };
    case 'label_added':
      return {
        action: t('label_added', { defaultValue: 'added label to' }),
        details: entry.metadata?.label_name ? (
          <Badge variant="secondary" className="text-xs">
            {entry.metadata.label_name}
          </Badge>
        ) : undefined,
      };
    case 'label_removed':
      return {
        action: t('label_removed', { defaultValue: 'removed label from' }),
        details: entry.metadata?.label_name ? (
          <Badge variant="outline" className="text-xs">
            {entry.metadata.label_name}
          </Badge>
        ) : undefined,
      };
    case 'project_linked':
      return {
        action: t('project_linked', { defaultValue: 'linked' }),
        details: entry.metadata?.project_name ? (
          <>
            <span className="text-muted-foreground">
              {t('to_project', { defaultValue: 'to' })}
            </span>
            <Badge variant="secondary" className="text-xs">
              {entry.metadata.project_name}
            </Badge>
          </>
        ) : undefined,
      };
    case 'project_unlinked':
      return {
        action: t('project_unlinked', { defaultValue: 'unlinked' }),
        details: entry.metadata?.project_name ? (
          <>
            <span className="text-muted-foreground">
              {t('from_project', { defaultValue: 'from' })}
            </span>
            <Badge variant="outline" className="text-xs">
              {entry.metadata.project_name}
            </Badge>
          </>
        ) : undefined,
      };
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
