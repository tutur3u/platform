import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const order = vi.fn();
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const sbAdmin = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_whiteboards') return { select };
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    eq,
    order,
    requireWhiteboardAccess: vi.fn(),
    resolveCoMemberNames: vi.fn(),
    sbAdmin,
    select,
  };
});

vi.mock('@/legacy-api-routes/v1/workspaces/[wsId]/whiteboards/access', () => ({
  requireWhiteboardAccess: (
    ...args: Parameters<typeof mocks.requireWhiteboardAccess>
  ) => mocks.requireWhiteboardAccess(...args),
}));

vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: (
    ...args: Parameters<typeof mocks.resolveCoMemberNames>
  ) => mocks.resolveCoMemberNames(...args),
}));

const WS_UUID = '22222222-2222-4222-8222-222222222222';
// The route param is a slug; the access helper resolves it to the workspace id.
const context = { params: Promise.resolve({ wsId: 'personal' }) };
async function list() {
  const { GET } =
    await import('@/legacy-api-routes/v1/workspaces/[wsId]/whiteboards/route');
  const response = await GET(request(), context);
  if (!response) throw new Error('The list route returned no response');
  return response;
}
const request = () =>
  new Request('http://localhost/api/v1/workspaces/ws-1/whiteboards');

describe('whiteboards list route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireWhiteboardAccess.mockResolvedValue({
      sbAdmin: mocks.sbAdmin,
      user: { id: 'viewer-1' },
      wsId: WS_UUID,
    });
    mocks.resolveCoMemberNames.mockResolvedValue(new Map());
  });

  it('lists the workspace boards newest first with creator names, never an email field', async () => {
    mocks.order.mockResolvedValue({
      data: [
        {
          id: 'board-1',
          title: 'Roadmap',
          description: null,
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-02T00:00:00.000Z',
          archived_at: null,
          creator_id: 'user-2',
          creator: { display_name: null, handle: 'ada' },
        },
        {
          id: 'board-2',
          title: 'Retro',
          description: 'Sprint 4',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-02T00:00:00.000Z',
          archived_at: '2026-10-03T00:00:00.000Z',
          creator_id: 'user-3',
          creator: null,
        },
      ],
      error: null,
    });
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([['user-2', 'Ada Lovelace']])
    );

    const response = await list();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireWhiteboardAccess).toHaveBeenCalledWith(
      expect.any(Request),
      'personal'
    );
    expect(mocks.eq).toHaveBeenCalledWith('ws_id', WS_UUID);
    expect(mocks.order).toHaveBeenCalledWith('updated_at', {
      ascending: false,
    });
    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith(
      expect.objectContaining({ viewerUserId: 'viewer-1', wsId: WS_UUID })
    );
    expect(body.whiteboards).toEqual([
      expect.objectContaining({
        id: 'board-1',
        creator_name: 'Ada Lovelace',
      }),
      expect.objectContaining({
        id: 'board-2',
        archived_at: '2026-10-03T00:00:00.000Z',
        creator_name: null,
      }),
    ]);
    for (const board of body.whiteboards) {
      expect(board).not.toHaveProperty('creator_id');
      expect(board).not.toHaveProperty('creator');
      expect(board).not.toHaveProperty('snapshot');
    }
  });

  it('returns the access error for a signed-out or non-member caller', async () => {
    mocks.requireWhiteboardAccess.mockResolvedValue({
      error: Response.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });

    const response = await list();

    expect(response.status).toBe(403);
    expect(mocks.sbAdmin.from).not.toHaveBeenCalled();
  });

  it('answers a database failure without leaking details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.order.mockResolvedValue({
      data: null,
      error: { message: 'relation exploded' },
    });

    const response = await list();

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('exploded');
  });
});
