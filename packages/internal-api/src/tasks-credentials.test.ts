import { describe, expect, it, vi } from 'vitest';
import { updateWorkspaceTask } from './tasks';

describe('workspace task credentials', () => {
  it('includes credentials when updating a task across app origins', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ task: { id: 'task-1' } }),
      ok: true,
      status: 200,
    });

    await updateWorkspaceTask(
      'ws-1',
      'task-1',
      { completed: true },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/tasks/task-1',
      expect.objectContaining({
        body: JSON.stringify({ completed: true }),
        credentials: 'include',
        method: 'PUT',
      })
    );
  });
});
