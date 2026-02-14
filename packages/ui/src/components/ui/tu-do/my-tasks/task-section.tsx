'use client';

import { ChevronUp } from '@tuturuuu/icons';
import type { TaskWithRelations } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import TaskListWithCompletion from './task-list-with-completion';

interface PriorityGroup {
  key: string;
  labelKey: string;
  count: number;
  dotClass: string;
  textClass: string;
  lineClass: string;
  tasks: TaskWithRelations[];
}

interface TaskSectionProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  colorToken: 'red' | 'orange' | 'blue' | 'green';
  tasks: TaskWithRelations[];
  isCollapsed: boolean;
  onToggle: () => void;
  isPersonal: boolean;
  userId: string;
  onTaskUpdate: () => void;
  availableLabels?: Array<{ id: string; name: string; color: string }>;
  onCreateNewLabel?: () => void;
}

const COLOR_MAP = {
  red: {
    border: 'border-dynamic-red/20',
    bg: 'bg-dynamic-red/5',
    iconBg: 'bg-dynamic-red/10',
    text: 'text-dynamic-red',
    badge: 'bg-dynamic-red/10 text-dynamic-red',
    chevron: 'text-dynamic-red',
  },
  orange: {
    border: 'border-dynamic-orange/20',
    bg: 'bg-dynamic-orange/5',
    iconBg: 'bg-dynamic-orange/10',
    text: 'text-dynamic-orange',
    badge: 'bg-dynamic-orange/10 text-dynamic-orange',
    chevron: 'text-dynamic-orange',
  },
  blue: {
    border: 'border-dynamic-blue/20',
    bg: 'bg-dynamic-blue/5',
    iconBg: 'bg-dynamic-blue/10',
    text: 'text-dynamic-blue',
    badge: 'bg-dynamic-blue/10 text-dynamic-blue',
    chevron: 'text-dynamic-blue',
  },
  green: {
    border: 'border-dynamic-green/20',
    bg: 'bg-dynamic-green/5',
    iconBg: 'bg-dynamic-green/10',
    text: 'text-dynamic-green',
    badge: 'bg-dynamic-green/10 text-dynamic-green',
    chevron: 'text-dynamic-green',
  },
} as const;

function groupTasksByPriority(tasks: TaskWithRelations[]): PriorityGroup[] {
  const groups = {
    critical: [] as TaskWithRelations[],
    high: [] as TaskWithRelations[],
    normal: [] as TaskWithRelations[],
    low: [] as TaskWithRelations[],
    none: [] as TaskWithRelations[],
  };

  for (const task of tasks) {
    const priority = task.priority || 'none';
    if (priority === 'critical' || priority === 'urgent') {
      groups.critical.push(task);
    } else if (priority === 'high') {
      groups.high.push(task);
    } else if (priority === 'normal' || priority === 'medium') {
      groups.normal.push(task);
    } else if (priority === 'low') {
      groups.low.push(task);
    } else {
      groups.none.push(task);
    }
  }

  const result: PriorityGroup[] = [];

  if (groups.critical.length > 0) {
    result.push({
      key: 'critical',
      labelKey: 'critical',
      count: groups.critical.length,
      dotClass: 'bg-dynamic-red',
      textClass: 'text-dynamic-red',
      lineClass: 'from-dynamic-red/30',
      tasks: groups.critical,
    });
  }

  if (groups.high.length > 0) {
    result.push({
      key: 'high',
      labelKey: 'high',
      count: groups.high.length,
      dotClass: 'bg-dynamic-orange',
      textClass: 'text-dynamic-orange',
      lineClass: 'from-dynamic-orange/30',
      tasks: groups.high,
    });
  }

  if (groups.normal.length > 0) {
    result.push({
      key: 'normal',
      labelKey: 'normal',
      count: groups.normal.length,
      dotClass: 'bg-dynamic-blue',
      textClass: 'text-dynamic-blue',
      lineClass: 'from-dynamic-blue/30',
      tasks: groups.normal,
    });
  }

  const lowAndNone = [...groups.low, ...groups.none];
  if (lowAndNone.length > 0) {
    result.push({
      key: 'low',
      labelKey: 'low',
      count: lowAndNone.length,
      dotClass: 'bg-muted-foreground',
      textClass: 'text-muted-foreground',
      lineClass: 'from-muted-foreground/30',
      tasks: lowAndNone,
    });
  }

  return result;
}

export function TaskSection({
  title,
  subtitle,
  icon,
  colorToken,
  tasks,
  isCollapsed,
  onToggle,
  isPersonal,
  userId,
  onTaskUpdate,
  availableLabels,
  onCreateNewLabel,
}: TaskSectionProps) {
  const t = useTranslations('ws-tasks');
  const colors = COLOR_MAP[colorToken];
  const priorityGroups = groupTasksByPriority(tasks);

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left transition-all hover:opacity-90"
      >
        <div
          className={cn(
            'flex items-center justify-between rounded-xl border px-4 py-3',
            colors.border,
            colors.bg
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                colors.iconBg
              )}
            >
              {icon}
            </div>
            <div>
              <h3 className={cn('font-semibold text-base', colors.text)}>
                {title}
              </h3>
              <p className="text-muted-foreground text-xs">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn(
                'rounded-lg px-2.5 py-0.5 font-semibold text-sm',
                colors.badge
              )}
            >
              {tasks.length}
            </Badge>
            <ChevronUp
              className={cn(
                'h-4 w-4 transition-transform duration-300',
                colors.chevron,
                !isCollapsed && 'rotate-180'
              )}
            />
          </div>
        </div>
      </button>

      {/* Priority-grouped task list */}
      {!isCollapsed && (
        <div className="space-y-4 pl-1">
          {priorityGroups.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center gap-2 px-2">
                <div
                  className={cn('h-1.5 w-1.5 rounded-full', group.dotClass)}
                />
                <span
                  className={cn(
                    'font-bold text-xs uppercase tracking-wider',
                    group.textClass
                  )}
                >
                  {t(
                    `priority_${group.labelKey}_count` as 'priority_critical_count',
                    { count: group.count }
                  )}
                </span>
                <div
                  className={cn(
                    'h-px flex-1 bg-linear-to-r to-transparent',
                    group.lineClass
                  )}
                />
              </div>
              <TaskListWithCompletion
                tasks={group.tasks}
                isPersonal={isPersonal}
                userId={userId}
                initialLimit={10}
                onTaskUpdate={onTaskUpdate}
                availableLabels={availableLabels}
                onCreateNewLabel={onCreateNewLabel}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
