'use client';

import { Loader2, RotateCcw, Trash2 } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import {
  useDeletedTasks,
  usePermanentlyDeleteTasks,
  useRestoreTasks,
} from '@tuturuuu/utils/task-helper';
import { formatDistanceToNow } from 'date-fns';
import { useCallback, useMemo, useState } from 'react';

interface RecycleBinPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  lists: TaskList[];
  translations?: {
    recycleBin?: string;
    recycleBinDescription?: string;
    noDeletedTasks?: string;
    deletedTasksWillAppearHere?: string;
    selectedOfTotal?: string;
    deletedTasksCount?: string;
    restore?: string;
    delete?: string;
    restoreTasksTitle?: string;
    restoreTasksDescription?: string;
    cancel?: string;
    restoring?: string;
    permanentlyDeleteTitle?: string;
    permanentlyDeleteDescription?: string;
    deleting?: string;
    deletePermanently?: string;
    noListsAvailable?: string;
    restoredTasks?: string;
    failedToRestore?: string;
    permanentlyDeleted?: string;
    failedToDelete?: string;
    deletedAgo?: string;
    unknownList?: string;
    fromList?: string;
    nProjects?: string;
    selectAllTasks?: string;
    selectTask?: string;
    critical?: string;
    high?: string;
    normal?: string;
    low?: string;
  };
}

