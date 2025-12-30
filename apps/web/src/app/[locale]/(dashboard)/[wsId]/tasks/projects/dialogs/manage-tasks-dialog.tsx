'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Badge } from '@tuturuuu/ui/badge';
import { Label } from '@tuturuuu/ui/label';
import { Loader2, Trash2 } from '@tuturuuu/icons';
import type { TaskProject, TaskOption } from '../types';

interface ManageTasksDialogProps {
  project: TaskProject | null;
  onClose: () => void;
  availableTaskOptions: TaskOption[];
  tasksLoading: boolean;
  tasksError: Error | null;
  onLinkTask: (taskId: string) => void;
  onUnlinkTask: (taskId: string) => void;
  isLinking: boolean;
  isUnlinking: boolean;
}

export function ManageTasksDialog({
  project,
  onClose,
  availableTaskOptions,
  tasksLoading,
  tasksError,
  onLinkTask,
  onUnlinkTask,
  isLinking,
  isUnlinking,
}: ManageTasksDialogProps) {
  const t = useTranslations('task-projects.manage_tasks_dialog');
  const [taskToLink, setTaskToLink] = useState('');

  const filteredTaskOptions = useMemo(() => {
    if (!project) return [];
    const linkedIds = new Set(project.linkedTasks.map((task) => task.id));
    return availableTaskOptions.filter((task) => !linkedIds.has(task.id));
  }, [availableTaskOptions, project]);

  const handleLinkTask = () => {
    if (taskToLink) {
      onLinkTask(taskToLink);
      setTaskToLink('');
    }
  };

  const handleClose = () => {
    setTaskToLink('');
    onClose();
  };

  return (
    <Dialog
      open={Boolean(project)}
      onOpenChange={(open) => !open && handleClose()}
    >
      <DialogContent className="flex max-h-[85vh] flex-col">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {project ? (
          <div className="flex-1 space-y-4 overflow-y-auto py-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-medium text-sm">
                  {t('linked_tasks')}
                </Label>
                {project.linkedTasks.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {project.linkedTasks.length}{' '}
                    {project.linkedTasks.length === 1
                      ? t('task')
                      : t('tasks_plural')}
                  </Badge>
                )}
              </div>
              {project.linkedTasks.length > 0 ? (
                <div className="max-h-75 space-y-2 overflow-y-auto pr-2">
                  {project.linkedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-dynamic-surface/40 bg-dynamic-surface/25 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-sm">
                          {task.name}
                        </p>
                        <p className="truncate text-muted-foreground text-xs">
                          {task.listName ?? t('unassigned_list')}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 text-dynamic-red hover:text-dynamic-red focus-visible:text-dynamic-red"
                        onClick={() => onUnlinkTask(task.id)}
                        disabled={isUnlinking}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">{t('remove')}</span>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
                  <p className="text-center text-muted-foreground text-sm">
                    {t('no_tasks_linked')}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="font-medium text-sm">{t('link_a_task')}</Label>
              <Select
                value={taskToLink}
                onValueChange={setTaskToLink}
                disabled={
                  tasksLoading || filteredTaskOptions.length === 0 || isLinking
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('select_task_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {tasksLoading ? (
                    <SelectItem disabled value="loading">
                      {t('loading_tasks')}
                    </SelectItem>
                  ) : filteredTaskOptions.length === 0 ? (
                    <SelectItem disabled value="none">
                      {t('no_available_tasks')}
                    </SelectItem>
                  ) : (
                    filteredTaskOptions.map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        <div className="flex items-center gap-2">
                          <span className="truncate">{task.name}</span>
                          {task.listName && (
                            <span className="text-muted-foreground text-xs">
                              · {task.listName}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {tasksError ? (
                <p className="text-dynamic-red text-sm">{tasksError.message}</p>
              ) : filteredTaskOptions.length === 0 && !tasksLoading ? (
                <p className="text-muted-foreground text-sm">
                  {t('all_tasks_linked')}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleClose}>
            {t('close')}
          </Button>
          <Button
            onClick={handleLinkTask}
            disabled={
              !taskToLink || isLinking || filteredTaskOptions.length === 0
            }
          >
            {isLinking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('linking')}
              </>
            ) : (
              t('link_task')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
