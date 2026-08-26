'use client';

import { ArrowUpDown, SlidersHorizontal } from '@tuturuuu/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import type {
  TaskPriorityFilter,
  TaskSort,
  TaskStatusFilter,
} from './utils/command-task-results';

export function TaskSearchToolbar({
  onPriorityChange,
  onSortChange,
  onStatusChange,
  priority,
  sort,
  status,
}: {
  onPriorityChange: (value: TaskPriorityFilter) => void;
  onSortChange: (value: TaskSort) => void;
  onStatusChange: (value: TaskStatusFilter) => void;
  priority: TaskPriorityFilter;
  sort: TaskSort;
  status: TaskStatusFilter;
}) {
  const t = useTranslations('command_palette');
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b bg-muted/20 px-3 py-2">
      <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
        <SlidersHorizontal className="size-3.5" />
        <span>{t('filters.label')}</span>
      </div>
      <Select
        value={status}
        onValueChange={(value) => onStatusChange(value as TaskStatusFilter)}
      >
        <SelectTrigger
          aria-label={t('filters.status_label')}
          className="h-8 w-auto min-w-32 bg-background/80 px-2.5 text-xs shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(
            [
              'all',
              'open',
              'assigned',
              'overdue',
              'due-soon',
              'completed',
            ] as const
          ).map((value) => (
            <SelectItem key={value} value={value}>
              {t(`filters.status.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={priority}
        onValueChange={(value) => onPriorityChange(value as TaskPriorityFilter)}
      >
        <SelectTrigger
          aria-label={t('filters.priority_label')}
          className="h-8 w-auto min-w-28 bg-background/80 px-2.5 text-xs shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(['all', 'critical', 'high', 'normal', 'low'] as const).map(
            (value) => (
              <SelectItem key={value} value={value}>
                {t(`filters.priority.${value}`)}
              </SelectItem>
            )
          )}
        </SelectContent>
      </Select>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
        <ArrowUpDown className="size-3.5" />
        <Select
          value={sort}
          onValueChange={(value) => onSortChange(value as TaskSort)}
        >
          <SelectTrigger
            aria-label={t('sort.label')}
            className="h-8 w-auto min-w-28 bg-background/80 px-2.5 text-xs shadow-none"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {(['relevance', 'due', 'priority', 'newest'] as const).map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {t(`sort.${value}`)}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
