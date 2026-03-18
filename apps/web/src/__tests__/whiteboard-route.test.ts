import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const existingMaybeSingle = vi.fn();
  const updatedMaybeSingle = vi.fn();
  const deletedMaybeSingle = vi.fn();
  const list = vi.fn();
  const remove = vi.fn();

  const workspaceWhiteboardsTable = {
    select: vi.fn((query: string) => {
      if (query === 'id, snapshot') {
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: existingMaybeSingle,
            }),
          }),
        };
      }

      if (query === 'id') {
        return {
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: existingMaybeSingle,
            }),
          }),
        };
      }

      return {
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: updatedMaybeSingle,
          }),
        }),
      };
    }),
    update: vi.fn(() => ({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: updatedMaybeSingle,
          }),
        }),
      }),
    })),
    delete: vi.fn(() => ({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            maybeSingle: deletedMaybeSingle,
          }),
        }),
      }),
    })),
  };

  const sbAdmin = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_whiteboards') {
        return workspaceWhiteboardsTable;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    storage: {
      from: vi.fn(() => ({
        list,
        remove,
      })),
    },
  };

  return {
    deletedMaybeSingle,
    existingMaybeSingle,
    list,
    remove,
    requireWhiteboardAccess: vi.fn(),
    sbAdmin,
    updatedMaybeSingle,
  };
});

vi.mock('@/app/api/v1/workspaces/[wsId]/whiteboards/access', () => ({
  requireWhiteboardAccess: (
    ...args: Parameters<typeof mocks.requireWhiteboardAccess>
  ) => mocks.requireWhiteboardAccess(...args),
}));

describe('whiteboard route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireWhiteboardAccess.mockResolvedValue({
      sbAdmin: mocks.sbAdmin,
      user: { id: 'user-1' },
      wsId: 'ws-1',
    });
    mocks.remove.mockResolvedValue({ data: [], error: null });
  });

  it('deletes removed whiteboard image files from storage after a successful save', async () => {
    mocks.existingMaybeSingle.mockResolvedValue({
      data: {
        id: 'board-1',
        snapshot: {
          elements: [
            {
              id: 'img-1',
              type: 'image',
              fileId:
                'ws-1/whiteboards/11111111-1111-4111-8111-111111111111/old.png',
            },
            {
              id: 'img-2',
              type: 'image',
              fileId:
                'ws-1/whiteboards/11111111-1111-4111-8111-111111111111/keep.png',
            },
          ],
        },
      },
      error: null,
    });
    mocks.updatedMaybeSingle.mockResolvedValue({
      data: {
        id: 'board-1',
        snapshot: {
          elements: [
            {
              id: 'img-2',
              type: 'image',
              fileId:
                'ws-1/whiteboards/11111111-1111-4111-8111-111111111111/keep.png',
            },
          ],
        },
      },
      error: null,
    });

    const { PATCH } = await import(
      '@/app/api/v1/workspaces/[wsId]/whiteboards/[boardId]/route'
    );

    const response = await PATCH(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/whiteboards/11111111-1111-4111-8111-111111111111',
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            snapshot: {
              elements: [
                {
                  id: 'img-2',
                  type: 'image',
                  fileId:
                    'ws-1/whiteboards/11111111-1111-4111-8111-111111111111/keep.png',
                },
              ],
            },
          }),
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '11111111-1111-4111-8111-111111111111',
        }),
      }
    );

    if (!response) {
      throw new Error('PATCH handler did not return a response');
    }

    expect(response.status).toBe(200);
    expect(mocks.sbAdmin.storage.from).toHaveBeenCalledWith('workspaces');
    expect(mocks.remove).toHaveBeenCalledWith([
      'ws-1/whiteboards/11111111-1111-4111-8111-111111111111/old.png',
    ]);
  });

  it('deletes whiteboard storage files before removing the whiteboard record', async () => {
    mocks.existingMaybeSingle.mockResolvedValue({
      data: { id: 'board-1' },
      error: null,
    });
    mocks.list
      .mockResolvedValueOnce({
        data: [
          {
            id: 'file-1',
            name: 'first.png',
          },
          {
            id: 'file-2',
            name: 'second.png',
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [],
        error: null,
      });
    mocks.deletedMaybeSingle.mockResolvedValue({
      data: { id: 'board-1' },
      error: null,
    });

    const { DELETE } = await import(
      '@/app/api/v1/workspaces/[wsId]/whiteboards/[boardId]/route'
    );

    const response = await DELETE(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/whiteboards/11111111-1111-4111-8111-111111111111',
        { method: 'DELETE' }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '11111111-1111-4111-8111-111111111111',
        }),
      }
    );

    if (!response) {
      throw new Error('DELETE handler did not return a response');
    }

    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(
      'ws-1/whiteboards/11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        limit: 1000,
      })
    );
    expect(mocks.remove).toHaveBeenCalledWith([
      'ws-1/whiteboards/11111111-1111-4111-8111-111111111111/first.png',
      'ws-1/whiteboards/11111111-1111-4111-8111-111111111111/second.png',
    ]);
  });
});
