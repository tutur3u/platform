'use client';

import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  useTaskHistory,
  type TaskHistoryEntry,
} from '@/hooks/useTaskHistory';
import { format } from 'date-fns';
import { vi, enUS } from 'date-fns/locale';
import { useLocale } from 'next-intl';
import {
  User,
  FileText,
  Flag,
  Calendar,
  Clock,
  Target,
  ArrowRight,
  Tag,
  FolderKanban,
  UserMinus,
  CheckCircle2,
  CircleDot,
} from '@tuturuuu/icons';

interface TaskHistoryTimelineProps {
  wsId: string;
  taskId: string;
  limit?: number;
  className?: string;
}

export default function TaskHistoryTimeline({
  wsId,
  taskId,
  limit = 50,
  className = '',
}: TaskHistoryTimelineProps) {
  const t = useTranslations('tasks.history');
  const locale = useLocale();
  const dateLocale = locale === 'vi' ? vi : enUS;

  const { data, isLoading, error } = useTaskHistory({
    wsId,
    taskId,
    limit,
  });

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-lg border border-dynamic-red/20 bg-dynamic-red/5 p-4 ${className}`}>
        <p className="text-dynamic-red text-sm">
          {t('error', { defaultValue: 'Failed to load task history' })}
        </p>
      </div>
    );
  }

  if (!data?.history || data.history.length === 0) {
    return (
      <div className={`rounded-lg border border-dashed p-8 text-center ${className}`}>
        <p className="text-foreground/60 text-sm">
          {t('empty', { defaultValue: 'No history available for this task' })}
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {data.history.map((entry, index) => (
        <HistoryEntry
          key={entry.id}
          entry={entry}
          isLast={index === data.history.length - 1}
          dateLocale={dateLocale}
        />
      ))}
    </div>
  );
}

interface HistoryEntryProps {
  entry: TaskHistoryEntry;
  isLast: boolean;
  dateLocale: Locale;
}

function HistoryEntry({ entry, isLast, dateLocale }: HistoryEntryProps) {
  const t = useTranslations('tasks.history');

  const icon = getChangeIcon(entry.change_type, entry.field_name);
  const description = getChangeDescription(entry, t);
  const timeAgo = format(new Date(entry.changed_at), 'PPp', {
    locale: dateLocale,
  });

  const userName = entry.user?.name || t('unknown_user', { defaultValue: 'Unknown user' });
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative flex gap-3">
      {/* Timeline line */}
      {!isLast && (
        <div className="bg-border absolute left-5 top-12 h-[calc(100%+1rem)] w-px" />
      )}

      {/* Avatar */}
      <Avatar className="h-10 w-10 border-2 border-background">
        <AvatarImage src={entry.user?.avatar_url || undefined} alt={userName} />
        <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{userName}</span>
            <div className="bg-muted text-muted-foreground flex items-center gap-1 rounded-md px-2 py-0.5 text-xs">
              {icon}
              <span>{description.action}</span>
            </div>
          </div>
        </div>

        {/* Change details */}
        {description.details && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            {description.details}
          </div>
        )}

        {/* Timestamp */}
        <p className="text-muted-foreground text-xs">{timeAgo}</p>
      </div>
    </div>
  );
}

function getChangeIcon(
  changeType: string,
  fieldName?: string | null
): React.ReactNode {
  if (changeType === 'field_updated') {
    switch (fieldName) {
      case 'name':
        return <FileText className="h-3 w-3" />;
      case 'description':
        return <FileText className="h-3 w-3" />;
      case 'priority':
        return <Flag className="h-3 w-3" />;
      case 'end_date':
        return <Calendar className="h-3 w-3" />;
      case 'start_date':
        return <Clock className="h-3 w-3" />;
      case 'estimation_points':
        return <Target className="h-3 w-3" />;
      case 'list_id':
        return <ArrowRight className="h-3 w-3" />;
      case 'completed':
        return <CheckCircle2 className="h-3 w-3" />;
      default:
        return <CircleDot className="h-3 w-3" />;
    }
  }

  switch (changeType) {
    case 'assignee_added':
      return <User className="h-3 w-3" />;
    case 'assignee_removed':
      return <UserMinus className="h-3 w-3" />;
    case 'label_added':
      return <Tag className="h-3 w-3" />;
    case 'label_removed':
      return <Tag className="h-3 w-3" />;
    case 'project_linked':
      return <FolderKanban className="h-3 w-3" />;
    case 'project_unlinked':
      return <FolderKanban className="h-3 w-3" />;
    default:
      return <CircleDot className="h-3 w-3" />;
  }
}

function getChangeDescription(
  entry: TaskHistoryEntry,
  t: (key: string, values?: Record<string, any>) => string
): { action: string; details?: React.ReactNode } {
  if (entry.change_type === 'field_updated') {
    const fieldKey = entry.field_name || 'unknown';
    const action = t(`field_updated.${fieldKey}`, {
      defaultValue: `Updated ${fieldKey}`,
    });

    // Format the old and new values
    const oldValue = formatValue(entry.old_value, entry.field_name);
    const newValue = formatValue(entry.new_value, entry.field_name);

    const details = (
      <div className="flex items-center gap-2">
        <span className="text-foreground/60 line-through">{oldValue}</span>
        <ArrowRight className="text-muted-foreground h-4 w-4" />
        <span className="font-medium">{newValue}</span>
      </div>
    );

    return { action, details };
  }

  // Handle relationship changes
  switch (entry.change_type) {
    case 'assignee_added':
      return {
        action: t('assignee_added', { defaultValue: 'Assigned user' }),
        details: entry.metadata?.assignee_name ? (
          <span className="font-medium">{entry.metadata.assignee_name}</span>
        ) : undefined,
      };
    case 'assignee_removed':
      return {
        action: t('assignee_removed', { defaultValue: 'Removed assignee' }),
        details: entry.metadata?.assignee_name ? (
          <span className="font-medium">{entry.metadata.assignee_name}</span>
        ) : undefined,
      };
    case 'label_added':
      return {
        action: t('label_added', { defaultValue: 'Added label' }),
        details: entry.metadata?.label_name ? (
          <span className="font-medium">{entry.metadata.label_name}</span>
        ) : undefined,
      };
    case 'label_removed':
      return {
        action: t('label_removed', { defaultValue: 'Removed label' }),
        details: entry.metadata?.label_name ? (
          <span className="font-medium">{entry.metadata.label_name}</span>
        ) : undefined,
      };
    case 'project_linked':
      return {
        action: t('project_linked', { defaultValue: 'Linked project' }),
        details: entry.metadata?.project_name ? (
          <span className="font-medium">{entry.metadata.project_name}</span>
        ) : undefined,
      };
    case 'project_unlinked':
      return {
        action: t('project_unlinked', { defaultValue: 'Unlinked project' }),
        details: entry.metadata?.project_name ? (
          <span className="font-medium">{entry.metadata.project_name}</span>
        ) : undefined,
      };
    default:
      return {
        action: t('unknown_change', { defaultValue: 'Made a change' }),
      };
  }
}

function formatValue(value: any, fieldName?: string | null): string {
  if (value === null || value === undefined) {
    return 'None';
  }

  // Handle boolean values
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  // Handle dates
  if (fieldName === 'end_date' || fieldName === 'start_date') {
    try {
      return format(new Date(value), 'PPP');
    } catch {
      return String(value);
    }
  }

  // Handle priority
  if (fieldName === 'priority') {
    const priorityLabels: Record<number, string> = {
      1: 'Low',
      2: 'Medium',
      3: 'High',
      4: 'Urgent',
    };
    return priorityLabels[value] || String(value);
  }

  // Handle list_id (board movement)
  if (fieldName === 'list_id' && typeof value === 'string') {
    // Just show a generic label; the actual list name would need to be in metadata
    return 'List changed';
  }

  // Default: convert to string
  return String(value);
}
