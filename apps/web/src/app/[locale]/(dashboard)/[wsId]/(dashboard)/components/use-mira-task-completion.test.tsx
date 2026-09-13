import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMiraTaskCompletion } from './use-mira-task-completion';

const api = vi.hoisted(() => ({
  listWorkspaceTaskLists: vi.fn(),
  updateWorkspaceTask: vi.fn(),
  upsertCurrentUserTaskPersonalPlacement: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/tasks', () => api);
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
const row = {
  id: 'task',
  title: 'Renew',
  taskWorkspaceId: 'source',
  taskBoardId: 'board',
};
function setup() {
  const client = new QueryClient();
  client.setQueryData(['mira-artifact', 'personal', 'tasks'], [row]);
  client.setQueryData(['tasks', 'board'], [row, { id: 'other' }]);
  const hook = renderHook(useMiraTaskCompletion, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, client };
}
beforeEach(() => {
  vi.resetAllMocks();
  api.listWorkspaceTaskLists.mockResolvedValue({
    lists: [{ id: 'done', status: 'done' }],
  });
  api.updateWorkspaceTask.mockResolvedValue({});
});
describe('artifact task completion', () => {
  it('moves the source task to Done without replacing the accumulated board cache', async () => {
    const { result, client } = setup();
    await act(() => result.current.complete(row));
    expect(api.listWorkspaceTaskLists).toHaveBeenCalledWith('source', 'board');
    expect(api.updateWorkspaceTask).toHaveBeenCalledWith('source', 'task', {
      list_id: 'done',
    });
    expect(client.getQueryData(['mira-artifact', 'personal', 'tasks'])).toEqual(
      []
    );
    expect(client.getQueryData(['tasks', 'board'])).toEqual([
      row,
      { id: 'other' },
    ]);
  });
  it('completes personal placement without changing a shared source board', async () => {
    const { result } = setup();
    await act(() =>
      result.current.complete({
        ...row,
        personalBoardId: 'personal-board',
        personalListId: 'personal-list',
      })
    );
    expect(api.upsertCurrentUserTaskPersonalPlacement).toHaveBeenCalledWith(
      'task',
      {
        personal_board_id: 'personal-board',
        personal_list_id: 'personal-list',
        terminal_status: 'done',
      }
    );
    expect(api.updateWorkspaceTask).not.toHaveBeenCalled();
    expect(api.listWorkspaceTaskLists).not.toHaveBeenCalled();
  });
  it('retains the card when saving fails or the board has no Done list', async () => {
    const { result, client } = setup();
    api.updateWorkspaceTask.mockRejectedValueOnce(new Error('denied'));
    await act(() => result.current.complete(row));
    expect(client.getQueryData(['mira-artifact', 'personal', 'tasks'])).toEqual(
      [row]
    );
    api.listWorkspaceTaskLists.mockResolvedValueOnce({ lists: [] });
    await act(() => result.current.complete(row));
    expect(api.updateWorkspaceTask).toHaveBeenCalledTimes(1);
    expect(result.current.pendingIds.size).toBe(0);
  });
  it('ignores duplicate completion while the first write is pending', async () => {
    let finish!: () => void;
    api.updateWorkspaceTask.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const { result } = setup();
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.complete(row);
    });
    await act(() => result.current.complete(row));
    expect(api.updateWorkspaceTask).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.pendingIds.size).toBe(0);
  });
});
