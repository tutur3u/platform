import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginTaskDraftSave } from '../task-draft-save-session';
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
  let finishSave: (() => void) | undefined;
  afterEach(() => {
    finishSave?.();
    finishSave = undefined;
  });
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('blocks normal, forced, and back navigation while creation is saving', async () => {
    const onClose = vi.fn();
    const onNavigateToTask = vi.fn();
    finishSave = beginTaskDraftSave('draft-key');
    const { result } = renderHook(() =>
      useTaskDialogClose({
        isCreateMode: true,
        collaborationMode: false,
        synced: true,
        connected: true,
        draftStorageKey: 'draft-key',
        onClose,
        onNavigateToTask,
        parentTaskId: 'parent-1',
        flushNameUpdate: vi.fn(),
        setShowSyncWarning: vi.fn(),
      })
    );
    await act(async () => {
      expect(await result.current.handleClose()).toBe(false);
      await result.current.handleForceClose();
      await result.current.handleNavigateBack();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onNavigateToTask).not.toHaveBeenCalled();
    finishSave?.();
    await act(async () => {
      await result.current.handleClose();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('waits for description persistence verification before closing', async () => {
    localStorage.setItem('draft-key', 'Unsubmitted task draft');
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
    expect(localStorage.getItem('draft-key')).toBe('Unsubmitted task draft');
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

    let closeAccepted = true;
    await act(async () => {
      closeAccepted = await result.current.handleClose();
    });

    expect(closeAccepted).toBe(false);
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

    let closeAccepted = true;
    await act(async () => {
      closeAccepted = await result.current.handleClose();
    });

    expect(closeAccepted).toBe(false);
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
    localStorage.setItem('draft-key', 'Recoverable task draft');
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
    expect(localStorage.getItem('draft-key')).toBe('Recoverable task draft');

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
