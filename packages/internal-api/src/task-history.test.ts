import { describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceTaskSnapshot,
  revertWorkspaceTaskHistory,
} from './task-history';

function createJsonResponse(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload };
}

describe('task history internal-api helpers', () => {
  it('loads an encoded task history snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        snapshot: { id: 'task/1', name: 'Previous name' },
        historyEntry: { id: 'history/1' },
      })
    );

    await getWorkspaceTaskSnapshot('ws/1', 'task/1', 'history/1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws%2F1/tasks/task%2F1/snapshot/history%2F1',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('restores selected fields from a task history version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        success: true,
        revertedFields: ['name', 'labels'],
        task: { id: 'task/1', name: 'Previous name' },
      })
    );

    await revertWorkspaceTaskHistory(
      'ws/1',
      'task/1',
      { historyId: 'history-1', fields: ['name', 'labels'] },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws%2F1/tasks/task%2F1/revert',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          historyId: 'history-1',
          fields: ['name', 'labels'],
        }),
        cache: 'no-store',
      })
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(requestInit.headers).get('Content-Type')).toBe(
      'application/json'
    );
  });
});
