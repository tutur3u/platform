'use client';

import { uploadWorkspaceTaskFile } from '@tuturuuu/internal-api';
import { deleteDiscardedWorkspaceTaskMedia } from '@tuturuuu/internal-api/task-media-cleanup';
import { useCallback, useRef } from 'react';
import type { TaskMediaPermissionAccess } from '../task-media-permission-dialog';

interface Options {
  workspaceId: string | null | undefined;
  taskId?: string;
  isCreateMode: boolean;
  disabled: boolean;
  errorMessage: string;
  permissionMessage: string;
  setTaskMediaAccess: (access: TaskMediaPermissionAccess | null) => void;
  setShowTaskMediaPermissionDialog: (show: boolean) => void;
}

export function useTaskMediaUpload({
  workspaceId,
  taskId,
  isCreateMode,
  disabled,
  errorMessage,
  permissionMessage,
  setTaskMediaAccess,
  setShowTaskMediaPermissionDialog,
}: Options) {
  const discardedPathsRef = useRef(new Set<string>());

  const upload = useCallback(
    async (file: File): Promise<string> => {
      if (!workspaceId) throw new Error(errorMessage);
      if (disabled) {
        throw Object.assign(new Error(permissionMessage), {
          code: 'INSUFFICIENT_PERMISSIONS',
        });
      }

      let result: Awaited<ReturnType<typeof uploadWorkspaceTaskFile>>;
      try {
        result = await uploadWorkspaceTaskFile(workspaceId, file, {
          taskId: isCreateMode ? undefined : taskId,
        });
      } catch (error) {
        const denied = error as {
          code?: string;
          status?: number;
          statusCode?: number;
          taskMediaAccess?: TaskMediaPermissionAccess | null;
        };
        if (
          denied.code === 'TASK_MEDIA_PERMISSION_DENIED' ||
          denied.status === 403 ||
          denied.statusCode === 403
        ) {
          setTaskMediaAccess(denied.taskMediaAccess ?? null);
          setShowTaskMediaPermissionDialog(true);
        }
        throw error;
      }

      if (isCreateMode) discardedPathsRef.current.add(result.path);
      const query = new URLSearchParams({ path: result.path });
      if (!isCreateMode && taskId) query.set('taskId', taskId);
      return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/storage/share?${query.toString()}`;
    },
    [
      workspaceId,
      taskId,
      isCreateMode,
      disabled,
      errorMessage,
      permissionMessage,
      setTaskMediaAccess,
      setShowTaskMediaPermissionDialog,
    ]
  );

  const cleanUpDiscarded = useCallback(async () => {
    if (!workspaceId || !discardedPathsRef.current.size) return;
    const paths = [...discardedPathsRef.current];
    try {
      for (let index = 0; index < paths.length; index += 20) {
        const batch = paths.slice(index, index + 20);
        await deleteDiscardedWorkspaceTaskMedia(workspaceId, batch);
        for (const path of batch) discardedPathsRef.current.delete(path);
      }
    } catch (error) {
      // The daily sweep retries orphaned uploads even if the tab closes early.
      console.warn('Failed to clean up discarded task media:', error);
    }
  }, [workspaceId]);

  return { upload, cleanUpDiscarded };
}
