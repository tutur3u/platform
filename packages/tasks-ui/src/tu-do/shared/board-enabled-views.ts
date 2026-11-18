import {
  type FleetTaskInput,
  parseFleetTaskMeta,
} from '../fleet/fleet-task-meta';
import type { ViewType } from './board-views';

/** True when any task carries the fleet:v1 block or fleet labels. */
export function boardHasFleetTasks(tasks: FleetTaskInput[]): boolean {
  return tasks.some((task) => parseFleetTaskMeta(task).isFleetTask);
}

/**
 * The views a board offers. Boards with fleet tasks lead with the Fleet view,
 * so it becomes the default until the viewer picks another.
 */
export function resolveEnabledViews({
  availableViews,
  hasFleetTasks,
  publicView,
  readOnly,
}: {
  availableViews?: ViewType[];
  hasFleetTasks: boolean;
  publicView: boolean;
  readOnly: boolean;
}): ViewType[] {
  if (availableViews) return availableViews;
  const base: ViewType[] =
    publicView || readOnly
      ? ['kanban', 'list', 'timeline']
      : ['kanban', 'list', 'my_tasks', 'timeline', 'drafts', 'recycle_bin'];
  return hasFleetTasks ? ['fleet', ...base] : base;
}
