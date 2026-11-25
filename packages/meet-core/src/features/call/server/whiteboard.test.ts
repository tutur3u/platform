import { verifyRealtimePayload } from '@tuturuuu/realtime/core/token';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fx = vi.hoisted(() => ({
  room: vi.fn(),
  rpc: vi.fn(),
  perm: vi.fn(),
  links: [] as Record<string, unknown>[],
  boards: [] as Record<string, unknown>[],
  inserted: [] as unknown[],
  deleted: [] as unknown[],
  insertError: null as null | { message: string },
}));
vi.mock('server-only', () => ({}));
vi.mock('./room-service', () => ({ callRoomService: fx.room }));
vi.mock('./guest-whiteboard-limiter', () => ({
  meetGuestWhiteboardLimiter: async () => null,
}));
vi.mock('./documents', () => ({
  channelEndpoint: () => new URL('wss://rt.example.invalid/channels'),
}));
vi.mock('../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/utils/account-benefits-server', () => ({
  AccountServiceError: class extends Error {
    constructor(public status: number) {
      super('x');
    }
  },
  accountPrivateRpc: fx.rpc,
}));
vi.mock('@tuturuuu/supabase/next/server', () => {
  const chain = (rows: () => unknown) => {
    const c: any = {
      select: () => c,
      eq: () => c,
      is: () => c,
      in: () => c,
      order: () => c,
      limit: () => c,
      insert: (value: unknown) => {
        fx.inserted.push(value);
        return c;
      },
      delete: () => ({
        eq: async (_k: string, v: unknown) => fx.deleted.push(v),
      }),
      single: async () => ({
        data: fx.insertError ? null : { id: 'new-board' },
        error: fx.insertError,
      }),
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: rows(), error: null }),
    };
    return c;
  };
  const db: any = {
    from: () => chain(() => fx.boards),
    rpc: fx.perm,
    schema: () => ({ from: () => chain(() => fx.links) }),
  };
  return { createAdminClient: async () => db };
});

const mod = await import('./whiteboard');
const limits = await import('../lib/guest-whiteboard-limit');
const meetingId = '11111111-2222-4333-8444-555555555555';
const wsId = '22222222-3333-4444-8555-666666666666';
const b1 = '33333333-4444-4555-8666-777777777777';
const member = (over: object = {}) =>
  ({
    user: { id: 'actor' },
    meeting: { id: meetingId, ws_id: wsId },
    canReadWorkspace: true,
    isHost: true,
    displayName: 'Ada',
    ...over,
  }) as never;
const guest = () =>
  ({
    guest: true,
    user: { id: 'guest-1' },
    meeting: { id: meetingId, ws_id: wsId },
    canReadWorkspace: false,
    isHost: false,
    displayName: 'Gus',
  }) as never;

beforeEach(() => {
  process.env.MEET_REALTIME_TOKEN_SECRET = 'disposable-test-secret';
  process.env.MEET_GUEST_WHITEBOARD = 'true';
  limits.resetMeetGuestWhiteboardLimiter();
  fx.room.mockReset().mockResolvedValue({});
  fx.rpc.mockReset();
  fx.perm.mockReset().mockResolvedValue({ data: false, error: null });
  fx.links = [{ whiteboard_id: b1, ws_id: wsId, guest_access: 'view' }];
  fx.boards = [{ id: b1, title: 'Plan', archived_at: null, updated_at: 't' }];
  fx.inserted = [];
  fx.deleted = [];
  fx.insertError = null;
});

