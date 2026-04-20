import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireBoardAccessMock = vi.fn();
const maybeSingleCurrentListMock = vi.fn();
const selectCurrentListMock = vi.fn();
const maybeSingleUpdatedListMock = vi.fn();
const selectUpdatedListMock = vi.fn();
const eqUpdatedBoardMock = vi.fn();
const eqUpdatedIdMock = vi.fn();
const updateMock = vi.fn();
const fromMock = vi.fn();

vi.mock('../access', () => ({
  requireBoardAccess: (...args: Parameters<typeof requireBoardAccessMock>) =>
    requireBoardAccessMock(...args),
}));

import { PATCH } from './route';

describe('task board lists/[listId] route PATCH', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    maybeSingleCurrentListMock.mockResolvedValue({
      data: {
        status: 'active',
        deleted: false,
      },
      error: null,
    });

    selectCurrentListMock.mockImplementation(() => ({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: maybeSingleCurrentListMock,
        }),
      }),
    }));

    maybeSingleUpdatedListMock.mockResolvedValue({
      data: {
        id: 'list-1',
        board_id: 'board-1',
        name: 'Abandoned',
        status: 'closed',
        color: 'PURPLE',
        position: 4,
        archived: false,
        deleted: false,
      },
      error: null,
    });

    selectUpdatedListMock.mockReturnValue({
      maybeSingle: maybeSingleUpdatedListMock,
    });
    eqUpdatedBoardMock.mockReturnValue({
      select: selectUpdatedListMock,
    });
    eqUpdatedIdMock.mockReturnValue({
      eq: eqUpdatedBoardMock,
    });
    updateMock.mockReturnValue({
      eq: eqUpdatedIdMock,
    });

    fromMock.mockImplementation((table: string) => {
      if (table !== 'task_lists') {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: selectCurrentListMock,
        update: updateMock,
      };
    });

    requireBoardAccessMock.mockResolvedValue({
      supabase: {
        from: fromMock,
      },
      boardId: 'board-1',
      listId: 'list-1',
    });
  });

  it('allows moving a list to closed without checking for another closed list', async () => {
    const response = await PATCH(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/board-1/lists/list-1',
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'closed',
            color: 'PURPLE',
            name: 'Abandoned',
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
          listId: 'list-1',
        }),
      }
    );

    expect(response).toBeDefined();
    if (!response) {
      throw new Error('Expected PATCH to return a response');
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      list: {
        id: 'list-1',
        board_id: 'board-1',
        name: 'Abandoned',
        status: 'closed',
        color: 'PURPLE',
        position: 4,
        archived: false,
        deleted: false,
      },
    });
    expect(selectCurrentListMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith({
      name: 'Abandoned',
      status: 'closed',
      color: 'PURPLE',
    });
  });
});
