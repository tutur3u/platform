'use client';

import dynamic from 'next/dynamic';
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useTaskDialogContext } from '../providers/task-dialog-provider';

const TaskEditDialog = dynamic(
  () =>
    import('./task-edit-dialog').then((mod) => ({
      default: mod.TaskEditDialog,
    })),
  {
    ssr: false,
  }
);

/**
 * Manager component that renders the centralized task dialog
 * This component should be placed once at the workspace layout level
 * It lazy-loads the actual dialog component only when first opened
 */
export function TaskDialogManager() {
  const { state, triggerClose, triggerUpdate, openTaskById, closeDialog } =
    useTaskDialogContext();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams();
  const wsId = params.wsId as string;
  const previousUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (state.isOpen && state.mode === 'edit' && state.task?.id) {
      const taskUrl = `/${wsId}/tasks/${state.task.id}`;

      if (previousUrlRef.current === null && pathname !== taskUrl) {
        // First time opening from a different page, store previous URL and navigate to task URL
        previousUrlRef.current =
          pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
        router.push(taskUrl);
      } else if (previousUrlRef.current !== null && pathname !== taskUrl) {
        // Dialog is open and user navigated away (e.g. browser back)
        closeDialog();
      }
    }
  }, [
    state.isOpen,
    state.mode,
    state.task?.id,
    pathname,
    router,
    wsId,
    closeDialog,
    searchParams,
  ]);

  const handleClose = () => {
    if (previousUrlRef.current) {
      router.push(previousUrlRef.current);
      closeDialog();
    } else {
      triggerClose();
    }
  };

  if (!state.isOpen || !state.task) {
    if (previousUrlRef.current) {
      previousUrlRef.current = null;
    }
    return null;
  }

  return (
    <TaskEditDialog
      task={state.task}
      boardId={state.boardId || ''}
      isOpen={state.isOpen}
      onClose={handleClose}
      onUpdate={triggerUpdate}
      availableLists={state.availableLists}
      mode={state.mode}
      collaborationMode={state.collaborationMode}
      onOpenTask={openTaskById}
      filters={state.filters}
    />
  );
}