export function RecycleBinPanel({
  open,
  onOpenChange,
  boardId,
  lists,
  translations,
}: RecycleBinPanelProps) {
  // Use provided translations or fall back to English defaults
  const t = useMemo(
    () => ({
      recycleBin: translations?.recycleBin ?? 'Recycle Bin',
      recycleBinDescription:
        translations?.recycleBinDescription ??
        'Restore or permanently delete tasks that were previously removed.',
      noDeletedTasks: translations?.noDeletedTasks ?? 'No deleted tasks',
      deletedTasksWillAppearHere:
        translations?.deletedTasksWillAppearHere ??
        'Deleted tasks will appear here.',
      selectedOfTotal:
        translations?.selectedOfTotal ?? '{selected} of {total} selected',
      deletedTasksCount:
        translations?.deletedTasksCount ?? '{count} deleted tasks',
      restore: translations?.restore ?? 'Restore',
      delete: translations?.delete ?? 'Delete',
      restoreTasksTitle:
        translations?.restoreTasksTitle ?? 'Restore {count} tasks?',
      restoreTasksDescription:
        translations?.restoreTasksDescription ??
        'These tasks will be restored to their original lists (or the first available list if the original list was deleted).',
      cancel: translations?.cancel ?? 'Cancel',
      restoring: translations?.restoring ?? 'Restoring...',
      permanentlyDeleteTitle:
        translations?.permanentlyDeleteTitle ??
        'Permanently delete {count} tasks?',
      permanentlyDeleteDescription:
        translations?.permanentlyDeleteDescription ??
        'This action cannot be undone. These tasks will be permanently removed.',
      deleting: translations?.deleting ?? 'Deleting...',
      deletePermanently:
        translations?.deletePermanently ?? 'Delete Permanently',
      noListsAvailable: translations?.noListsAvailable ?? 'No lists available',
      restoredTasks: translations?.restoredTasks ?? 'Restored {count} tasks',
      failedToRestore:
        translations?.failedToRestore ?? 'Failed to restore tasks',
      permanentlyDeleted:
        translations?.permanentlyDeleted ?? 'Permanently deleted {count} tasks',
      failedToDelete: translations?.failedToDelete ?? 'Failed to delete tasks',
      deletedAgo: translations?.deletedAgo ?? 'Deleted {time}',
      unknownList: translations?.unknownList ?? 'Unknown List',
      fromList: translations?.fromList ?? 'from: {list}',
      nProjects: translations?.nProjects ?? '{count} projects',
      selectAllTasks: translations?.selectAllTasks ?? 'Select all tasks',
      selectTask: translations?.selectTask ?? 'Select {name}',
      critical: translations?.critical ?? 'Critical',
      high: translations?.high ?? 'High',
      normal: translations?.normal ?? 'Normal',
      low: translations?.low ?? 'Low',
    }),
    [translations]
  );

  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: deletedTasks = [], isLoading } = useDeletedTasks(boardId, {
    enabled: open,
    staleTime: 0,
  });
  const restoreMutation = useRestoreTasks(boardId);
  const deleteMutation = usePermanentlyDeleteTasks(boardId);

  // Get list name by ID for display
  const listMap = useMemo(() => {
    const map = new Map<string, string>();
    lists.forEach((list) => {
      map.set(list.id, list.name);
    });
    return map;
  }, [lists]);

  // Get first available list for fallback
  const firstListId = useMemo(() => {
    const availableList = lists.find((list) => !list.deleted);
    return availableList?.id;
  }, [lists]);

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedTasks(new Set(deletedTasks.map((t) => t.id)));
      } else {
        setSelectedTasks(new Set());
      }
    },
    [deletedTasks]
  );

  const handleSelectTask = useCallback((taskId: string, checked: boolean) => {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }, []);

  // Close Sheet when AlertDialog opens to prevent aria-hidden conflicts
  const handleRestoreDialogOpenChange = useCallback(
    (isOpen: boolean) => {
      setRestoreDialogOpen(isOpen);
      if (isOpen) {
        onOpenChange(false); // Close Sheet when dialog opens
      }
    },
    [onOpenChange]
  );

  const handleDeleteDialogOpenChange = useCallback(
    (isOpen: boolean) => {
      setDeleteDialogOpen(isOpen);
      if (isOpen) {
        onOpenChange(false); // Close Sheet when dialog opens
      }
    },
    [onOpenChange]
  );

  const handleRestore = useCallback(async () => {
    if (selectedTasks.size === 0) return;

    if (!firstListId) {
      toast.error(t.noListsAvailable);
      return;
    }

    try {
      await restoreMutation.mutateAsync({
        taskIds: Array.from(selectedTasks),
        fallbackListId: firstListId,
      });
      toast.success(
        t.restoredTasks.replace('{count}', String(selectedTasks.size))
      );
      setSelectedTasks(new Set());
      setRestoreDialogOpen(false);
    } catch {
      toast.error(t.failedToRestore);
    }
  }, [selectedTasks, firstListId, restoreMutation, t]);

  const handlePermanentDelete = useCallback(async () => {
    if (selectedTasks.size === 0) return;

    try {
      await deleteMutation.mutateAsync(Array.from(selectedTasks));
      toast.success(
        t.permanentlyDeleted.replace('{count}', String(selectedTasks.size))
      );
      setSelectedTasks(new Set());
      setDeleteDialogOpen(false);
    } catch {
      toast.error(t.failedToDelete);
    }
  }, [selectedTasks, deleteMutation, t]);

  const allSelected =
    deletedTasks.length > 0 && selectedTasks.size === deletedTasks.length;
  const someSelected = selectedTasks.size > 0;
  const isWorking = restoreMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {t.recycleBin}
            </SheetTitle>
            <SheetDescription>{t.recycleBinDescription}</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Header with select all */}
            {deletedTasks.length > 0 && (
              <div className="flex items-center gap-3 border-b p-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label={t.selectAllTasks}
                />
                <span className="text-foreground text-sm">
                  {someSelected
                    ? t.selectedOfTotal
                        .replace('{selected}', String(selectedTasks.size))
                        .replace('{total}', String(deletedTasks.length))
                    : t.deletedTasksCount.replace(
                        '{count}',
                        String(deletedTasks.length)
                      )}
                </span>
              </div>
            )}

            {/* Task list */}
            <div className="flex-1 overflow-y-auto p-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : deletedTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Trash2 className="mb-3 h-12 w-12 text-muted-foreground/50" />
                  <p className="text-muted-foreground">{t.noDeletedTasks}</p>
                  <p className="mt-1 text-muted-foreground/70 text-xs">
                    {t.deletedTasksWillAppearHere}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {deletedTasks.map((task) => (
                    <RecycleBinTaskRow
                      key={task.id}
                      task={task}
                      listName={listMap.get(task.list_id)}
                      isSelected={selectedTasks.has(task.id)}
                      onSelect={(checked) => handleSelectTask(task.id, checked)}
                      disabled={isWorking}
                      translations={t}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Action bar */}
            {someSelected && (
              <div className="flex items-center gap-2 border-t px-3 py-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setRestoreDialogOpen(true)}
                  disabled={isWorking}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t.restore} ({selectedTasks.size})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={isWorking}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t.delete} ({selectedTasks.size})
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Restore Confirmation Dialog */}
      <AlertDialog
        open={restoreDialogOpen}
        onOpenChange={handleRestoreDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.restoreTasksTitle.replace(
                '{count}',
                String(selectedTasks.size)
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.restoreTasksDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWorking}>
              {t.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestore}
              disabled={isWorking}
              className="bg-dynamic-green hover:bg-dynamic-green/90"
            >
              {isWorking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.restoring}
                </>
              ) : (
                <>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t.restore}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={handleDeleteDialogOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.permanentlyDeleteTitle.replace(
                '{count}',
                String(selectedTasks.size)
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.permanentlyDeleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isWorking}>
              {t.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              disabled={isWorking}
              className="bg-dynamic-red hover:bg-dynamic-red/90"
            >
              {isWorking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.deleting}
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t.deletePermanently}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface RecycleBinTaskRowProps {
  task: Task;
  listName?: string;
  isSelected: boolean;
  onSelect: (checked: boolean) => void;
  disabled?: boolean;
  translations: {
    critical: string;
    high: string;
    normal: string;
    low: string;
    selectTask: string;
    fromList: string;
    nProjects: string;
    deletedAgo: string;
  } & Record<string, string>;
}

function RecycleBinTaskRow({
  task,
  listName,
  isSelected,
  onSelect,
  disabled,
  translations: t,
}: RecycleBinTaskRowProps) {
  const deletedTimeAgo = task.deleted_at
    ? formatDistanceToNow(new Date(task.deleted_at), { addSuffix: true })
    : '';

  // Priority indicator helper
  const getPriorityBadge = (priority: string | null) => {
    if (!priority) return null;

    const priorityConfig: Record<string, { label: string; className: string }> =
      {
        critical: {
          label: t.critical,
          className: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
        },
        high: {
          label: t.high,
          className:
            'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
        },
        normal: {
          label: t.normal,
          className:
            'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
        },
        low: {
          label: t.low,
          className:
            'border-dynamic-gray/30 bg-dynamic-gray/10 text-dynamic-gray',
        },
      };

    const config = priorityConfig[priority] || priorityConfig.normal;

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium text-[10px]',
          config?.className || ''
        )}
      >
        {config?.label || ''}
      </span>
    );
  };

  return (
    <div
      className={cn(
        'group relative rounded-lg border-l-4 p-3 transition-all',
        'border-l-dynamic-gray/50 bg-background hover:bg-muted/30',
        isSelected &&
          'scale-[1.01] border-l-primary bg-linear-to-r from-primary/10 via-primary/5 to-transparent shadow-lg ring-2 ring-primary/60',
        disabled && 'opacity-50'
      )}
    >
      {/* Selection indicator */}
      <div
        className={cn(
          'absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all duration-200',
          isSelected
            ? 'scale-110 border-primary bg-primary text-primary-foreground shadow-md'
            : 'border-border bg-background/80 text-muted-foreground shadow-sm hover:scale-105 hover:border-primary/50'
        )}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={onSelect}
          disabled={disabled}
          className="h-4 w-4 border-0 bg-transparent"
          aria-label={t.selectTask.replace('{name}', task.name || '')}
        />
      </div>

      <div className="ml-8 flex min-w-0 flex-1 flex-col gap-2">
        {/* Task name */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="line-clamp-2 font-semibold text-foreground text-sm leading-tight">
            {task.name}
          </h4>
        </div>

        {/* Metadata badges */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Priority badge */}
          {task.priority && getPriorityBadge(task.priority)}

          {/* List badge */}
          {listName && (
            <span className="inline-flex items-center gap-1 rounded-md border border-dynamic-purple/30 bg-dynamic-purple/10 px-2 py-0.5 text-[10px] text-dynamic-purple">
              <Trash2 className="h-2.5 w-2.5" />
              {t.fromList.replace('{list}', listName)}
            </span>
          )}

          {/* Labels display */}
          {task.labels && task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.labels.slice(0, 3).map((label) => (
                <span
                  key={label.id}
                  className={cn(
                    'inline-flex items-center rounded-md border px-2 py-0.5 text-[10px]',
                    `border-dynamic-${label.color}/30 bg-dynamic-${label.color}/10 text-dynamic-${label.color}`
                  )}
                >
                  {label.name}
                </span>
              ))}
              {task.labels.length > 3 && (
                <span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                  +{task.labels.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Estimation points */}
          {task.estimation_points != null && (
            <span className="inline-flex items-center gap-1 rounded-md border border-dynamic-blue/30 bg-dynamic-blue/10 px-2 py-0.5 text-[10px] text-dynamic-blue">
              {task.estimation_points} pts
            </span>
          )}

          {/* Projects display */}
          {task.projects && task.projects.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-dynamic-sky/30 bg-dynamic-sky/10 px-2 py-0.5 text-[10px] text-dynamic-sky">
              {task.projects.length === 1
                ? task.projects[0]?.name
                : t.nProjects.replace('{count}', String(task.projects.length))}
            </span>
          )}
        </div>

        {/* Deleted timestamp */}
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Trash2 className="h-2.5 w-2.5" />
          <span>{t.deletedAgo.replace('{time}', deletedTimeAgo)}</span>
        </div>
      </div>
    </div>
  );
}
