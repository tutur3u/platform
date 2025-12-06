'use client';

import type { ColumnDef } from '@tanstack/react-table';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import { format, formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import Link from 'next/link';

export interface TaskHistoryLogEntry {
  id: string;
  task_id: string;
  task_name: string;
  board_id?: string;
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
        const { task_id, task_name } = row.original;
        return (
          <Link
            href={`/${wsId}/tasks/${task_id}`}
            className="truncate font-medium text-sm hover:underline"
          >
            {task_name}
          </Link>
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
            <span className="font-medium text-sm text-dynamic-green">
              {taskName || t('new_task', { defaultValue: 'New task' })}
            </span>
          );
        }

        if (change_type !== 'field_updated') {
          // For relationship changes, show the entity name from metadata
          const entityName = getRelationshipEntityName(
            change_type,
            metadata,
            t
          );
          return (
            <span className="text-sm">
              {entityName || t('no_details', { defaultValue: 'No details' })}
            </span>
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
    };

    return {
      icon: fieldIcons[fieldName || ''] || <CircleDot className="h-3 w-3" />,
      label:
        fieldLabels[fieldName || ''] ||
        translate('field_updated', { defaultValue: 'Updated' }),
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
      icon: <User className="h-3 w-3" />,
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

function getRelationshipEntityName(
  changeType: string,
  metadata: Record<string, any>,
  t?: (key: string, options?: { defaultValue?: string }) => string
): string | null {
  const translate =
    t ||
    ((key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue || key);

  switch (changeType) {
    case 'assignee_added':
    case 'assignee_removed':
      return (
        metadata?.assignee_name ||
        translate('unknown_user', { defaultValue: 'Unknown user' })
      );
    case 'label_added':
    case 'label_removed':
      return (
        metadata?.label_name ||
        translate('unknown_label', { defaultValue: 'Unknown label' })
      );
    case 'project_linked':
    case 'project_unlinked':
      return (
        metadata?.project_name ||
        translate('unknown_project', { defaultValue: 'Unknown project' })
      );
    default:
      return null;
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
      return text.slice(0, 47) + '...';
    }
    return text;
  }

  // Default: convert to string and truncate if too long
  const strValue = String(value);
  if (strValue.length > 50) {
    return strValue.slice(0, 47) + '...';
  }
  return strValue;
}
