import { useRouterState } from '@tanstack/react-router';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import type { ReactNode } from 'react';

export function TasksPageLoading() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const label = (path.startsWith('/vi/') ? vi : en).common.loading;
  return (
    <main
      aria-busy="true"
      className="flex min-h-screen items-center justify-center"
    >
      <div
        role="progressbar"
        aria-label={label}
        className="h-40 w-full animate-pulse bg-muted"
      />
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
