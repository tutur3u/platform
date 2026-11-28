import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireWhiteboardAccess: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock('../access', () => ({
  requireWhiteboardAccess: mocks.requireWhiteboardAccess,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

import { DELETE, PATCH } from './route';

const WS_ID = '00000000-0000-4000-8000-000000000001';
const BOARD_ID = '00000000-0000-4000-8000-000000000002';
const CREATOR_ID = '00000000-0000-4000-8000-000000000010';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000020';

function createMockAdmin(
  existingBoard: {
    id: string;
    creator_id: string | null;
    snapshot?: unknown;
  } | null
) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: existingBoard
              ? {
                  id: existingBoard.id,
                  title: 'Updated',
                  description: null,
                  snapshot: null,
                  created_at: '2026-01-01T00:00:00Z',
                  updated_at: '2026-01-01T00:00:00Z',
                  archived_at: null,
                }
              : null,
            error: null,
          }),
        }),
      }),
    }),
  });

  const deleteMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: existingBoard ? { id: existingBoard.id } : null,
            error: null,
          }),
        }),
      }),
    }),
  });

  const storageListMock = vi.fn().mockResolvedValue({ data: [], error: null });
  const storageRemoveMock = vi.fn().mockResolvedValue({ error: null });

  return {
    sbAdmin: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: existingBoard,
                error: null,
              }),
            }),
          }),
        }),
        update: updateMock,
        delete: deleteMock,
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          list: storageListMock,
          remove: storageRemoveMock,
        }),
      },
    },
    updateMock,
    deleteMock,
    storageListMock,
  };
}

describe('whiteboard [boardId] PATCH/DELETE least-privilege authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows non-creator workspace member to save snapshot-only PATCH without manage_workspace_settings', async () => {
    const { sbAdmin, updateMock } = createMockAdmin({
      id: BOARD_ID,
      creator_id: CREATOR_ID,
      snapshot: null,
    });
    mocks.requireWhiteboardAccess.mockResolvedValue({
      user: { id: OTHER_USER_ID },
      wsId: WS_ID,
      sbAdmin,
    });

    const response = await PATCH(
      new Request(
        `http://localhost/api/v1/workspaces/${WS_ID}/whiteboards/${BOARD_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot: { elements: [] } }),
        }
      ),
      { params: Promise.resolve({ wsId: WS_ID, boardId: BOARD_ID }) }
    );

    expect(response?.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('rejects PATCH with 403 when non-creator mixes snapshot with metadata mutation', async () => {
    const { sbAdmin, updateMock } = createMockAdmin({
      id: BOARD_ID,
      creator_id: CREATOR_ID,
      snapshot: null,
    });
    mocks.requireWhiteboardAccess.mockResolvedValue({
      user: { id: OTHER_USER_ID },
      wsId: WS_ID,
      sbAdmin,
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await PATCH(
      new Request(
        `http://localhost/api/v1/workspaces/${WS_ID}/whiteboards/${BOARD_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            snapshot: { elements: [] },
            title: 'Hijacked',
          }),
        }
      ),
      { params: Promise.resolve({ wsId: WS_ID, boardId: BOARD_ID }) }
    );

    expect(response?.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects PATCH with 403 when caller is neither creator nor workspace manager', async () => {
    const { sbAdmin, updateMock } = createMockAdmin({
      id: BOARD_ID,
      creator_id: CREATOR_ID,
      snapshot: null,
    });
    mocks.requireWhiteboardAccess.mockResolvedValue({
      user: { id: OTHER_USER_ID },
      wsId: WS_ID,
      sbAdmin,
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await PATCH(
      new Request(
        `http://localhost/api/v1/workspaces/${WS_ID}/whiteboards/${BOARD_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Hijacked' }),
        }
      ),
      { params: Promise.resolve({ wsId: WS_ID, boardId: BOARD_ID }) }
    );

    expect(response?.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('allows PATCH when caller is the board creator', async () => {
    const { sbAdmin, updateMock } = createMockAdmin({
      id: BOARD_ID,
      creator_id: CREATOR_ID,
      snapshot: null,
    });
    mocks.requireWhiteboardAccess.mockResolvedValue({
      user: { id: CREATOR_ID },
      wsId: WS_ID,
      sbAdmin,
    });

    const response = await PATCH(
      new Request(
        `http://localhost/api/v1/workspaces/${WS_ID}/whiteboards/${BOARD_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Renamed' }),
        }
      ),
      { params: Promise.resolve({ wsId: WS_ID, boardId: BOARD_ID }) }
    );

    expect(response?.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('allows PATCH when non-creator holds manage_workspace_settings', async () => {
    const { sbAdmin, updateMock } = createMockAdmin({
      id: BOARD_ID,
      creator_id: CREATOR_ID,
      snapshot: null,
    });
    mocks.requireWhiteboardAccess.mockResolvedValue({
      user: { id: OTHER_USER_ID },
      wsId: WS_ID,
      sbAdmin,
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (perm: string) =>
        perm === 'manage_workspace_settings',
    });

    const response = await PATCH(
      new Request(
        `http://localhost/api/v1/workspaces/${WS_ID}/whiteboards/${BOARD_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Admin Rename' }),
        }
      ),
      { params: Promise.resolve({ wsId: WS_ID, boardId: BOARD_ID }) }
    );

    expect(response?.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('rejects DELETE with 403 before touching storage when caller is neither creator nor manager', async () => {
    const { sbAdmin, deleteMock, storageListMock } = createMockAdmin({
      id: BOARD_ID,
      creator_id: CREATOR_ID,
    });
    mocks.requireWhiteboardAccess.mockResolvedValue({
      user: { id: OTHER_USER_ID },
      wsId: WS_ID,
      sbAdmin,
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await DELETE(
      new Request(
        `http://localhost/api/v1/workspaces/${WS_ID}/whiteboards/${BOARD_ID}`,
        {
          method: 'DELETE',
        }
      ),
      { params: Promise.resolve({ wsId: WS_ID, boardId: BOARD_ID }) }
    );

    expect(response?.status).toBe(403);
    expect(storageListMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('allows DELETE when non-creator holds manage_workspace_settings', async () => {
    const { sbAdmin, deleteMock } = createMockAdmin({
      id: BOARD_ID,
      creator_id: CREATOR_ID,
    });
    mocks.requireWhiteboardAccess.mockResolvedValue({
      user: { id: OTHER_USER_ID },
      wsId: WS_ID,
      sbAdmin,
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (perm: string) =>
        perm === 'manage_workspace_settings',
    });

    const response = await DELETE(
      new Request(
        `http://localhost/api/v1/workspaces/${WS_ID}/whiteboards/${BOARD_ID}`,
        {
          method: 'DELETE',
        }
      ),
      { params: Promise.resolve({ wsId: WS_ID, boardId: BOARD_ID }) }
    );

    expect(response?.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });
});
