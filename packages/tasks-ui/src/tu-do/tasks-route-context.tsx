'use client';

import { createContext, useContext } from 'react';

/**
 * Context for the tasks route prefix.
 *
 * In apps/web, task routes live under `/{wsId}/tasks/...`,
 * so the prefix is "/tasks" (the default).
 *
 * In apps/tasks (the satellite app), routes are directly at `/{wsId}/...`,
 * so the prefix should be set to "" via TasksRouteProvider.
 */
const TasksRouteContext = createContext('/tasks');

export function TasksRouteProvider({
  children,
  prefix = '/tasks',
}: {
  children: React.ReactNode;
  prefix?: string;
}) {
  return (
    <TasksRouteContext.Provider value={prefix}>
      {children}
    </TasksRouteContext.Provider>
  );
}

/**
 * Returns a function that prepends the tasks route prefix to a path.
 *
 * Usage:
 * ```tsx
 * const tasksHref = useTasksHref();
 * // In web app: tasksHref('/boards') -> '/tasks/boards'
 * // In tasks satellite app: tasksHref('/boards') -> '/boards'
 * ```
 */
export function useTasksHref() {
  const prefix = useContext(TasksRouteContext);
  return (path: string) => `${prefix}${path}`;
}

/**
 * Returns the raw tasks route prefix string.
 */
export function useTasksRoutePrefix() {
  return useContext(TasksRouteContext);
}
