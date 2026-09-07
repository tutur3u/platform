import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TaskFilters } from '../../types';
import { getDraftStorageKey, saveDraft } from '../utils';
import { useTaskFormReset } from './use-task-form-reset';
import { useTaskFormState } from './use-task-form-state';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

const filtersWithAssignee: TaskFilters = {
  labels: [],
  assignees: [{ id: 'filter-assignee', display_name: null }],
  projects: [],
  priorities: [],
  dueDateRange: null,
  estimationRange: null,
  includeMyTasks: false,
  includeUnassigned: false,
  sourceScope: 'all_visible',
  sourceWorkspaceIds: [],
  sourceBoardIds: [],
};

it.each([undefined, filtersWithAssignee])(
  'retains a recovered draft when the real dialog reset hook also mounts with filters %j',
  (filters) => {
    const task = { id: 'new', name: '', list_id: 'default-list' } as Task;
    const draft = {
      name: 'Recover this task',
      selectedListId: 'saved-list',
      selectedAssignees: [{ id: 'saved-assignee' }],
      selectedProjects: [{ id: 'saved-project', name: 'Saved project' }],
      persistedTask: { id: 'confirmed-row' },
      persistedWorkspaceId: 'ws-1',
    };
    const key = getDraftStorageKey('board-1');
    saveDraft(key, draft);
    const { result } = renderHook(() => {
      const form = useTaskFormState({
        task,
        boardId: 'board-1',
        isOpen: true,
        isCreateMode: true,
        isSaving: false,
      });
      useTaskFormReset({
        ...form,
        boardId: 'board-1',
        filters,
        task,
        isOpen: true,
        isCreateMode: true,
      });
      return form;
    });
    act(() => vi.runAllTimers());
    expect(result.current.name).toBe(draft.name);
    expect(result.current.selectedListId).toBe(draft.selectedListId);
    expect(result.current.selectedAssignees).toEqual(draft.selectedAssignees);
    expect(result.current.selectedProjects).toEqual(draft.selectedProjects);
    expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject(draft);
  }
);
