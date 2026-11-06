import '@tanstack/react-start/server-only';
import { createTaskPageModel } from '@tuturuuu/tasks-ui/tu-do/shared/task-page-model';
import { getPermissions, getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { notFound, redirect } from './next-navigation';
import { headers } from './request-context';
export const taskPageModel = createTaskPageModel({
  headers,
  notFound,
  redirect,
  getPermissions,
  getWorkspace,
});
export type { TaskPageModel } from '@tuturuuu/tasks-ui/tu-do/shared/task-page-model';
