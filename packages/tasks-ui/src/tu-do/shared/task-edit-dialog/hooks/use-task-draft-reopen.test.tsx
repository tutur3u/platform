import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TaskFilters } from '../../types';
import { getDraftStorageKey, saveDraft } from '../utils';
import { useTaskFormReset } from './use-task-form-reset';
import { useTaskFormState } from './use-task-form-state';

const { getUser, getProfile } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfile: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({ auth: { getUser } }),
}));
vi.mock('@tuturuuu/internal-api', async (original) => ({
  ...(await original<typeof import('@tuturuuu/internal-api')>()),
  getCurrentUserProfile: getProfile,
}));

beforeEach(() => {
  vi.clearAllMocks();
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

it('keeps a server-backed draft separate from the board creation recovery draft', () => {
  const boardKey = getDraftStorageKey('board-1');
  const localDraft = {
    name: 'Unsubmitted local task',
    persistedTask: { id: 'local-row' },
  };
  saveDraft(boardKey, localDraft);
  const task = {
    id: 'draft-server-1',
    name: 'Server draft',
    list_id: 'list-1',
    assignees: [{ id: 'server-assignee' }],
  } as Task;
  const { result } = renderHook(() => {
    const props = {
      boardId: 'board-1',
      draftId: 'server-1',
      task,
      isOpen: true,
      isCreateMode: true,
      isSaving: false,
    };
    const form = useTaskFormState(props);
    useTaskFormReset({ ...form, ...props, filters: filtersWithAssignee });
    return form;
  });
  expect(result.current.name).toBe('Server draft');
  expect(result.current.selectedAssignees).toEqual([{ id: 'server-assignee' }]);
  act(() => {
    result.current.setName('Edited server draft');
    vi.runAllTimers();
  });
  act(() => vi.runAllTimers());
  expect(JSON.parse(localStorage.getItem(boardKey)!)).toEqual(localDraft);
  expect(
    JSON.parse(localStorage.getItem(getDraftStorageKey('board-1', 'server-1'))!)
      .name
  ).toBe('Edited server draft');
});

it.each(['recover', 'unmount'])(
  'ignores an old auto-assignment lookup after %s',
  async (mode) => {
    let resolveUser!: (value: { data: { user: { id: string } } }) => void;
    getUser.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUser = resolve;
      })
    );
    getProfile.mockResolvedValue({ id: 'me', display_name: 'Me' });
    const task = { id: 'new', name: '', list_id: 'list-1' } as Task;
    const filters = {
      ...filtersWithAssignee,
      assignees: [],
      includeMyTasks: true,
    };
    const { result, rerender, unmount } = renderHook(
      ({ isOpen }) => {
        const props = {
          boardId: 'board-1',
          task,
          isOpen,
          isCreateMode: true,
          isSaving: false,
        };
        const form = useTaskFormState(props);
        useTaskFormReset({ ...form, ...props, filters });
        return form;
      },
      { initialProps: { isOpen: true } }
    );
    expect(getUser).toHaveBeenCalledOnce();
    if (mode === 'unmount') unmount();
    else {
      rerender({ isOpen: false });
      saveDraft(getDraftStorageKey('board-1'), {
        name: 'Recovered',
        selectedAssignees: [{ id: 'recovered-assignee' }],
      });
      rerender({ isOpen: true });
    }
    await act(async () => {
      resolveUser({ data: { user: { id: 'me' } } });
    });
    expect(getProfile).not.toHaveBeenCalled();
    if (mode === 'recover')
      expect(result.current.selectedAssignees).toEqual([
        { id: 'recovered-assignee' },
      ]);
  }
);
