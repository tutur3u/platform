import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDraftStorageKey } from '../utils';
import { useTaskFormState } from './use-task-form-state';

describe('task draft recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('restores content and recovery metadata without clearing it during hydration or editing another task', () => {
    const key = getDraftStorageKey('board-1');
    const draft = {
      name: 'Unsaved task',
      description: { type: 'doc', content: [] },
      selectedListId: 'list-1',
      selectedAssignees: [{ id: 'user-1' }],
      selectedProjects: [{ id: 'project-1' }],
      persistedTask: { id: 'saved-row' },
      persistedWorkspaceId: 'ws-1',
    };
    localStorage.setItem(key, JSON.stringify(draft));
    const { result, rerender } = renderHook(
      ({ isCreateMode }) =>
        useTaskFormState({
          boardId: 'board-1',
          isOpen: true,
          isCreateMode,
          isSaving: false,
        }),
      { initialProps: { isCreateMode: true } }
    );
    expect(result.current.name).toBe('Unsaved task');
    expect(result.current.selectedAssignees).toEqual(draft.selectedAssignees);
    expect(result.current.selectedProjects).toEqual(draft.selectedProjects);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(draft);
    act(() => vi.runAllTimers());
    expect(JSON.parse(localStorage.getItem(key)!).persistedTask.id).toBe(
      'saved-row'
    );
    rerender({ isCreateMode: false });
    expect(JSON.parse(localStorage.getItem(key)!).name).toBe('Unsaved task');
  });
});
