import { describe, expect, it, vi } from 'vitest';
import {
  assignTaskToCycle,
  listTaskCycleTasks,
  listWorkspaceTaskBacklog,
  unassignTaskFromCycle,
} from './task-cycles';

function fetchMock(body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

describe('task cycle internal API helpers', () => {
  it('assigns a task to a cycle with a JSON body', async () => {
    const fetch = fetchMock({ taskId: 'task-1', cycleId: 'cycle 1' });

    const result = await assignTaskToCycle('ws 1', 'cycle 1', 'task-1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetch as typeof globalThis.fetch,
    });

    expect(result).toEqual({ taskId: 'task-1', cycleId: 'cycle 1' });
    expect(fetch).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws%201/task-cycles/cycle%201/tasks',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ taskId: 'task-1' }),
      })
    );
  });

  it('unassigns a task with a JSON body on the cycle path', async () => {
    const fetch = fetchMock({ taskId: 'task-1', cycleId: null });

    await unassignTaskFromCycle('ws-1', 'cycle-1', 'task-1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetch as typeof globalThis.fetch,
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-cycles/cycle-1/tasks',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ taskId: 'task-1' }),
      })
    );
  });

  it("lists a cycle's tasks", async () => {
    const fetch = fetchMock({ tasks: [] });

    const result = await listTaskCycleTasks('ws-1', 'cycle-1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetch as typeof globalThis.fetch,
    });

    expect(result).toEqual({ tasks: [] });
    expect(fetch).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-cycles/cycle-1/tasks',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });

  it('lists the backlog with an optional limit', async () => {
    const fetch = fetchMock({ tasks: [] });

    const result = await listWorkspaceTaskBacklog(
      'ws-1',
      { limit: 50 },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetch as typeof globalThis.fetch,
      }
    );

    expect(result).toEqual({ tasks: [] });
    expect(fetch).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-cycles/backlog?limit=50',
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });
});
