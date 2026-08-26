'use client';

import {
  ArrowUpDown,
  Compass,
  ListTodo,
  Search,
  SlidersHorizontal,
  Sparkles,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type {
  CommandTab,
  TaskPriorityFilter,
  TaskSort,
  TaskStatusFilter,
} from './utils/command-task-results';

interface CommandSearchControlsProps {
  activeTab: CommandTab;
  priority: TaskPriorityFilter;
  sort: TaskSort;
  status: TaskStatusFilter;
  taskCount: number;
  onPriorityChange: (priority: TaskPriorityFilter) => void;
  onSortChange: (sort: TaskSort) => void;
  onStatusChange: (status: TaskStatusFilter) => void;
  onTabChange: (tab: CommandTab) => void;
}

const TABS = [
  { icon: ListTodo, key: 'tasks' },
  { icon: Search, key: 'all' },
  { icon: Compass, key: 'navigate' },
  { icon: Sparkles, key: 'actions' },
] as const;

export function CommandSearchControls({
  activeTab,
  priority,
  sort,
  status,
  taskCount,
  onPriorityChange,
  onSortChange,
  onStatusChange,
  onTabChange,
}: CommandSearchControlsProps) {
  const t = useTranslations('command_palette');
  const showTaskControls = activeTab === 'tasks' || activeTab === 'all';

  return (
    <div className="border-b bg-muted/20">
      <fieldset
        aria-label={t('tabs.label')}
        className="m-0 flex min-w-0 gap-1 overflow-x-auto border-0 px-3 pt-2"
      >
        {TABS.map(({ icon: Icon, key }, index) => {
          const selected = activeTab === key;
          return (
            <Button
              key={key}
              type="button"
              aria-pressed={selected}
              variant="ghost"
              size="sm"
              onClick={() => onTabChange(key)}
              className={cn(
                'relative h-9 shrink-0 gap-2 rounded-b-none border-transparent px-3 text-muted-foreground',
                selected &&
                  'border-border border-b-background bg-background text-foreground shadow-xs'
              )}
            >
              <Icon className="size-4" />
              {t(`tabs.${key}`)}
              {key === 'tasks' && taskCount > 0 ? (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                  {taskCount}
                </span>
              ) : null}
              <span className="hidden font-mono text-[10px] opacity-50 sm:inline">
                {index + 1}
              </span>
            </Button>
          );
        })}
      </fieldset>

      {showTaskControls ? (
        <div className="flex items-center gap-2 overflow-x-auto border-t px-3 py-2">
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
              className="h-8 w-auto min-w-32 border-border/70 bg-background/80 px-2.5 text-xs shadow-none"
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
            onValueChange={(value) =>
              onPriorityChange(value as TaskPriorityFilter)
            }
          >
            <SelectTrigger
              aria-label={t('filters.priority_label')}
              className="h-8 w-auto min-w-28 border-border/70 bg-background/80 px-2.5 text-xs shadow-none"
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
                className="h-8 w-auto min-w-28 border-border/70 bg-background/80 px-2.5 text-xs shadow-none"
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
      ) : null}
    </div>
  );
}
