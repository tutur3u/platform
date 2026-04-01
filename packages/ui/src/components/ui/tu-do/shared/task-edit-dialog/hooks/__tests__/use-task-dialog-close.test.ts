import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskDialogClose } from '../use-task-dialog-close';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}

describe('useTaskDialogClose', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for description persistence verification before closing', async () => {
    const onClose = vi.fn();
    const flushNameUpdate = vi.fn().mockResolvedValue(undefined);
    const persistTaskDescription = vi.fn();
    const deferred = createDeferred<boolean>();
    persistTaskDescription.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() =>
      useTaskDialogClose({
        taskId: 'task-1',
        isCreateMode: false,
        collaborationMode: false,
        synced: true,
        connected: true,
        draftStorageKey: 'draft-key',
        onClose,
        flushNameUpdate,
        persistTaskDescription,
        setShowSyncWarning: vi.fn(),
      })
    );

    await act(async () => {
      void result.current.handleClose();
    });

    expect(onClose).not.toHaveBeenCalled();

    deferred.resolve(true);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(flushNameUpdate).toHaveBeenCalledTimes(1);
    expect(persistTaskDescription).toHaveBeenCalledTimes(1);
  });

  it('blocks close when persistence verification fails', async () => {
    const onClose = vi.fn();
    const onCloseBlocked = vi.fn();

    const { result } = renderHook(() =>
      useTaskDialogClose({
        taskId: 'task-1',
        isCreateMode: false,
        collaborationMode: false,
        synced: true,
        connected: true,
        draftStorageKey: 'draft-key',
        onClose,
        flushNameUpdate: vi.fn().mockResolvedValue(undefined),
        persistTaskDescription: vi.fn().mockResolvedValue(false),
        onCloseBlocked,
        setShowSyncWarning: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.handleClose();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(onCloseBlocked).toHaveBeenCalledTimes(1);
  });

  it('shows sync warning instead of closing when collaboration is not synced', async () => {
    const setShowSyncWarning = vi.fn();
    const persistTaskDescription = vi.fn();

    const { result } = renderHook(() =>
      useTaskDialogClose({
        taskId: 'task-1',
        isCreateMode: false,
        collaborationMode: true,
        synced: false,
        connected: true,
        draftStorageKey: 'draft-key',
        onClose: vi.fn(),
        flushNameUpdate: vi.fn(),
        persistTaskDescription,
        hasPendingRealtimeDescriptionChanges: () => true,
        setShowSyncWarning,
      })
    );

    await act(async () => {
      await result.current.handleClose();
    });

    expect(setShowSyncWarning).toHaveBeenCalledWith(true);
    expect(persistTaskDescription).not.toHaveBeenCalled();
  });

  it('closes immediately when collaboration is reconnecting but description content is unchanged', async () => {
    const onClose = vi.fn();
    const flushNameUpdate = vi.fn().mockResolvedValue(undefined);
    const persistTaskDescription = vi.fn();

    const { result } = renderHook(() =>
      useTaskDialogClose({
        taskId: 'task-1',
        isCreateMode: false,
        collaborationMode: true,
        synced: false,
        connected: false,
        draftStorageKey: 'draft-key',
        onClose,
        flushNameUpdate,
        persistTaskDescription,
        hasPendingRealtimeDescriptionChanges: () => false,
        setShowSyncWarning: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.handleClose();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(flushNameUpdate).toHaveBeenCalledTimes(1);
    expect(persistTaskDescription).toHaveBeenCalledTimes(1);
  });

  it('force closes immediately and continues persistence in the background', async () => {
    const onClose = vi.fn();
    const flushNameUpdate = vi.fn().mockResolvedValue(undefined);
    const persistTaskDescription = vi.fn().mockResolvedValue(true);

    const { result } = renderHook(() =>
      useTaskDialogClose({
        taskId: 'task-1',
        isCreateMode: false,
        collaborationMode: true,
        synced: false,
        connected: false,
        draftStorageKey: 'draft-key',
        onClose,
        flushNameUpdate,
        persistTaskDescription,
        setShowSyncWarning: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.handleForceClose();
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(flushNameUpdate).toHaveBeenCalledTimes(1);
      expect(persistTaskDescription).toHaveBeenCalledTimes(1);
    });
  });

  it('allows retrying close after a transient persistence failure', async () => {
    const onClose = vi.fn();
    const onCloseBlocked = vi.fn();
    const persistTaskDescription = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const { result } = renderHook(() =>
      useTaskDialogClose({
        taskId: 'task-1',
        isCreateMode: false,
        collaborationMode: false,
        synced: true,
        connected: true,
        draftStorageKey: 'draft-key',
        onClose,
        flushNameUpdate: vi.fn().mockResolvedValue(undefined),
        persistTaskDescription,
        onCloseBlocked,
        setShowSyncWarning: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.handleClose();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(onCloseBlocked).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.handleClose();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(persistTaskDescription).toHaveBeenCalledTimes(2);
  });
});
