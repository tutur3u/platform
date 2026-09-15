import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  membership: vi.fn(),
  permissions: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock('./access', () => ({
  meetAiAccess: mocks.access,
  MeetAiError: class extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
  getPermissions: mocks.permissions,
  resolveWorkspaceIdForPrincipal: mocks.resolve,
}));

import { followupAccess, readFollowupContext } from './followup-context';

const userId = '11111111-1111-4111-8111-111111111111';
const wsId = '22222222-2222-4222-8222-222222222222';
const boardId = '33333333-3333-4333-8333-333333333333';
function query(data: unknown) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
    then: (resolve: (result: unknown) => unknown) =>
      Promise.resolve(resolve({ data, error: null })),
  };
  for (const key of ['select', 'eq', 'is', 'order', 'limit'] as const)
    q[key].mockReturnValue(q);
  q.maybeSingle.mockResolvedValue({ data, error: null });
  return q;
}
const params = { params: Promise.resolve({ wsId, meetingId: boardId }) };
const request = new Request(
  `https://meet.tuturuuu.com/api/meet-ai/${wsId}/${boardId}/followups?workspaceId=${wsId}&boardId=${boardId}`
);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockReset().mockResolvedValue(wsId);
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
});
it('checks note access and full membership for the destination separately', async () => {
  const personal = query({ id: wsId });
  const db = { from: vi.fn(() => personal) };
  mocks.access.mockResolvedValue({ db, user: { id: userId } });
  mocks.membership.mockResolvedValue({ ok: false });
  await expect(followupAccess(request, params, wsId)).rejects.toMatchObject({
    status: 403,
  });
  expect(mocks.access).toHaveBeenCalledWith(request, params);
  expect(mocks.membership).toHaveBeenCalledWith(
    expect.objectContaining({ userId, wsId, requiredType: 'MEMBER' })
  );
  expect(mocks.permissions).not.toHaveBeenCalled();
});
it('scopes profile, timezone, workspace and board lookups to the verified actor and destination', async () => {
  const tables = {
    workspaces: query({ id: wsId }),
    users: query({ display_name: 'Requester' }),
    user_private_details: query({
      full_name: 'Requester',
      timezone: 'Asia/Ho_Chi_Minh',
    }),
    workspace_members: query([
      {
        workspaces: {
          id: wsId,
          name: 'Personal',
          personal: true,
          deleted: false,
        },
      },
    ]),
    workspace_boards: query([{ id: boardId, name: 'Board' }]),
    task_lists: query([]),
  };
  const db = { from: vi.fn((name: keyof typeof tables) => tables[name]) };
  mocks.access.mockResolvedValue({ db, user: { id: userId } });
  const result = await readFollowupContext(request, params);
  if (!result.user) throw new Error('Expected context');
  expect(result.user.id).toBe(userId);
  expect(result.timezone).toBe('Asia/Ho_Chi_Minh');
  expect(tables.user_private_details.eq).toHaveBeenCalledWith(
    'user_id',
    userId
  );
  expect(tables.workspace_members.eq).toHaveBeenCalledWith('user_id', userId);
  expect(tables.workspace_boards.eq).toHaveBeenCalledWith('ws_id', wsId);
  expect(tables.task_lists.eq).toHaveBeenCalledWith('board_id', boardId);
});
it('rejects a list request for a board outside the destination', async () => {
  const tables = {
    workspaces: query({ id: wsId }),
    users: query(null),
    user_private_details: query(null),
    workspace_members: query([]),
    workspace_boards: query([]),
  };
  const db = { from: vi.fn((name: keyof typeof tables) => tables[name]) };
  mocks.access.mockResolvedValue({ db, user: { id: userId } });
  await expect(readFollowupContext(request, params)).rejects.toMatchObject({
    status: 403,
  });
  expect(db.from).not.toHaveBeenCalledWith('task_lists');
});

it('checks calendar permission and counts only overlapping events in the destination', async () => {
  const events = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gt: vi.fn().mockResolvedValue({ count: 2, error: null }),
  };
  const db = {
    from: vi.fn((table: string) =>
      table === 'workspaces' ? query({ id: wsId }) : events
    ),
  };
  mocks.access.mockResolvedValue({ db, user: { id: userId } });
  const interval = new Request(
    `https://meet.tuturuuu.com/api/meet-ai/${wsId}/${boardId}/followups?workspaceId=${wsId}&startAt=2026-09-15T02:00:00Z&endAt=2026-09-15T03:00:00Z`
  );
  mocks.permissions.mockResolvedValue({ withoutPermission: () => true });
  await expect(readFollowupContext(interval, params)).rejects.toMatchObject({
    status: 403,
  });
  expect(db.from).not.toHaveBeenCalledWith('workspace_calendar_events');
  mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
  await expect(readFollowupContext(interval, params)).resolves.toEqual({
    count: 2,
  });
  expect(events.eq).toHaveBeenCalledWith('ws_id', wsId);
  expect(events.lt).toHaveBeenCalledWith('start_at', '2026-09-15T03:00:00Z');
  expect(events.gt).toHaveBeenCalledWith('end_at', '2026-09-15T02:00:00Z');
});

it('rejects reversed instants with different fractional-second precision', async () => {
  const db = { from: vi.fn(() => query({ id: wsId })) };
  mocks.access.mockResolvedValue({ db, user: { id: userId } });
  const interval = new Request(
    `https://meet.tuturuuu.com/api/meet-ai/${wsId}/${boardId}/followups?workspaceId=${wsId}&startAt=2026-09-15T02:00:00.500Z&endAt=2026-09-15T02:00:00Z`
  );
  await expect(readFollowupContext(interval, params)).rejects.toMatchObject({
    status: 400,
  });
  expect(db.from).not.toHaveBeenCalledWith('workspace_calendar_events');
});

it('resolves the personal destination with the signed principal only when no destination was selected', async () => {
  const db = { from: vi.fn() };
  mocks.access.mockResolvedValue({
    db,
    user: { id: userId, email: 'member@example.com' },
  });
  await expect(followupAccess(request, params)).resolves.toMatchObject({
    workspaceId: wsId,
  });
  expect(mocks.resolve).toHaveBeenCalledWith({
    authorizationClient: db,
    principal: { id: userId, email: 'member@example.com' },
    wsId: 'personal',
  });
  mocks.resolve.mockClear();
  await followupAccess(request, params, wsId);
  expect(mocks.resolve).not.toHaveBeenCalled();
});
it.each([
  ['WorkspaceNotFoundError', 404],
  ['WorkspaceResolutionError', 503],
])('preserves %s for the default destination', async (name, status) => {
  mocks.access.mockResolvedValue({ db: {}, user: { id: userId } });
  mocks.resolve.mockRejectedValue(
    Object.assign(new Error('unavailable'), { name })
  );
  await expect(followupAccess(request, params)).rejects.toMatchObject({
    status,
  });
  expect(mocks.membership).not.toHaveBeenCalled();
});
