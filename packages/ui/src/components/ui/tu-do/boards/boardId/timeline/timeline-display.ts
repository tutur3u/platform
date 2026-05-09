import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { getTicketIdentifier } from '@tuturuuu/utils/task-helper';
import type { useTranslations } from 'next-intl';
import type { buildTimelineModel } from './timeline-utils';

export type Density = 'compact' | 'comfortable' | 'expanded';

export const SIDEBAR_WIDTH = 360;
export const MIN_DAY_WIDTH = 56;
export const MAX_DAY_WIDTH = 148;
export const DEFAULT_DAY_WIDTH = 88;
export const HANDLE_WIDTH = 12;
export const DRAG_ACTIVATION_PX = 6;
export const COLLAPSED_UNSCHEDULED_PREVIEW_COUNT = 4;

export function getDensityConfig(density: Density) {
  switch (density) {
    case 'compact':
      return { rowHeight: 44, barHeight: 18, groupHeaderHeight: 38 };
    case 'expanded':
      return { rowHeight: 72, barHeight: 30, groupHeaderHeight: 46 };
    default:
      return { rowHeight: 58, barHeight: 24, groupHeaderHeight: 42 };
  }
}

export function getStatusToneClasses(
  item: ReturnType<typeof buildTimelineModel>['groups'][number]['items'][number]
) {
  if (item.list?.status === 'done' || item.list?.status === 'closed') {
    return {
      bar: 'border-dynamic-green/40 bg-dynamic-green/15 text-dynamic-green',
      row: 'hover:bg-dynamic-green/[0.035]',
    };
  }

  if (item.isOngoing) {
    return {
      bar: 'border-dynamic-blue/45 bg-dynamic-blue/16 text-dynamic-blue',
      row: 'hover:bg-dynamic-blue/[0.035]',
    };
  }

  if (item.isFuture) {
    return {
      bar: 'border-dynamic-purple/45 bg-dynamic-purple/16 text-dynamic-purple',
      row: 'hover:bg-dynamic-purple/[0.035]',
    };
  }

  return {
    bar: 'border-border bg-muted/35 text-muted-foreground',
    row: 'hover:bg-muted/[0.18]',
  };
}

export function getListStatusBadgeClasses(status?: string | null) {
  switch (status) {
    case 'done':
      return 'border-dynamic-green/35 bg-dynamic-green/12 text-dynamic-green';
    case 'closed':
      return 'border-muted-foreground/25 bg-muted/40 text-muted-foreground';
    case 'active':
      return 'border-dynamic-blue/35 bg-dynamic-blue/12 text-dynamic-blue';
    case 'not_started':
      return 'border-dynamic-amber/35 bg-dynamic-amber/12 text-dynamic-amber';
    default:
      return '';
  }
}

export function getListName(
  task: Task,
  lists: TaskList[],
  t: ReturnType<typeof useTranslations>
) {
  return (
    lists.find((list) => list.id === task.list_id)?.name ??
    task.source_list_name ??
    t('unknown_list')
  );
}

export function getTaskEyebrow(task: Task) {
  const sourceWorkspace = task.source_workspace_name;
  const taskPrefix = (task as { ticket_prefix?: string | null }).ticket_prefix;
  const identifier =
    typeof task.display_number === 'number'
      ? getTicketIdentifier(taskPrefix, task.display_number)
      : null;

  return [sourceWorkspace, identifier].filter(Boolean).join(' ');
}
