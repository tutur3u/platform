import { describe, expect, it, vi } from 'vitest';
import {
  createWorkspaceTaskBoard,
  deleteWorkspaceTaskBoard,
  getWorkspaceBoardsData,
  getWorkspaceTaskBoard,
  listWorkspaceBoardsWithLists,
  listWorkspaceLabels,
  listWorkspaceTaskBoards,
  updateWorkspaceTaskBoard,
} from './tasks';

function createJsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

describe('workspace board internal-api helpers', () => {
  it('lists workspace task boards with query params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ boards: [], count: 0 }));

    await listWorkspaceTaskBoards(
      'ws-1',
      { q: 'alpha', page: 2, pageSize: 25 },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards?q=alpha&page=2&pageSize=25',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('creates workspace task board via POST JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        board: { id: 'board-1', ws_id: 'ws-1', name: 'Board 1' },
      })
    );

    await createWorkspaceTaskBoard(
      'ws-1',
      { name: 'Board 1', template_id: 'template-1' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Board 1', template_id: 'template-1' }),
        cache: 'no-store',
      })
    );
  });

  it('updates and deletes workspace task board via board endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }))
      .mockResolvedValueOnce(createJsonResponse({ message: 'success' }));

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await updateWorkspaceTaskBoard(
      'ws-1',
      'board-1',
      { name: 'Renamed', ticket_prefix: 'ABC' },
      options
    );

    await deleteWorkspaceTaskBoard('ws-1', 'board-1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Renamed', ticket_prefix: 'ABC' }),
      })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1',
      expect.objectContaining({
        method: 'DELETE',
        cache: 'no-store',
      })
    );
  });

  it('fetches board data endpoints for board list/details', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ data: [], count: 0 }))
      .mockResolvedValueOnce(createJsonResponse({ boards: [] }))
      .mockResolvedValueOnce(
        createJsonResponse({
          board: { id: 'board-1', ws_id: 'ws-1', name: 'Board 1' },
        })
      );

    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await getWorkspaceBoardsData(
      'ws-1',
      { q: 'x', page: 1, pageSize: 10 },
      options
    );
    await listWorkspaceBoardsWithLists('ws-1', options);
    await getWorkspaceTaskBoard('ws-1', 'board-1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/boards-data?q=x&page=1&pageSize=10',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/boards-with-lists',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/ws-1/task-boards/board-1',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('lists workspace labels through the backend labels route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse([
        {
          id: 'label-1',
          ws_id: 'internal',
          name: 'Bug',
          color: 'red',
          created_at: '2026-03-20T00:00:00.000Z',
        },
      ])
    );

    await listWorkspaceLabels('internal', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/internal/labels',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });
});
