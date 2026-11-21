import {
  createMountedAppAuth,
  consumeMountedSharedSession,
  resolveMountedSharedSession,
} from '@tuturuuu/auth/proxy';

export const TASKS_APEX_URL = 'https://tuturuuu.com/tasks';

const mounted = createMountedAppAuth(
  { targetApp: 'tasks' },
  {
    resolveMountedSharedSession: (...args) =>
      resolveMountedSharedSession(...args),
    consumeMountedSharedSession: (...args) =>
      consumeMountedSharedSession(...args),
  }
);

export const isMountedTasks = mounted.isMounted;
export const resolveMountedTasksSession = mounted.resolveSession;
export const mountedTasksAuth = mounted.auth;
