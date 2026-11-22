'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  classifyDriveUploadError,
  driveUploadReducer,
  summarizeDriveUploads,
} from './drive-upload-queue';
import {
  DriveUploadAbortedError,
  transferDriveUpload,
} from './drive-upload-transfer';

const MAX_PARALLEL_UPLOADS = 3;

interface PendingUpload {
  id: string;
  file: File;
  path: string;
}

type Transfer = typeof transferDriveUpload;

/**
 * Upload queue for one workspace. Transfers start from user events (pick,
 * drop, retry) and from the completion of earlier transfers; nothing starts
 * from render.
 */
export function useDriveUploads({
  onSettled,
  transfer = transferDriveUpload,
  wsId,
}: {
  /** Runs once each time the queue drains after a successful upload. */
  onSettled: () => void | Promise<void>;
  transfer?: Transfer;
  wsId: string;
}) {
  const [items, dispatch] = useReducer(driveUploadReducer, []);
  const files = useRef(new Map<string, PendingUpload>());
  const pending = useRef<string[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  /** Failed or canceled uploads whose file can be sent again. */
  const retryable = useRef(new Set<string>());
  const succeededSinceDrain = useRef(false);
  const nextId = useRef(0);

  const pump = useCallback(() => {
    while (
      controllers.current.size < MAX_PARALLEL_UPLOADS &&
      pending.current.length > 0
    ) {
      const id = pending.current.shift();
      const upload = id ? files.current.get(id) : undefined;
      if (!id || !upload) continue;

      const controller = new AbortController();
      controllers.current.set(id, controller);
      dispatch({ type: 'start', id });

      void transfer({
        file: upload.file,
        path: upload.path,
        signal: controller.signal,
        wsId,
        onProgress: (loaded) => dispatch({ type: 'progress', id, loaded }),
        onFinalizing: () => dispatch({ type: 'finalize', id }),
      })
        .then(() => {
          succeededSinceDrain.current = true;
          dispatch({ type: 'succeed', id });
        })
        .catch((error: unknown) => {
          retryable.current.add(id);
          if (error instanceof DriveUploadAbortedError) {
            dispatch({ type: 'cancel', id });
            return;
          }
          dispatch({
            type: 'fail',
            id,
            reason: classifyDriveUploadError(error),
          });
        })
        .finally(() => {
          controllers.current.delete(id);
          if (
            controllers.current.size === 0 &&
            pending.current.length === 0 &&
            succeededSinceDrain.current
          ) {
            succeededSinceDrain.current = false;
            void onSettled();
          }
          pump();
        });
    }
  }, [onSettled, transfer, wsId]);

  const enqueue = useCallback(
    (selected: Iterable<File>, path: string) => {
      const batch = Array.from(selected).map((file) => {
        nextId.current += 1;
        const id = `upload-${nextId.current}`;
        files.current.set(id, { id, file, path });
        pending.current.push(id);
        return { id, name: file.name, path, size: file.size };
      });
      if (batch.length === 0) return;
      dispatch({ type: 'enqueue', items: batch });
      pump();
    },
    [pump]
  );

  const cancel = useCallback((id: string) => {
    const controller = controllers.current.get(id);
    if (controller) {
      controller.abort();
      return;
    }
    if (!pending.current.includes(id)) return;
    pending.current = pending.current.filter((pendingId) => pendingId !== id);
    retryable.current.add(id);
    dispatch({ type: 'cancel', id });
  }, []);

  const cancelAll = useCallback(() => {
    for (const id of pending.current) {
      retryable.current.add(id);
      dispatch({ type: 'cancel', id });
    }
    pending.current = [];
    for (const controller of controllers.current.values()) controller.abort();
  }, []);

  const retry = useCallback(
    (id: string) => {
      if (!retryable.current.delete(id)) return;
      dispatch({ type: 'retry', id });
      pending.current.push(id);
      pump();
    },
    [pump]
  );

  const clearFinished = useCallback(() => {
    for (const id of files.current.keys()) {
      if (!controllers.current.has(id) && !pending.current.includes(id)) {
        files.current.delete(id);
        retryable.current.delete(id);
      }
    }
    dispatch({ type: 'clear-finished' });
  }, []);

  const summary = useMemo(() => summarizeDriveUploads(items), [items]);

  // Leaving the page aborts every transfer, so ask first while any run.
  const uploading = summary.activeCount > 0;
  useEffect(() => {
    if (!uploading) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [uploading]);

  return { cancel, cancelAll, clearFinished, enqueue, items, retry, summary };
}

export type DriveUploads = ReturnType<typeof useDriveUploads>;
