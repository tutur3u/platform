'use client';

import { History, Loader2 } from '@tuturuuu/icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import type { CurrentTaskState } from '@tuturuuu/utils/task-snapshot';
import { format, formatDistanceToNow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import type { EstimationType } from '../estimation-mapping';
import type { RevertibleField } from './hooks/use-task-revert';
import { useTaskRevert } from './hooks/use-task-revert';
import { useTaskSnapshot } from './hooks/use-task-snapshot';
import { SelectiveRevertPanel } from './selective-revert-panel';
import type { TaskHistoryEntry } from './task-activity-section';

interface TaskSnapshotDialogProps {
  wsId: string;
  taskId: string;
  boardId: string;
  historyEntry: TaskHistoryEntry;
  currentTask: CurrentTaskState;
  isOpen: boolean;
  onClose: () => void;
  onRevertSuccess?: () => void;
  locale?: string;
  t?: (key: string, options?: { defaultValue?: string }) => string;
  /** Estimation type for displaying points */
  estimationType?: EstimationType;
  /** When true, disables the revert functionality (feature not stable) */
  revertDisabled?: boolean;
}

const defaultT = (key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue || key;

export function TaskSnapshotDialog({
  wsId,
  taskId,
  boardId,
  historyEntry,
  currentTask,
  isOpen,
  onClose,
  onRevertSuccess,
  locale = 'en',
  t = defaultT,
  estimationType,
  revertDisabled = false,
}: TaskSnapshotDialogProps) {
  const dateLocale = locale === 'vi' ? vi : enUS;

  // Fetch the snapshot at this history point
  const {
    data: snapshotData,
    isLoading,
    error,
  } = useTaskSnapshot({
    wsId,
    taskId,
    historyId: historyEntry.id,
    enabled: isOpen,
  });

  // Revert mutation
  const revertMutation = useTaskRevert({
    wsId,
    taskId,
    boardId,
    onSuccess: () => {
      onRevertSuccess?.();
      onClose();
    },
    t,
  });

  const handleRevert = async (fields: RevertibleField[]) => {
    await revertMutation.mutateAsync({
      historyId: historyEntry.id,
      fields,
    });
  };

  const timeAgo = formatDistanceToNow(new Date(historyEntry.changed_at), {
    addSuffix: true,
    locale: dateLocale,
  });

  const exactTime = format(new Date(historyEntry.changed_at), 'PPpp', {
    locale: dateLocale,
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="grid max-h-[85vh] w-full max-w-2xl grid-rows-[auto_1fr] overflow-hidden md:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-purple/10">
              <History className="h-4 w-4 text-dynamic-purple" />
            </div>
            <div>
              <DialogTitle>
                {t('snapshot_title', { defaultValue: 'Task Snapshot' })}
              </DialogTitle>
              <DialogDescription className="text-xs">
                <span title={exactTime}>{timeAgo}</span>
                {' - '}
                {historyEntry.user?.name ||
                  t('unknown_user', { defaultValue: 'Unknown user' })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 overflow-hidden">
          <ScrollArea className="-mx-6 h-full px-6">
            <div className="py-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="py-8 text-center">
                  <p className="text-destructive text-sm">
                    {t('error_loading', {
                      defaultValue: 'Failed to load snapshot',
                    })}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {error.message}
                  </p>
                </div>
              ) : snapshotData?.snapshot ? (
                <SelectiveRevertPanel
                  snapshot={snapshotData.snapshot}
                  currentTask={currentTask}
                  onRevert={handleRevert}
                  isReverting={revertMutation.isPending}
                  locale={locale}
                  t={t}
                  estimationType={estimationType}
                  revertDisabled={revertDisabled}
                />
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  {t('no_snapshot', {
                    defaultValue: 'No snapshot data available',
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
