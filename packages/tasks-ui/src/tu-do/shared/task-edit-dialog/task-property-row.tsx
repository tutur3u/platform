'use client';

import {
  Box,
  Calendar,
  CalendarClock,
  CircleDashed,
  Tag,
  Timer,
  Users,
} from '@tuturuuu/icons';
import { PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  type ComponentType,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

export type TaskPropertyPopoverId =
  | 'priority'
  | 'list'
  | 'dates'
  | 'estimation'
  | 'labels'
  | 'projects'
  | 'assignees'
  | 'scheduling';

export const TASK_PROPERTY_POPOVER_TRIGGER_ATTRIBUTE =
  'data-task-property-popover-trigger';

// Priority keeps its level icon on the value, so its name goes without one.
const PROPERTIES = {
  assignees: { icon: Users, nameKey: 'ws-task-boards.dialog.field.assignees' },
  dates: { icon: Calendar, nameKey: 'ws-task-boards.dialog.dates' },
  estimation: {
    icon: Timer,
    nameKey: 'ws-task-boards.dialog.field.estimation',
  },
  labels: { icon: Tag, nameKey: 'ws-task-boards.dialog.field.labels' },
  list: { icon: CircleDashed, nameKey: 'common.status' },
  priority: {
    icon: undefined,
    nameKey: 'ws-task-boards.dialog.field.priority',
  },
  projects: { icon: Box, nameKey: 'ws-task-boards.dialog.field.projects' },
  scheduling: {
    icon: CalendarClock,
    nameKey: 'ws-task-boards.dialog.schedule',
  },
} as const satisfies Record<
  TaskPropertyPopoverId,
  { icon?: ComponentType<{ className?: string }>; nameKey: string }
>;

// Values read as colored text: the trigger keeps its text color and loses its
// box. Their own icons move to the name column.
const VALUE_CLASS =
  '[&_[data-task-property-popover-trigger]]:-ml-2 [&_[data-task-property-popover-trigger]]:rounded-md [&_[data-task-property-popover-trigger]]:border-transparent [&_[data-task-property-popover-trigger]]:bg-transparent [&_[data-task-property-popover-trigger]]:px-2 [&_[data-task-property-popover-trigger]]:text-sm [&_[data-task-property-popover-trigger]]:shadow-none [&_[data-task-property-popover-trigger]:hover]:bg-muted';
const HIDE_VALUE_ICON_CLASS =
  '[&_[data-task-property-popover-trigger]>svg:first-child]:hidden';

/** One Details row: the property's name on the left, its value on the right. */
export function TaskPropertyRow({
  children,
  className,
  icon: Icon,
  label,
}: {
  children: ReactNode;
  className?: string;
  icon?: ComponentType<{ className?: string }>;
  label: ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-x-3 py-0.5',
        className
      )}
    >
      <span className="flex h-8 min-w-0 items-center gap-2 text-muted-foreground text-sm">
        {Icon ? <Icon className="size-4 shrink-0" /> : null}
        <span className="truncate">{label}</span>
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** A named row in the Details list; other variants render the control bare. */
export function TaskPropertyNameRow({
  children,
  popoverId,
  variant = 'embedded',
}: {
  children: ReactNode;
  popoverId: TaskPropertyPopoverId;
  variant?: 'compact' | 'default' | 'embedded';
}) {
  const t = useTranslations();
  if (variant !== 'embedded') return children;
  const { icon, nameKey } = PROPERTIES[popoverId];
  return (
    <TaskPropertyRow
      className={cn(VALUE_CLASS, icon && HIDE_VALUE_ICON_CLASS)}
      icon={icon}
      label={t(nameKey)}
    >
      {children}
    </TaskPropertyRow>
  );
}

export function TaskPropertyPopoverTrigger({
  children,
  label,
  popoverId,
  variant,
}: {
  children: ReactNode;
  label: ReactNode;
  popoverId: TaskPropertyPopoverId;
  variant: 'compact' | 'default' | 'embedded';
}) {
  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        [TASK_PROPERTY_POPOVER_TRIGGER_ATTRIBUTE]: popoverId,
      })
    : children;

  if (variant === 'embedded') {
    return (
      <TaskPropertyNameRow popoverId={popoverId}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </TaskPropertyNameRow>
    );
  }

  if (variant === 'default') {
    return <PopoverTrigger asChild>{trigger}</PopoverTrigger>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
