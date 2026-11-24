import { useRouterState } from '@tanstack/react-router';
import { TaskBoardLoadingState } from '@tuturuuu/tasks-ui/tu-do/shared/task-board-loading-state';
import { SkeletonList } from '@tuturuuu/ui/skeleton';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import type { ReactNode } from 'react';

/**
 * Board routes: a board, and the boards and tasks entry points, which open the
 * last board. The saved board view loads with the board, so the placeholder
 * uses the default Kanban layout.
 */
const BOARD_PATH = /\/(?:boards(?:\/[^/]+)?|tasks)\/?$/;

/**
 * The placeholder shown while the next page's model loads. It replaces the
 * whole workspace shell, so it fills the page without the shell's padding,
 * and takes the shape of the page being opened instead of a single band.
 */
export function TasksPageLoading() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const label = (path.startsWith('/vi/') ? vi : en).common.loading;

  return (
    <main aria-busy="true">
      <div aria-label={label} role="progressbar">
        {BOARD_PATH.test(path) ? (
          <TaskBoardLoadingState showHeader />
        ) : (
          <SkeletonList className="p-2" rows={6} withTrailing />
        )}
      </div>
    </main>
  );
}

export function PageTransition({
  loadedPath,
  children,
}: {
  loadedPath: string;
  children: ReactNode;
}) {
  const requestedPath = useRouterState({
    select: (state) => state.location.pathname,
  });
  return requestedPath === loadedPath ? children : <TasksPageLoading />;
}
