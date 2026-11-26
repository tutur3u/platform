import { lazy } from 'react';

/**
 * Pages other than the board load as their own chunks, so opening a board
 * does not download and parse the calendar, cycles, progress charts, shared
 * task views and plan composer. During hydration React keeps the server HTML
 * of a page until its chunk arrives.
 */
export const TaskCalendarPageShell = lazy(() =>
  import('@tuturuuu/tasks-ui/calendar/task-calendar-page-shell').then(
    (module) => ({ default: module.TaskCalendarPageShell })
  )
);
export const TaskProgressPage = lazy(() =>
  import('@tuturuuu/tasks-ui/progress/task-progress-page').then((module) => ({
    default: module.TaskProgressPage,
  }))
);
export const CyclePlanningView = lazy(() =>
  import('@tuturuuu/tasks-ui/tu-do/cycles/planning/cycle-planning-view').then(
    (module) => ({ default: module.CyclePlanningView })
  )
);
export const TaskCyclesView = lazy(() =>
  import('@tuturuuu/tasks-ui/tu-do/cycles/task-cycles-view').then((module) => ({
    default: module.TaskCyclesView,
  }))
);
export const TaskLegacyRouteRecovery = lazy(() =>
  import('@tuturuuu/tasks-ui/tu-do/shared/task-legacy-route-recovery').then(
    (module) => ({ default: module.TaskLegacyRouteRecovery })
  )
);
export const TaskPlanComposer = lazy(() =>
  import('../components/task-plan-composer').then((module) => ({
    default: module.TaskPlanComposer,
  }))
);
export const SharedTaskContent = lazy(
  () => import('../app/[locale]/shared/task/[shareCode]/content')
);
export const PublicTaskBoardContent = lazy(
  () => import('../app/[locale]/shared/task-boards/[code]/content')
);
