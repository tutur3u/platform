import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  actor: '00000000-0000-4000-8000-000000000001',
  from: vi.fn(),
  membership: vi.fn(),
  boardAccess: vi.fn(),
  admin: vi.fn(),
  adminFrom: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.admin,
}));
vi.mock('next/server', async (load) => ({
  ...(await load<object>()),
  connection: async () => {},
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown) => Promise<Response>) =>
    (req: Request) =>
      handler(req, { user: { id: f.actor }, supabase: { from: f.from } }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: f.membership,
}));

vi.mock('./board-share-access', () => ({
  hasBoardShareWorkspaceAccess: f.boardAccess,
}));

import { GET, PUT } from './route';

const ws = '00000000-0000-4000-8000-000000000010';
const guestWs = '00000000-0000-4000-8000-000000000011';
const request = (body: object) =>
  new Request('https://test/hidden', {
    method: 'PUT',
    body: JSON.stringify({ expectedActorId: f.actor, ...body }),
  });

describe('owner-only Hidden preferences', () => {
  let query: Record<
    'select' | 'eq' | 'upsert' | 'delete' | 'like',
    ReturnType<typeof vi.fn>
  >;
  beforeEach(() => {
    vi.clearAllMocks();
    f.actor = '00000000-0000-4000-8000-000000000001';
    query = {
      select: vi.fn(),
      eq: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      like: vi.fn(),
    };
    query.like.mockReturnValue(query);
    let operation = 'read';
    let table = 'user_workspace_configs';
    query.select.mockReturnValue(query);
    query.delete.mockImplementation(() => {
      operation = 'delete';
      return query;
    });
    query.upsert.mockResolvedValue({ error: null });
    query.eq.mockImplementation((key: string) => {
      if (
        (operation === 'read' && key === 'value') ||
        (operation === 'delete' && key === 'id')
      ) {
        return Promise.resolve({
          data:
            table === 'user_configs'
              ? [{ id: `HIDDEN_WORKSPACE:${guestWs}` }]
              : [{ ws_id: ws }],
          error: null,
        });
      }
      return query;
    });
    f.from.mockImplementation((requestedTable: string) => {
      table = requestedTable;
      return query;
    });
    f.adminFrom.mockReturnValue(query);
    f.admin.mockResolvedValue({ from: f.adminFrom });
    f.membership.mockResolvedValue({ ok: true });
    f.boardAccess.mockResolvedValue(false);
  });
  it('projects only owner hidden IDs and forbids shared caching', async () => {
    const response = await GET(
      new Request(`https://test/hidden?expectedActorId=${f.actor}`) as never
    );
    expect(query.select).toHaveBeenCalledWith('ws_id');
    expect(query.eq).toHaveBeenCalledWith('user_id', f.actor);
    expect(query.eq).toHaveBeenCalledWith('id', 'HIDDEN_WORKSPACE');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      hiddenWorkspaceIds: [ws, guestWs],
    });
  });
  it.each([
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ])('binds %s writes to that actor, never actor A', async (actor) => {
    f.actor = actor;
    const response = await PUT(
      request({ workspaceId: ws, hidden: true }) as never
    );
    expect(response.status).toBe(200);
    expect(f.membership).toHaveBeenCalledWith(
      expect.objectContaining({ userId: actor, wsId: ws })
    );
    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: actor,
        ws_id: ws,
        id: 'HIDDEN_WORKSPACE',
        value: 'true',
      }),
      { onConflict: 'user_id,ws_id,id' }
    );
    expect(f.from).toHaveBeenCalledTimes(1);
    expect(f.from).toHaveBeenCalledWith('user_workspace_configs');
  });
  it('rejects spoofed owner even for workspace admin', async () => {
    f.actor = '00000000-0000-4000-8000-000000000003';
    const response = await PUT(
      request({ workspaceId: ws, hidden: true, user_id: 'actor-A' }) as never
    );
    expect(response.status).toBe(400);
    expect(f.from).not.toHaveBeenCalled();
  });
  it('restores only actor-owned preference', async () => {
    const response = await PUT(
      request({ workspaceId: ws, hidden: false }) as never
    );
    expect(response.status).toBe(200);
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('user_id', f.actor);
    expect(query.eq).toHaveBeenCalledWith('ws_id', ws);
    expect(query.eq).toHaveBeenCalledWith('id', 'HIDDEN_WORKSPACE');
  });
  it('member restore clears a prior board-guest preference as well', async () => {
    const response = await PUT(
      request({ workspaceId: ws, hidden: false }) as never
    );
    expect(response.status).toBe(200);
    expect(f.from.mock.calls.map(([table]) => table)).toEqual([
      'user_configs',
      'user_workspace_configs',
    ]);
    expect(query.eq).toHaveBeenCalledWith('id', `HIDDEN_WORKSPACE:${ws}`);
    expect(query.eq).toHaveBeenCalledWith('id', 'HIDDEN_WORKSPACE');
  });
  it.each([
    ['membership_lookup_failed', 500],
    ['membership_missing', 403],
  ])('denies %s before preference writes', async (error, status) => {
    f.membership.mockResolvedValue({ ok: false, error });
    const response = await PUT(
      request({ workspaceId: ws, hidden: true }) as never
    );
    expect(response.status).toBe(status);
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'board-share-only guest updates private preference hidden=%s',
    async (hidden) => {
      f.membership.mockResolvedValue({
        ok: false,
        error: 'membership_missing',
      });
      f.boardAccess.mockResolvedValue(true);
      const response = await PUT(request({ workspaceId: ws, hidden }) as never);
      expect(response.status).toBe(200);
      expect(f.boardAccess).toHaveBeenCalledWith(
        expect.anything(),
        f.actor,
        ws
      );
      expect(f.from).toHaveBeenCalledWith('user_configs');
      expect(f.from).not.toHaveBeenCalledWith('user_workspace_configs');
      if (!hidden) {
        expect(f.admin).toHaveBeenCalledWith({ noCookie: true });
        expect(f.adminFrom).toHaveBeenCalledWith('user_workspace_configs');
        expect(query.eq).toHaveBeenCalledWith('user_id', f.actor);
        expect(query.eq).toHaveBeenCalledWith('ws_id', ws);
        expect(query.eq).toHaveBeenCalledWith('id', 'HIDDEN_WORKSPACE');
      } else {
        expect(f.admin).not.toHaveBeenCalled();
      }
      if (hidden)
        expect(query.upsert).toHaveBeenCalledWith(
          { user_id: f.actor, id: `HIDDEN_WORKSPACE:${ws}`, value: 'true' },
          { onConflict: 'user_id,id' }
        );
    }
  );
  it('cannot clean a former member record without current board access', async () => {
    f.membership.mockResolvedValue({ ok: false, error: 'membership_missing' });
    const response = await PUT(
      request({ workspaceId: ws, hidden: false }) as never
    );
    expect(response.status).toBe(403);
    expect(f.admin).not.toHaveBeenCalled();
    expect(f.adminFrom).not.toHaveBeenCalled();
  });
  it('former-member guest restore stays restored in admin GET and after membership returns', async () => {
    const other = '00000000-0000-4000-8000-000000000002';
    const records: Record<string, Array<Record<string, string>>> = {
      user_workspace_configs: [f.actor, other].map((actor) => ({
        user_id: actor,
        ws_id: ws,
        id: 'HIDDEN_WORKSPACE',
        value: 'true',
      })),
      user_configs: [f.actor, other].map((actor) => ({
        user_id: actor,
        id: `HIDDEN_WORKSPACE:${ws}`,
        value: 'true',
      })),
    };
    function database(admin: boolean) {
      return (table: string) => {
        const filters: Record<string, string> = {};
        let deleting = false;
        type Result = { data: Array<Record<string, string>>; error: null };
        type Query = {
          select: (columns: string) => Query;
          delete: () => Query;
          eq: (key: string, value: string) => Query;
          like: (key: string, value: string) => Query;
          then: (resolve: (result: Result) => unknown) => Promise<unknown>;
        };
        const query: Query = {
          select: () => query,
          delete: () => {
            deleting = true;
            return query;
          },
          eq: (key, value) => {
            filters[key] = value;
            return query;
          },
          like: () => query,
          // biome-ignore lint/suspicious/noThenProperty: PostgREST builders are intentionally awaitable.
          then: async (resolve) => {
            const matches = (row: Record<string, string>) =>
              (admin || table !== 'user_workspace_configs') &&
              Object.entries(filters).every(
                ([key, value]) => row[key] === value
              );
            const data = (records[table] ?? []).filter(matches);
            if (deleting)
              records[table] = (records[table] ?? []).filter(
                (row) => !matches(row)
              );
            return resolve({ data, error: null });
          },
        };
        return query;
      };
    }
    f.membership.mockResolvedValue({ ok: false, error: 'membership_missing' });
    f.boardAccess.mockResolvedValue(true);
    f.from.mockImplementation(database(false));
    f.adminFrom.mockImplementation(database(true));
    expect(
      (await PUT(request({ workspaceId: ws, hidden: false }) as never)).status
    ).toBe(200);
    for (const rows of Object.values(records))
      expect(rows.map((row) => row.user_id)).toEqual([other]);
    f.from.mockImplementation(database(true));
    const get = () =>
      GET(
        new Request(`https://test/hidden?expectedActorId=${f.actor}`) as never
      );
    expect(await (await get()).json()).toEqual({ hiddenWorkspaceIds: [] });
    f.membership.mockResolvedValue({ ok: true });
    expect(await (await get()).json()).toEqual({ hiddenWorkspaceIds: [] });
    expect(
      f.adminFrom.mock.calls.every(
        ([table]) => table === 'user_workspace_configs'
      )
    ).toBe(true);
  });
  it('fails share lookup closed without writing', async () => {
    f.membership.mockResolvedValue({ ok: false, error: 'membership_missing' });
    f.boardAccess.mockRejectedValue(new Error('offline'));
    const response = await PUT(
      request({ workspaceId: ws, hidden: true }) as never
    );
    expect(response.status).toBe(500);
    expect(f.from).not.toHaveBeenCalled();
  });
  it('rejects delayed mutation after account switch before any write', async () => {
    const previousActor = f.actor;
    f.actor = '00000000-0000-4000-8000-000000000002';
    const response = await PUT(
      request({
        workspaceId: ws,
        hidden: true,
        expectedActorId: previousActor,
      }) as never
    );
    expect(response.status).toBe(409);
    expect(f.from).not.toHaveBeenCalled();
  });
  it('rejects list fetch bound to a different account', async () => {
    const response = await GET(
      new Request('https://test/hidden?expectedActorId=other') as never
    );
    expect(response.status).toBe(409);
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'guest can update own private preference hidden=%s',
    async (hidden) => {
      f.membership.mockImplementation(async ({ requiredType }) =>
        requiredType === 'ANY'
          ? { ok: true, membershipType: 'GUEST' }
          : { ok: false, error: 'membership_type_mismatch' }
      );
      const response = await PUT(request({ workspaceId: ws, hidden }) as never);
      expect(response.status).toBe(200);
      expect(f.membership).toHaveBeenCalledWith(
        expect.objectContaining({ userId: f.actor, requiredType: 'ANY' })
      );
    }
  );
});
