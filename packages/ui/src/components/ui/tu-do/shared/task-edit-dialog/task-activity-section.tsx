'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock,
  Eye,
  FileText,
  Flag,
  FolderKanban,
  History,
  Layers,
  Loader2,
  Plus,
  Tag,
  Target,
  UserMinus,
  UserPlus,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { CurrentTaskState } from '@tuturuuu/utils/task-snapshot';
import { format, formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { EstimationType } from '../estimation-mapping';
import { mapEstimationPoints } from '../estimation-mapping';
import { TaskSnapshotDialog } from './task-snapshot-dialog';

/** Represents a task history entry from the API */
export interface TaskHistoryEntry {
  id: string;
  task_id: string;
  changed_by: string | null;
  changed_at: string;
  change_type:
    | 'task_created'
    | 'field_updated'
    | 'assignee_added'
    | 'assignee_removed'
    | 'label_added'
    | 'label_removed'
    | 'project_linked'
    | 'project_unlinked';
  field_name?: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown>;
  user: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
}

interface TaskActivitySectionProps {
  wsId: string;
  taskId?: string;
  boardId?: string;
  /** Current task state for comparison in snapshot dialog */
  currentTask?: CurrentTaskState;
  className?: string;
  /** Maximum number of entries to show initially */
  initialLimit?: number;
  /** Callback when task is updated (e.g., after revert) */
  onTaskUpdate?: () => void;
  /** Estimation type for displaying points */
  estimationType?: EstimationType;
  /** When true, disables the revert functionality (feature not stable) */
  revertDisabled?: boolean;
}

// Task history section for showing activity logs and snapshots

export function TaskActivitySection({
  wsId,
  taskId,
  boardId,
  currentTask,
  className,
  initialLimit = 10,
  onTaskUpdate,
  estimationType,
  revertDisabled = false,
}: TaskActivitySectionProps) {
  const t = useTranslations('tasks-history');
  const locale = useLocale();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [snapshotEntry, setSnapshotEntry] = useState<TaskHistoryEntry | null>(
    null
  );
  const dateLocale = locale === 'vi' ? vi : enUS;

  // Fetch task history
  const { data, isLoading, error } = useQuery({
    queryKey: ['task-history', wsId, taskId],
    queryFn: async () => {
      if (!taskId) return null;
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/history?limit=50`
      );
      if (!res.ok) throw new Error('Failed to fetch task history');
      return res.json() as Promise<{
        history: TaskHistoryEntry[];
        count: number;
      }>;
    },
    enabled: !!taskId && !!wsId && isExpanded,
    staleTime: 30 * 1000, // 30 seconds
  });

  const entries = data?.history || [];
  const displayedEntries = showAll ? entries : entries.slice(0, initialLimit);
  const hasMore = entries.length > initialLimit;

  if (!taskId) return null;

  return (
    <div className={cn('border-t', className)}>
      {/* Section Header - Collapsible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-4 py-3 transition-colors hover:bg-muted/50 md:px-8"
      >
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{t('activity')}</span>
        {data?.count !== undefined && data.count > 0 && (
          <Badge variant="secondary" className="ml-1 text-xs">
            {data.count}
          </Badge>
        )}
        {isExpanded ? (
          <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="overflow-hidden">
          <div className="px-4 pb-4 md:px-8">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="py-4 text-center text-muted-foreground text-sm">
                {t('failed_to_load')}
              </div>
            ) : entries.length === 0 ? (
              <div className="py-4 text-center text-muted-foreground text-sm">
                {t('no_activity')}
              </div>
            ) : (
              <div className="space-y-2">
                {displayedEntries.map((entry) => (
                  <ActivityEntry
                    key={entry.id}
                    entry={entry}
                    t={
                      t as (
                        key: string,
                        options?: { defaultValue?: string }
                      ) => string
                    }
                    dateLocale={dateLocale}
                    showActions={!!currentTask && !!boardId}
                    onViewSnapshot={() => setSnapshotEntry(entry)}
                    estimationType={estimationType}
                  />
                ))}

                {/* Show more/less button */}
                {hasMore && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAll(!showAll)}
                    className="mt-2 w-full text-muted-foreground"
                  >
                    {showAll
                      ? t('show_less')
                      : t('show_more', {
                          count: entries.length - initialLimit,
                        })}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Snapshot Dialog */}
      {snapshotEntry && currentTask && boardId && (
        <TaskSnapshotDialog
          wsId={wsId}
          taskId={taskId!}
          boardId={boardId}
          historyEntry={snapshotEntry}
          currentTask={currentTask}
          isOpen={!!snapshotEntry}
          onClose={() => setSnapshotEntry(null)}
          onRevertSuccess={() => {
            setSnapshotEntry(null);
            onTaskUpdate?.();
          }}
          locale={locale}
          t={t as (key: string, options?: { defaultValue?: string }) => string}
          estimationType={estimationType}
          revertDisabled={revertDisabled}
        />
      )}
    </div>
  );
}

interface ActivityEntryProps {
  entry: TaskHistoryEntry;
  t: (key: string, options?: { defaultValue?: string }) => string;
  dateLocale: typeof enUS | typeof vi;
  showActions?: boolean;
  onViewSnapshot?: () => void;
  estimationType?: EstimationType;
}

function ActivityEntry({
  entry,
  t,
  dateLocale,
  showActions = false,
  onViewSnapshot,
  estimationType,
}: ActivityEntryProps) {
  const { icon, color } = getChangeIcon(entry.change_type, entry.field_name);
  const description = getChangeDescription(
    entry,
    t,
    estimationType,
    dateLocale
  );
  const timeAgo = formatDistanceToNow(new Date(entry.changed_at), {
    addSuffix: true,
    locale: dateLocale,
  });
  const exactTime = format(new Date(entry.changed_at), 'MMM d, HH:mm', {
    locale: dateLocale,
  });

  const userName = entry.user?.name || t('unknown_user');
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="group flex items-start gap-3 rounded-md p-2 transition-colors hover:bg-muted/30">
      {/* Icon */}
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
          color
        )}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1 text-sm">
          {/* User avatar and name */}
          <div className="flex items-center gap-1">
            <Avatar className="h-4 w-4">
              <AvatarImage
                src={entry.user?.avatar_url || undefined}
                alt={userName}
              />
              <AvatarFallback className="text-[8px]">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">{userName}</span>
          </div>

          {/* Action */}
          <span className="text-muted-foreground">{description.action}</span>

          {/* Details (inline) */}
          {description.details && (
            <span className="inline-flex items-center gap-1">
              {description.details}
            </span>
          )}
        </div>

        {/* Timestamp */}
        <p className="mt-0.5 text-muted-foreground text-xs">
          <span title={exactTime}>{timeAgo}</span>
        </p>
      </div>

      {/* Action buttons - visible on hover */}
      {showActions && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewSnapshot?.();
                }}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t('view_snapshot')}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

function getChangeIcon(
  changeType: string,
  fieldName?: string | null
): { icon: React.ReactNode; color: string } {
  const iconSize = 'h-3.5 w-3.5';

  if (changeType === 'field_updated') {
    switch (fieldName) {
      case 'name':
        return {
          icon: <FileText className={cn(iconSize, 'text-dynamic-blue')} />,
          color: 'bg-dynamic-blue/10',
        };
      case 'description':
        return {
          icon: <FileText className={cn(iconSize, 'text-dynamic-purple')} />,
          color: 'bg-dynamic-purple/10',
        };
      case 'priority':
        return {
          icon: <Flag className={cn(iconSize, 'text-dynamic-orange')} />,
          color: 'bg-dynamic-orange/10',
        };
      case 'end_date':
        return {
          icon: <Calendar className={cn(iconSize, 'text-dynamic-red')} />,
          color: 'bg-dynamic-red/10',
        };
      case 'start_date':
        return {
          icon: <Clock className={cn(iconSize, 'text-dynamic-cyan')} />,
          color: 'bg-dynamic-cyan/10',
        };
      case 'estimation_points':
        return {
          icon: <Target className={cn(iconSize, 'text-dynamic-pink')} />,
          color: 'bg-dynamic-pink/10',
        };
      case 'list_id':
        return {
          icon: <ArrowRight className={cn(iconSize, 'text-dynamic-indigo')} />,
          color: 'bg-dynamic-indigo/10',
        };
      case 'completed':
        return {
          icon: <CheckCircle2 className={cn(iconSize, 'text-dynamic-green')} />,
          color: 'bg-dynamic-green/10',
        };
      default:
        return {
          icon: <CircleDot className={cn(iconSize, 'text-muted-foreground')} />,
          color: 'bg-muted',
        };
    }
  }

  switch (changeType) {
    case 'task_created':
      return {
        icon: <Plus className={cn(iconSize, 'text-dynamic-green')} />,
        color: 'bg-dynamic-green/10',
      };
    case 'assignee_added':
      return {
        icon: <UserPlus className={cn(iconSize, 'text-dynamic-green')} />,
        color: 'bg-dynamic-green/10',
      };
    case 'assignee_removed':
      return {
        icon: <UserMinus className={cn(iconSize, 'text-dynamic-red')} />,
        color: 'bg-dynamic-red/10',
      };
    case 'label_added':
      return {
        icon: <Tag className={cn(iconSize, 'text-dynamic-yellow')} />,
        color: 'bg-dynamic-yellow/10',
      };
    case 'label_removed':
      return {
        icon: <Tag className={cn(iconSize, 'text-dynamic-orange')} />,
        color: 'bg-dynamic-orange/10',
      };
    case 'project_linked':
      return {
        icon: <FolderKanban className={cn(iconSize, 'text-dynamic-purple')} />,
        color: 'bg-dynamic-purple/10',
      };
    case 'project_unlinked':
      return {
        icon: <FolderKanban className={cn(iconSize, 'text-dynamic-pink')} />,
        color: 'bg-dynamic-pink/10',
      };
    default:
      return {
        icon: <Layers className={cn(iconSize, 'text-muted-foreground')} />,
        color: 'bg-muted',
      };
  }
}

interface ChangeDescription {
  action: string;
  details?: React.ReactNode;
}

function getChangeDescription(
  entry: TaskHistoryEntry,
  t: (key: string, options?: { defaultValue?: string }) => string,
  estimationType?: EstimationType,
  dateLocale?: typeof enUS | typeof vi
): ChangeDescription {
  // Handle task_created - show metadata badges like the logs page
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
          {t('with_description')}
        </Badge>
      );
    }
    if (hasEstimation) {
      const points = metadata.estimation_points as number;
      const displayPoints = estimationType
        ? mapEstimationPoints(points, estimationType)
        : `${points} ${t('points')}`;
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
          {format(new Date(metadata.start_date as string), 'MMM d', {
            locale: dateLocale,
          })}
        </Badge>
      );
    }
    if (hasEndDate) {
      badges.push(
        <Badge key="end" variant="secondary" className="gap-1 text-xs">
          <Calendar className="h-3 w-3" />
          {format(new Date(metadata.end_date as string), 'MMM d', {
            locale: dateLocale,
          })}
        </Badge>
      );
    }

    return {
      action: t('created_task'),
      details:
        badges.length > 0 ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {badges}
          </div>
        ) : undefined,
    };
  }

  if (entry.change_type === 'field_updated') {
    const fieldLabels: Record<string, string> = {
      name: t('field_updated.name', { defaultValue: 'updated the name' }),
      description: t('field_updated.description', {
        defaultValue: 'updated the description',
      }),
      priority: t('field_updated.priority', {
        defaultValue: 'changed priority',
      }),
      end_date: t('field_updated.end_date', {
        defaultValue: 'updated due date',
      }),
      start_date: t('field_updated.start_date', {
        defaultValue: 'set start date',
      }),
      estimation_points: t('field_updated.estimation_points', {
        defaultValue: 'updated estimation',
      }),
      list_id: t('field_updated.list_id', { defaultValue: 'moved task' }),
      completed: t('field_updated.completed', {
        defaultValue: 'changed status',
      }),
    };

    const action =
      fieldLabels[entry.field_name || ''] || t('field_updated.unknown');

    // Format values for display
    if (
      entry.field_name === 'priority' &&
      entry.old_value !== null &&
      entry.new_value !== null
    ) {
      const priorityLabels: Record<number, string> = {
        1: t('priority.low'),
        2: t('priority.medium'),
        3: t('priority.high'),
        4: t('priority.urgent'),
      };
      return {
        action,
        details: (
          <>
            <span className="text-muted-foreground text-xs line-through">
              {priorityLabels[entry.old_value as number] ||
                String(entry.old_value ?? '')}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium text-xs">
              {priorityLabels[entry.new_value as number] ||
                String(entry.new_value ?? '')}
            </span>
          </>
        ),
      };
    }

    if (entry.field_name === 'completed') {
      const isCompleted = entry.new_value === true;
      return {
        action: isCompleted ? t('marked_complete') : t('marked_incomplete'),
      };
    }

    return { action };
  }

  // Handle relationship changes
  switch (entry.change_type) {
    case 'assignee_added': {
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

      return {
        action: t('assigned'),
        details: (
          <div className="flex items-center gap-1.5">
            <Avatar className="h-5 w-5">
              <AvatarImage src={newValueData?.avatar_url as string} />
              <AvatarFallback className="text-[10px]">
                {(
                  (newValueData?.name as string) ||
                  (newValueData?.displayName as string) ||
                  '?'
                ).substring(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-xs">
              {(newValueData?.name as string) ||
                (newValueData?.displayName as string) ||
                t('unknown_user')}
            </span>
          </div>
        ),
      };
    }
    case 'assignee_removed': {
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

      return {
        action: t('unassigned'),
        details: (
          <div className="flex items-center gap-1.5 opacity-70">
            <Avatar className="h-5 w-5 grayscale">
              <AvatarImage src={oldValueData?.avatar_url as string} />
              <AvatarFallback className="text-[10px]">
                {(
                  (oldValueData?.name as string) ||
                  (oldValueData?.displayName as string) ||
                  '?'
                ).substring(0, 2)}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium text-xs">
              {(oldValueData?.name as string) ||
                (oldValueData?.displayName as string) ||
                t('unknown_user')}
            </span>
          </div>
        ),
      };
    }
    case 'label_added': {
      const labelName =
        (entry.metadata?.label_name as string) || t('unknown_label');
      return {
        action: t('added_label'),
        details: (
          <Badge variant="secondary" className="text-xs">
            <Tag className="mr-1 h-3 w-3" />
            {labelName}
          </Badge>
        ),
      };
    }
    case 'label_removed': {
      const labelName =
        (entry.metadata?.label_name as string) || t('unknown_label');
      return {
        action: t('removed_label'),
        details: (
          <Badge variant="outline" className="text-xs opacity-70">
            <Tag className="mr-1 h-3 w-3" />
            {labelName}
          </Badge>
        ),
      };
    }
    case 'project_linked': {
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
        (newValueData?.name as string) ||
        (entry.metadata?.project_name as string) ||
        t('unknown_project');

      return {
        action: t('linked_to_project'),
        details: (
          <Badge variant="secondary" className="gap-1 text-xs">
            <FolderKanban className="h-3 w-3" />
            {projectName}
          </Badge>
        ),
      };
    }
    case 'project_unlinked': {
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
        (oldValueData?.name as string) ||
        (entry.metadata?.project_name as string) ||
        t('unknown_project');

      return {
        action: t('unlinked_from_project'),
        details: (
          <Badge variant="outline" className="gap-1 text-xs opacity-70">
            <FolderKanban className="h-3 w-3" />
            {projectName}
          </Badge>
        ),
      };
    }
    default:
      return {
        action: t('unknown_change'),
      };
  }
}
