import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBoardAccessMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('./access', () => ({
  requireBoardAccess: (...args: Parameters<typeof requireBoardAccessMock>) =>
    requireBoardAccessMock(...args),
}));

import { POST } from './route';

describe('task board lists route POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireBoardAccessMock.mockResolvedValue({
      sbAdmin: {
        rpc: rpcMock,
      },
      boardId: 'board-1',
    });
  });

  it('creates a closed list even when another closed list already exists', async () => {
    rpcMock.mockResolvedValue({
      data: {
        id: 'list-2',
        board_id: 'board-1',
        name: 'Not Planned',
        status: 'closed',
        color: 'PURPLE',
        position: 4,
        archived: false,
      },
      error: null,
    });

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/board-1/lists',
        {
          method: 'POST',
          body: JSON.stringify({
            name: 'Not Planned',
            status: 'closed',
            color: 'PURPLE',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: 'board-1',
        }),
      }
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error('Expected POST to return a response');
    }

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      list: {
        id: 'list-2',
        board_id: 'board-1',
        name: 'Not Planned',
        status: 'closed',
        color: 'PURPLE',
        position: 4,
        archived: false,
      },
    });
    expect(rpcMock).toHaveBeenCalledWith(
      'create_task_list_with_next_position',
      {
        p_board_id: 'board-1',
        p_name: 'Not Planned',
        p_status: 'closed',
        p_color: 'PURPLE',
      }
    );
  });

  it('returns the backend error message instead of a generic create failure', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message: 'Only one closed list is allowed per board',
      },
    });

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/board-1/lists',
        {
          method: 'POST',
          body: JSON.stringify({
            name: 'Abandoned',
            status: 'closed',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: 'board-1',
        }),
      }
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error('Expected POST to return a response');
    }

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Only one closed list is allowed per board',
    });
  });
});
