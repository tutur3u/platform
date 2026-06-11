import type { ComponentType } from 'react';

type TaskDialogManagerComponent = ComponentType<{
  wsId: string;
}>;

let taskDialogManagerPromise: Promise<TaskDialogManagerComponent> | undefined;

export function preloadTaskDialogManager(): Promise<TaskDialogManagerComponent> {
  taskDialogManagerPromise ??= import(
    '@tuturuuu/ui/tu-do/shared/task-dialog-manager'
  ).then((module) => module.TaskDialogManager);

  return taskDialogManagerPromise;
}
