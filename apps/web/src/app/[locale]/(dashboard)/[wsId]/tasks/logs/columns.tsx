'use client';

import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  CircleDot,
  Clock,
  ExternalLink,
  FileText,
  Flag,
  FolderKanban,
  LayoutGrid,
  Plus,
  Tag,
  Target,
  Trash2,
  UserMinus,
  UserPlus,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { format, formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import Link from 'next/link';

export interface TaskHistoryLogEntry {
  id: string;
  task_id: string | null;
  task_name: string;
  task_deleted_at?: string; // Indicates if task is soft-deleted
  task_permanently_deleted?: boolean; // Indicates if task was permanently deleted
  board_id?: string;
  board_name?: string; // Name of the board the task belongs to
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
  old_value: any;
  new_value: any;
  metadata: Record<string, any>;
  user: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
}

type TranslationFunction = (
  key: string,
  options?: { defaultValue?: string }
) => string;

interface ColumnsConfig {
  wsId: string;
  locale: string;
  t: TranslationFunction;
}

export function getColumns({
  wsId,
  locale,
  t,
}: ColumnsConfig): ColumnDef<TaskHistoryLogEntry>[] {
  const dateLocale = locale === 'vi' ? vi : enUS;

  return [
    {
      accessorKey: 'changed_at',
      header: t('columns.date', { defaultValue: 'Date' }),
      cell: ({ row }) => {
        const date = new Date(row.original.changed_at);
        const formattedDate = format(date, 'PPp', { locale: dateLocale });
        const relativeTime = formatDistanceToNow(date, {
          addSuffix: true,
          locale: dateLocale,
        });

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col">
                <span className="font-medium text-sm">
                  {format(date, 'MMM d, yyyy', { locale: dateLocale })}
                </span>
                <span className="text-muted-foreground text-xs">
                  {format(date, 'HH:mm', { locale: dateLocale })}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{formattedDate}</p>
              <p className="text-muted-foreground text-xs">{relativeTime}</p>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'user',
      header: t('columns.user', { defaultValue: 'User' }),
      cell: ({ row }) => {
        const user = row.original.user;
        if (!user) {
          return (
            <span className="text-muted-foreground text-sm">
              {t('unknown_user', { defaultValue: 'Unknown' })}
            </span>
          );
        }

        const initials = user.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2);

        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarImage src={user.avatar_url || undefined} alt={user.name} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="truncate text-sm">{user.name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'task_name',
      header: t('columns.task', { defaultValue: 'Task' }),
      cell: ({ row }) => {
        const { task_id, task_name, task_permanently_deleted } = row.original;
        const isLongName = task_name.length > 30;

        const content = (
          <span
            className={`block max-w-50 truncate font-medium text-sm ${
              !task_id || task_permanently_deleted
                ? 'text-muted-foreground line-through'
                : 'hover:underline'
            }`}
          >
            {task_name}
          </span>
        );

        if (!task_id || task_permanently_deleted) {
          return (
            <Tooltip>
              <TooltipTrigger asChild>{content}</TooltipTrigger>
              {isLongName && (
                <TooltipContent
                  side="bottom"
                  className="wrap-break-word max-w-md"
                >
                  {task_name}
                </TooltipContent>
              )}
            </Tooltip>
          );
        }

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href={`/${wsId}/tasks/${task_id}`}>{content}</Link>
            </TooltipTrigger>
            {isLongName && (
              <TooltipContent
                side="bottom"
                className="wrap-break-word max-w-md"
              >
                {task_name}
              </TooltipContent>
            )}
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'board_name',
      header: t('columns.board', { defaultValue: 'Board' }),
      cell: ({ row }) => {
        const { board_id, board_name } = row.original;

        if (!board_id || !board_name) {
          return (
            <span className="text-muted-foreground text-sm">
              {t('unknown_board', { defaultValue: 'Unknown' })}
            </span>
          );
        }

        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`/${wsId}/tasks/boards/${board_id}`}
                className="group/board inline-flex max-w-37.5 items-center gap-1.5 text-sm hover:text-foreground"
              >
                <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-muted-foreground group-hover/board:text-foreground group-hover/board:underline">
                  {board_name}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/board:opacity-100" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>
                {t('open_board', { defaultValue: 'Open board' })}: {board_name}
              </p>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      accessorKey: 'change_type',
      header: t('columns.change_type', { defaultValue: 'Change' }),
      cell: ({ row }) => {
        const { change_type, field_name } = row.original;
        const { icon, label, variant } = getChangeTypeDisplay(
          change_type,
          field_name,
          t
        );

        return (
          <Badge variant={variant} className="gap-1">
            {icon}
            <span>{label}</span>
          </Badge>
        );
      },
    },
    {
      accessorKey: 'value_change',
      header: t('columns.value', { defaultValue: 'Value' }),
      cell: ({ row }) => {
        const { change_type, field_name, old_value, new_value, metadata } =
          row.original;

        // Handle task_created - show task name
        if (change_type === 'task_created') {
          const taskName =
            typeof new_value === 'string' ? new_value : String(new_value || '');
          return (
            <span className="font-medium text-dynamic-green text-sm">
              {taskName || t('new_task', { defaultValue: 'New task' })}
            </span>
          );
        }

        // Handle relationship changes with enhanced display
        if (change_type !== 'field_updated') {
          return (
            <RelationshipChangeValue
              changeType={change_type}
              oldValue={old_value}
              newValue={new_value}
              metadata={metadata}
              t={t}
            />
          );
        }

        // For name field changes, add tooltip for long values
        if (field_name === 'name') {
          const oldName = String(old_value || '');
          const newName = String(new_value || '');
          const oldTruncated =
            oldName.length > 30 ? `${oldName.slice(0, 27)}...` : oldName;
          const newTruncated =
            newName.length > 30 ? `${newName.slice(0, 27)}...` : newName;

          return (
            <div className="flex items-center gap-2 text-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="max-w-25 truncate text-muted-foreground line-through">
                    {oldTruncated}
                  </span>
                </TooltipTrigger>
                {oldName.length > 30 && (
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
                  <span className="max-w-25 truncate font-medium">
                    {newTruncated}
                  </span>
                </TooltipTrigger>
                {newName.length > 30 && (
                  <TooltipContent
                    side="bottom"
                    className="wrap-break-word max-w-md"
                  >
                    {newName}
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          );
        }

        const oldFormatted = formatValue(old_value, field_name, t);
        const newFormatted = formatValue(new_value, field_name, t);

        return (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground line-through">
              {oldFormatted}
            </span>
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="font-medium">{newFormatted}</span>
          </div>
        );
      },
    },
  ];
}

function getChangeTypeDisplay(
  changeType: string,
  fieldName?: string | null,
  t?: (key: string, options?: { defaultValue?: string }) => string
): {
  icon: React.ReactNode;
  label: string;
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
} {
  const translate =
    t ||
    ((key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue || key);

  if (changeType === 'field_updated') {
    const fieldIcons: Record<string, React.ReactNode> = {
      name: <FileText className="h-3 w-3" />,
      description: <FileText className="h-3 w-3" />,
      priority: <Flag className="h-3 w-3" />,
      end_date: <Calendar className="h-3 w-3" />,
      start_date: <Clock className="h-3 w-3" />,
      estimation_points: <Target className="h-3 w-3" />,
      list_id: <ArrowRight className="h-3 w-3" />,
      completed: <CheckCircle2 className="h-3 w-3" />,
      deleted_at: <Trash2 className="h-3 w-3" />,
    };

    const fieldLabels: Record<string, string> = {
      name: translate('field_name.name', { defaultValue: 'Name' }),
      description: translate('field_name.description', {
        defaultValue: 'Description',
      }),
      priority: translate('field_name.priority', { defaultValue: 'Priority' }),
      end_date: translate('field_name.end_date', { defaultValue: 'Due Date' }),
      start_date: translate('field_name.start_date', {
        defaultValue: 'Start Date',
      }),
      estimation_points: translate('field_name.estimation_points', {
        defaultValue: 'Points',
      }),
      list_id: translate('field_name.list_id', { defaultValue: 'Moved' }),
      completed: translate('field_name.completed', { defaultValue: 'Status' }),
      deleted_at: translate('field_name.deleted_at', {
        defaultValue: 'Deleted',
      }),
    };

    return {
      icon: fieldIcons[fieldName || ''] || <CircleDot className="h-3 w-3" />,
      label:
        fieldLabels[fieldName || ''] ||
        translate('change_type.field_updated', { defaultValue: 'Updated' }),
      variant: 'secondary',
    };
  }

  const changeTypes: Record<
    string,
    {
      icon: React.ReactNode;
      label: string;
      variant: 'default' | 'secondary' | 'outline' | 'destructive';
    }
  > = {
    task_created: {
      icon: <Plus className="h-3 w-3" />,
      label: translate('change_type.task_created', {
        defaultValue: 'Created',
      }),
      variant: 'default',
    },
    assignee_added: {
      icon: <UserPlus className="h-3 w-3" />,
      label: translate('change_type.assignee_added', {
        defaultValue: 'Assigned',
      }),
      variant: 'default',
    },
    assignee_removed: {
      icon: <UserMinus className="h-3 w-3" />,
      label: translate('change_type.assignee_removed', {
        defaultValue: 'Unassigned',
      }),
      variant: 'destructive',
    },
    label_added: {
      icon: <Tag className="h-3 w-3" />,
      label: translate('change_type.label_added', {
        defaultValue: 'Label Added',
      }),
      variant: 'default',
    },
    label_removed: {
      icon: <Tag className="h-3 w-3" />,
      label: translate('change_type.label_removed', {
        defaultValue: 'Label Removed',
      }),
      variant: 'destructive',
    },
    project_linked: {
      icon: <FolderKanban className="h-3 w-3" />,
      label: translate('change_type.project_linked', {
        defaultValue: 'Project Linked',
      }),
      variant: 'default',
    },
    project_unlinked: {
      icon: <FolderKanban className="h-3 w-3" />,
      label: translate('change_type.project_unlinked', {
        defaultValue: 'Project Unlinked',
      }),
      variant: 'destructive',
    },
  };

  return (
    changeTypes[changeType] || {
      icon: <CircleDot className="h-3 w-3" />,
      label: translate('change_type.unknown', { defaultValue: 'Changed' }),
      variant: 'outline',
    }
  );
}

interface RelationshipChangeValueProps {
  changeType: string;
  oldValue: unknown;
  newValue: unknown;
  metadata: Record<string, unknown>;
  t: (key: string, options?: { defaultValue?: string }) => string;
}

function RelationshipChangeValue({
  changeType,
  oldValue,
  newValue,
  metadata,
  t,
}: RelationshipChangeValueProps) {
  switch (changeType) {
    case 'assignee_added': {
      const assigneeData = newValue as {
        user_id?: string;
        user_name?: string;
        avatar_url?: string;
      } | null;
      const assigneeName =
        assigneeData?.user_name ||
        (metadata?.assignee_name as string) ||
        t('unknown_user', { defaultValue: 'Unknown user' });
      const assigneeAvatar = assigneeData?.avatar_url;
      const assigneeInitials = assigneeName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      return (
        <div className="flex items-center gap-1.5 text-sm">
          <Avatar className="h-5 w-5">
            <AvatarImage src={assigneeAvatar || undefined} alt={assigneeName} />
            <AvatarFallback className="text-[10px]">
              {assigneeInitials}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium text-dynamic-green">{assigneeName}</span>
        </div>
      );
    }
    case 'assignee_removed': {
      const assigneeData = oldValue as {
        user_id?: string;
        user_name?: string;
        avatar_url?: string;
      } | null;
      const assigneeName =
        assigneeData?.user_name ||
        (metadata?.assignee_name as string) ||
        t('unknown_user', { defaultValue: 'Unknown user' });
      const assigneeAvatar = assigneeData?.avatar_url;
      const assigneeInitials = assigneeName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      return (
        <div className="flex items-center gap-1.5 text-sm opacity-70">
          <Avatar className="h-5 w-5">
            <AvatarImage src={assigneeAvatar || undefined} alt={assigneeName} />
            <AvatarFallback className="text-[10px]">
              {assigneeInitials}
            </AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground line-through">
            {assigneeName}
          </span>
        </div>
      );
    }
    case 'label_added': {
      const labelData = newValue as {
        id?: string;
        name?: string;
        color?: string;
      } | null;
      const labelName =
        labelData?.name ||
        (metadata?.label_name as string) ||
        t('unknown_label', { defaultValue: 'Unknown label' });
      const labelColor =
        labelData?.color || (metadata?.label_color as string | undefined);

      return (
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
      );
    }
    case 'label_removed': {
      const labelData = oldValue as {
        id?: string;
        name?: string;
        color?: string;
      } | null;
      const labelName =
        labelData?.name ||
        (metadata?.label_name as string) ||
        t('unknown_label', { defaultValue: 'Unknown label' });
      const labelColor =
        labelData?.color || (metadata?.label_color as string | undefined);

      return (
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
      );
    }
    case 'project_linked': {
      // Extract project name from various possible locations
      const valueData =
        typeof newValue === 'string'
          ? (() => {
              try {
                return JSON.parse(newValue);
              } catch {
                return null;
              }
            })()
          : (newValue as Record<string, unknown> | null);

      const projectName =
        (metadata?.project_name as string) ||
        valueData?.project_name ||
        valueData?.name ||
        (typeof newValue === 'string' ? newValue : null) ||
        t('unknown_project', { defaultValue: 'Unknown project' });

      return (
        <Badge variant="secondary" className="gap-1 text-xs">
          <FolderKanban className="h-3 w-3" />
          {projectName}
        </Badge>
      );
    }
    case 'project_unlinked': {
      // Extract project name from various possible locations
      const valueData =
        typeof oldValue === 'string'
          ? (() => {
              try {
                return JSON.parse(oldValue);
              } catch {
                return null;
              }
            })()
          : (oldValue as Record<string, unknown> | null);

      const projectName =
        (metadata?.project_name as string) ||
        valueData?.project_name ||
        valueData?.name ||
        (typeof oldValue === 'string' ? oldValue : null) ||
        t('unknown_project', { defaultValue: 'Unknown project' });

      return (
        <Badge variant="outline" className="gap-1 text-xs opacity-70">
          <FolderKanban className="h-3 w-3" />
          {projectName}
        </Badge>
      );
    }
    default:
      return (
        <span className="text-muted-foreground text-sm">
          {t('no_details', { defaultValue: 'No details' })}
        </span>
      );
  }
}

function formatValue(
  value: any,
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
      return format(new Date(value), 'PPP');
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
    return priorityLabels[value] || String(value);
  }

  // Handle completed status
  if (fieldName === 'completed') {
    return value
      ? translate('status.completed', { defaultValue: 'Completed' })
      : translate('status.pending', { defaultValue: 'Pending' });
  }

  // Handle list_id (board movement)
  if (fieldName === 'list_id') {
    return translate('value.list_changed', { defaultValue: 'List changed' });
  }

  // Handle description - extract text from TipTap JSON
  if (fieldName === 'description') {
    const text = getDescriptionText(value);
    if (!text || text.trim() === '') {
      return translate('value.empty', { defaultValue: 'Empty' });
    }
    if (text.length > 50) {
      return `${text.slice(0, 47)}...`;
    }
    return text;
  }

  // Default: convert to string and truncate if too long
  const strValue = String(value);
  if (strValue.length > 50) {
    return `${strValue.slice(0, 47)}...`;
  }
  return strValue;
}
