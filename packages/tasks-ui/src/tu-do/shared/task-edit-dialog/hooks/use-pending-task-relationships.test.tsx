import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { getSeededPendingTaskRelationships } from '../types/pending-relationship';
import { getDraftStorageKey, saveDraft } from '../utils';
import { usePendingTaskRelationships } from './use-pending-task-relationships';

beforeEach(() => localStorage.clear());

it('reloads relationships across editing sessions while preserving changes during rerenders', () => {
  const seed = getSeededPendingTaskRelationships({ parentTaskId: 'parent-1' });
  const props = {
    boardId: 'board-1',
    wsId: 'ws-1',
    isCreateMode: false,
    isOpen: true,
    seededRelationships: seed,
  };
  const { result, rerender } = renderHook(usePendingTaskRelationships, {
    initialProps: props,
  });
  expect(result.current.pendingParent).toBeNull();
  const draft = getSeededPendingTaskRelationships({
    parentTaskId: 'draft-parent',
  });
  saveDraft(getDraftStorageKey('board-1'), { pendingTaskRelationships: draft });
  rerender({ ...props, isCreateMode: true });
  expect(result.current.pendingParent?.id).toBe('draft-parent');
  act(() =>
    result.current.setPendingParent({ id: 'edited-parent', name: 'Edited' })
  );
  rerender({ ...props, isCreateMode: true, seededRelationships: { ...seed } });
  expect(result.current.pendingParent?.id).toBe('edited-parent');
  rerender({ ...props, isCreateMode: true, isOpen: false });
  localStorage.clear();
  rerender({ ...props, isCreateMode: true });
  expect(result.current.pendingParent?.id).toBe('parent-1');
  rerender({
    ...props,
    isCreateMode: true,
    boardId: 'board-2',
    seededRelationships: getSeededPendingTaskRelationships({}),
  });
  expect(result.current.pendingParent).toBeNull();
  expect(result.current.pendingChildren).toEqual([]);
});

it('does not inherit a board recovery relationship when opening a saved draft', () => {
  saveDraft(getDraftStorageKey('board-1'), {
    pendingTaskRelationships: getSeededPendingTaskRelationships({
      parentTaskId: 'other-local-parent',
    }),
  });
  const { result } = renderHook(() =>
    usePendingTaskRelationships({
      boardId: 'board-1',
      wsId: 'ws-1',
      draftId: 'saved-draft',
      isCreateMode: true,
      isOpen: true,
    })
  );
  expect(result.current.pendingParent).toBeNull();
});
