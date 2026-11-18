import { describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceTaskDescription,
  updateWorkspaceTask,
  updateWorkspaceTaskDescription,
} from './tasks';

describe('workspace task credentials', () => {
  it('includes credentials on cross-origin description reads and saves', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ description: 'A task', description_yjs_state: null })
      );
    const options = {
      baseUrl: 'https://tasks.tuturuuu.com',
      fetch: fetchMock,
    };
    const descriptionUrl =
      'https://tasks.tuturuuu.com/api/v1/workspaces/ws-1/tasks/task-1/description';

    await getWorkspaceTaskDescription('ws-1', 'task-1', options);
    await updateWorkspaceTaskDescription(
      'ws-1',
      'task-1',
      { description: 'A task' },
      options
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      descriptionUrl,
      expect.objectContaining({ credentials: 'include', cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      descriptionUrl,
      expect.objectContaining({ credentials: 'include', method: 'PATCH' })
    );
  });

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