describe('join', () => {
  it('mints a ticket for a live member with edit rights', async () => {
    const result = await mod.joinMeetingWhiteboard(member(), b1);
    const ticket = verifyRealtimePayload(
      result.token,
      'disposable-test-secret'
    ) as Record<string, unknown>;
    expect(ticket).toMatchObject({
      kind: 'join',
      meetingId,
      wsId,
      boardId: b1,
      actorKind: 'member',
      userId: 'actor',
      role: 'edit',
    });
    expect(result.endpoint).toBe('wss://rt.example.invalid/whiteboard');
    expect(fx.room).toHaveBeenCalledWith(expect.anything(), {
      action: 'programming.read',
    });
  });

  it('caps a guest at the link access and never trusts the body', async () => {
    const view = await mod.joinMeetingWhiteboard(guest(), b1);
    expect(view.role).toBe('view');
    fx.links[0]!.guest_access = 'draw';
    expect((await mod.joinMeetingWhiteboard(guest(), b1)).role).toBe('edit');
    fx.links[0]!.guest_access = 'none';
    await expect(mod.joinMeetingWhiteboard(guest(), b1)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('treats a signed-in non-member as a guest', async () => {
    fx.links[0]!.guest_access = 'view';
    const result = await mod.joinMeetingWhiteboard(
      member({ canReadWorkspace: false, isHost: false }),
      b1
    );
    expect(result.role).toBe('view');
    const ticket = verifyRealtimePayload(
      result.token,
      'disposable-test-secret'
    ) as Record<string, unknown>;
    expect(ticket.actorKind).toBe('guest');
  });

  it('refuses an unlinked, archived or missing board', async () => {
    fx.links = [];
    await expect(mod.joinMeetingWhiteboard(member(), b1)).rejects.toMatchObject(
      {
        status: 404,
      }
    );
    fx.links = [{ whiteboard_id: b1, ws_id: wsId, guest_access: 'view' }];
    fx.boards[0]!.archived_at = 'now';
    await expect(mod.joinMeetingWhiteboard(member(), b1)).rejects.toMatchObject(
      {
        status: 404,
      }
    );
    fx.boards = [];
    await expect(mod.joinMeetingWhiteboard(member(), b1)).rejects.toMatchObject(
      {
        status: 404,
      }
    );
  });

  it('stops at the room when admission is refused', async () => {
    fx.room.mockRejectedValue(Object.assign(new Error('no'), { status: 403 }));
    await expect(mod.joinMeetingWhiteboard(member(), b1)).rejects.toMatchObject(
      {
        status: 403,
      }
    );
  });
});

describe('anonymous guests', () => {
  it('refuses every board read while the guest whiteboard is off', async () => {
    for (const value of [undefined, 'false', '1', 'TRUE']) {
      if (value === undefined) delete process.env.MEET_GUEST_WHITEBOARD;
      else process.env.MEET_GUEST_WHITEBOARD = value;
      await expect(
        mod.joinMeetingWhiteboard(guest(), b1)
      ).rejects.toMatchObject({ status: 403 });
      await expect(mod.listMeetingWhiteboards(guest())).rejects.toMatchObject({
        status: 403,
      });
    }
    expect(fx.room).not.toHaveBeenCalled();
    // Signed-in people are not behind the switch.
    expect(
      (
        await mod.joinMeetingWhiteboard(
          member({ canReadWorkspace: false, isHost: false }),
          b1
        )
      ).role
    ).toBe('view');
  });

  it('needs a guest connected to the room for every read', async () => {
    await mod.joinMeetingWhiteboard(guest(), b1);
    await mod.listMeetingWhiteboards(guest());
    expect(fx.room.mock.calls.map((call) => call[1])).toEqual([
      { action: 'board.access' },
      { action: 'board.access' },
    ]);
  });

  it('ends access when the guest leaves or is removed', async () => {
    const first = await mod.joinMeetingWhiteboard(guest(), b1);
    expect(first.refreshSeconds).toBe(30);
    const ticket = verifyRealtimePayload(
      first.token,
      'disposable-test-secret'
    ) as { exp: number };
    expect(ticket.exp * 1000 - Date.now()).toBeLessThanOrEqual(60_000);
    // The room refuses a guest who is no longer connected, so no renewal.
    fx.room.mockRejectedValue(Object.assign(new Error('no'), { status: 403 }));
    await expect(mod.joinMeetingWhiteboard(guest(), b1)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('limits a guest to 30 board calls a minute in one meeting', async () => {
    for (let call = 0; call < 30; call++)
      await mod.listMeetingWhiteboards(guest());
    await expect(mod.joinMeetingWhiteboard(guest(), b1)).rejects.toMatchObject({
      status: 429,
    });
    expect(fx.room).toHaveBeenCalledTimes(30);
    // Members are not charged.
    await expect(mod.joinMeetingWhiteboard(member(), b1)).resolves.toBeTruthy();
  });

  it('names a guest on the board by a per-board id, never the user id', async () => {
    const result = await mod.joinMeetingWhiteboard(guest(), b1);
    expect(result.user.id).not.toBe('guest-1');
    expect(result.user.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await mod.joinMeetingWhiteboard(guest(), b1)).user.id).toBe(
      result.user.id
    );
    const ticket = verifyRealtimePayload(
      result.token,
      'disposable-test-secret'
    ) as { userId: string };
    // The signed ticket still carries the user id for the room to check.
    expect(ticket.userId).toBe('guest-1');
  });

  it('ends access when the board leaves the meeting', async () => {
    fx.links = [];
    await expect(mod.joinMeetingWhiteboard(guest(), b1)).rejects.toMatchObject({
      status: 404,
    });
    expect((await mod.listMeetingWhiteboards(guest())).links).toEqual([]);
  });

  it('never reaches a board linked to another meeting or workspace', async () => {
    const other = '44444444-5555-4666-8777-888888888888';
    await expect(
      mod.joinMeetingWhiteboard(guest(), other)
    ).rejects.toMatchObject({ status: 404 });
    fx.links = [
      { whiteboard_id: b1, ws_id: 'another-workspace', guest_access: 'draw' },
    ];
    await expect(mod.joinMeetingWhiteboard(guest(), b1)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('list', () => {
  it('shows managers every link and the boards they can add', async () => {
    fx.boards.push({ id: 'other', title: 'Spare', archived_at: null });
    const result = await mod.listMeetingWhiteboards(member());
    expect(result.canManage).toBe(true);
    expect(result.links).toEqual([
      { boardId: b1, title: 'Plan', role: 'edit', guestAccess: 'view' },
    ]);
    expect(result.available.map((b) => b.id)).toEqual(['other']);
  });

  it('shows guests only boards they may open, without link settings', async () => {
    const result = await mod.listMeetingWhiteboards(guest());
    expect(result.canManage).toBe(false);
    expect(result.links).toEqual([
      { boardId: b1, title: 'Plan', role: 'view' },
    ]);
    expect(result.available).toEqual([]);
    fx.links[0]!.guest_access = 'none';
    expect((await mod.listMeetingWhiteboards(guest())).links).toEqual([]);
  });

  it('lets a workspace admin who is not the host manage', async () => {
    fx.perm.mockResolvedValue({ data: true, error: null });
    expect(
      (await mod.listMeetingWhiteboards(member({ isHost: false }))).canManage
    ).toBe(true);
  });
});

describe('actions', () => {
  it('passes the verified actor to the database functions', async () => {
    fx.rpc.mockResolvedValue({ guest_access: 'view' });
    await mod.runMeetingWhiteboardAction(member(), {
      action: 'link',
      boardId: b1,
    });
    expect(fx.rpc).toHaveBeenCalledWith('link_meet_whiteboard', {
      p_actor_id: 'actor',
      p_meeting_id: meetingId,
      p_whiteboard_id: b1,
      p_guest_access: 'view',
    });
  });

  it('applies an explicit access when relinking returns a different one', async () => {
    fx.rpc.mockResolvedValueOnce({ guest_access: 'view' });
    fx.rpc.mockResolvedValueOnce({ guest_access: 'draw' });
    const result = await mod.runMeetingWhiteboardAction(member(), {
      action: 'link',
      boardId: b1,
      guestAccess: 'draw',
    });
    expect(fx.rpc.mock.calls[1]![0]).toBe('set_meet_whiteboard_guest_access');
    expect(result).toEqual({ boardId: b1, guestAccess: 'draw' });
  });

  it('treats a second unlink as success', async () => {
    const { AccountServiceError } =
      await import('@tuturuuu/utils/account-benefits-server');
    fx.rpc.mockRejectedValue(new AccountServiceError(404));
    await expect(
      mod.runMeetingWhiteboardAction(member(), {
        action: 'unlink',
        boardId: b1,
      })
    ).resolves.toEqual({ boardId: b1, unlinked: true });
    fx.rpc.mockRejectedValue(new AccountServiceError(403));
    await expect(
      mod.runMeetingWhiteboardAction(member(), {
        action: 'unlink',
        boardId: b1,
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  it('refuses every management action for guests and non-members', async () => {
    for (const access of [guest(), member({ canReadWorkspace: false })])
      await expect(
        mod.runMeetingWhiteboardAction(access, {
          action: 'unlink',
          boardId: b1,
        })
      ).rejects.toMatchObject({ status: 403 });
    expect(fx.rpc).not.toHaveBeenCalled();
  });

  it('creates a board in the meeting workspace and links it', async () => {
    fx.rpc.mockResolvedValue({ guest_access: 'view' });
    const result = await mod.runMeetingWhiteboardAction(member(), {
      action: 'create',
      title: 'Retro',
    });
    expect(fx.inserted).toEqual([
      { ws_id: wsId, creator_id: 'actor', title: 'Retro' },
    ]);
    expect(result).toEqual({ boardId: 'new-board', guestAccess: 'view' });
  });

  it('removes a new board when linking is refused and refuses non-managers', async () => {
    const { AccountServiceError } =
      await import('@tuturuuu/utils/account-benefits-server');
    fx.rpc.mockRejectedValue(new AccountServiceError(403));
    await expect(
      mod.runMeetingWhiteboardAction(member(), { action: 'create', title: 'x' })
    ).rejects.toMatchObject({ status: 403 });
    expect(fx.deleted).toEqual(['new-board']);
    fx.inserted = [];
    await expect(
      mod.runMeetingWhiteboardAction(member({ isHost: false }), {
        action: 'create',
        title: 'x',
      })
    ).rejects.toMatchObject({ status: 403 });
    expect(fx.inserted).toEqual([]);
  });

  it('validates browser commands strictly', () => {
    const parse = mod.whiteboardActionSchema.safeParse;
    expect(parse({ action: 'join', boardId: b1 }).success).toBe(true);
    expect(parse({ action: 'join', boardId: b1, wsId }).success).toBe(false);
    expect(parse({ action: 'link', boardId: 'nope' }).success).toBe(false);
    expect(
      parse({ action: 'guest-access', boardId: b1, guestAccess: 'x' }).success
    ).toBe(false);
    expect(parse({ action: 'create', title: '  ' }).success).toBe(false);
  });
});
