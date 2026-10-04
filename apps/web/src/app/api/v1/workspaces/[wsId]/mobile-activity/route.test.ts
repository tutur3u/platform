import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSessionAuthContext: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  createAdminClient: vi.fn(),
  calendarAccess: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => mocks);
vi.mock('@tuturuuu/utils/workspace-helper', () => mocks);
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET } from './route';

const params = { params: Promise.resolve({ wsId: 'workspace' }) };
const request = () =>
  new NextRequest(
    'https://tuturuuu.com/api/v1/workspaces/workspace/mobile-activity'
  );

function query(data: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe('mobile profile activity', () => {
  const tables = {
    tasks: query([
      {
        id: 'task-1',
        name: 'Plan release',
        task_lists: { board_id: 'board-1' },
        created_at: '2026-09-28T10:00:00Z',
      },
    ]),
    notes: query([]),
    workspace_calendar_events: query([]),
  };
  const from = vi.fn((name: keyof typeof tables) => tables[name]);
  const adminFrom = vi.fn((name: keyof typeof tables) => tables[name]);
  const rpc = vi.fn().mockResolvedValue({
    data: [
      {
        id: 'transaction-1',
        created_at: '2026-09-28T09:00:00Z',
        platform_creator_id: 'viewer',
      },
      {
        id: 'transaction-other',
        created_at: '2026-09-28T09:00:00Z',
        platform_creator_id: 'other',
      },
    ],
    error: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calendarAccess.mockResolvedValue({ data: true, error: null });
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      user: { id: 'viewer' },
      supabase: {
        from,
        rpc: (name: string, args: unknown) =>
          name === 'has_workspace_permission'
            ? mocks.calendarAccess(args)
            : rpc(name, args),
      },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.createAdminClient.mockResolvedValue({ from: adminFrom });
  });

  it('requires authenticated workspace membership', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });
    expect((await GET(request(), params)).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns scoped entries without shared caching', async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith(
      expect.objectContaining({ requiredType: 'ANY' })
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(mocks.createAdminClient).toHaveBeenCalledWith({
      noCookie: true,
      auditActorId: 'viewer',
    });
    expect(adminFrom).toHaveBeenCalledWith('tasks');
    expect(from).not.toHaveBeenCalledWith('tasks');
    expect(tables.tasks.eq).toHaveBeenCalledWith('creator_id', 'viewer');
    expect(rpc).toHaveBeenCalledWith(
      'get_wallet_transactions_with_permissions',
      expect.objectContaining({
        p_ws_id: 'workspace',
        p_user_id: 'viewer',
        p_creator_ids: ['viewer'],
      })
    );
    expect(tables.notes.eq).toHaveBeenCalledWith('creator_id', 'viewer');
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(body.partial).toBe(false);
    expect(body).toMatchObject({
      items: [
        { id: 'task-1', type: 'task', scope: 'personal', boardId: 'board-1' },
        { id: 'transaction-1', type: 'transaction', scope: 'personal' },
      ],
    });
  });

  it('keeps available activity when one source fails', async () => {
    tables.notes.range.mockResolvedValueOnce({
      data: null,
      error: { code: 'permission_denied' },
    });
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      partial: true,
      failedSources: ['notes'],
      items: [
        { id: 'task-1', type: 'task' },
        { id: 'transaction-1', type: 'transaction' },
      ],
    });
  });

  it('offers retry when every activity source fails', async () => {
    const failure = { data: null, error: { code: 'unavailable' } };
    tables.tasks.range.mockResolvedValueOnce(failure);
    tables.notes.range.mockResolvedValueOnce(failure);
    tables.workspace_calendar_events.range.mockResolvedValueOnce(failure);
    rpc.mockResolvedValueOnce(failure);
    expect((await GET(request(), params)).status).toBe(500);
  });
  it('authorizes Calendar permission before scoped admin metadata reads', async () => {
    tables.workspace_calendar_events.range.mockResolvedValueOnce({
      data: [{ id: 'event', created_at: '2026-09-28T08:00:00Z' }],
      error: null,
    });
    const response = await GET(request(), params);
    expect(mocks.calendarAccess).toHaveBeenCalledWith({
      p_ws_id: 'workspace',
      p_user_id: 'viewer',
      p_permission: 'manage_calendar',
    });
    expect(adminFrom).toHaveBeenCalledWith('workspace_calendar_events');
    expect(from).not.toHaveBeenCalledWith('workspace_calendar_events');
    expect(tables.workspace_calendar_events.eq).toHaveBeenCalledWith(
      'ws_id',
      'workspace'
    );
    expect(tables.workspace_calendar_events.select).toHaveBeenCalledWith(
      'id,created_at'
    );
    expect(await response.json()).toMatchObject({
      partial: false,
      items: expect.arrayContaining([
        {
          id: 'event',
          type: 'calendar',
          createdAt: '2026-09-28T08:00:00Z',
          scope: 'workspace',
        },
      ]),
    });
  });
  it('omits Calendar metadata without permission or on failed verification', async () => {
    for (const result of [
      { data: false, error: null },
      { data: null, error: { code: 'unavailable' } },
    ]) {
      adminFrom.mockClear();
      mocks.calendarAccess.mockResolvedValueOnce(result);
      const response = await GET(request(), params);
      expect(adminFrom).not.toHaveBeenCalledWith('workspace_calendar_events');
      expect(await response.json()).toMatchObject({
        partial: Boolean(result.error),
        failedSources: result.error ? ['events'] : [],
      });
    }
  });
  it('validates pages before privileged reads and bounds every source', async () => {
    const invalid = await GET(
      new NextRequest('https://example.test/api?page=-1'),
      params
    );
    expect(invalid.status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    const valid = await GET(
      new NextRequest('https://example.test/api?page=2'),
      params
    );
    expect(valid.status).toBe(200);
    expect(tables.tasks.range).toHaveBeenCalledWith(400, 599);
    expect(tables.notes.range).toHaveBeenCalledWith(400, 599);
    expect(tables.workspace_calendar_events.range).toHaveBeenCalledWith(
      400,
      599
    );
    expect(rpc).toHaveBeenCalledWith(
      'get_wallet_transactions_with_permissions',
      expect.objectContaining({
        p_offset: 400,
        p_limit: 200,
        p_creator_ids: ['viewer'],
      })
    );
  });
  it('keeps a pinned upper boundary and continues authoritative full source pages with tied timestamps', async () => {
    const until = '2026-09-30T00:00:00.000Z';
    tables.tasks.range.mockResolvedValueOnce({
      data: Array.from({ length: 200 }, (_, i) => ({
        id: `task-${i}`,
        name: 'Task',
        created_at: '2026-09-29T00:00:00.000Z',
        task_lists: { board_id: 'board' },
      })),
      error: null,
    });
    const response = await GET(
      new NextRequest(
        `https://example.test/api?until=${encodeURIComponent(until)}`
      ),
      params
    );
    const body = await response.json();
    expect(body.until).toBe(until);
    expect(body.nextPage).toBe(1);
    expect(tables.tasks.lte).toHaveBeenCalledWith('created_at', until);
    expect(tables.tasks.order).toHaveBeenCalledWith('id', { ascending: false });
    expect(
      body.items.filter((item: { type: string }) => item.type === 'task')
    ).toHaveLength(200);
  });
  it('starts other activity reads while Calendar permission is unresolved', async () => {
    let permit!: (value: { data: boolean; error: null }) => void;
    mocks.calendarAccess.mockReturnValueOnce(
      new Promise((resolve) => {
        permit = resolve;
      })
    );
    const pending = GET(request(), params);
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(adminFrom).toHaveBeenCalledWith('tasks');
    expect(from).toHaveBeenCalledWith('notes');
    expect(adminFrom).not.toHaveBeenCalledWith('workspace_calendar_events');
    permit({ data: false, error: null });
    expect((await pending).status).toBe(200);
    expect(adminFrom).not.toHaveBeenCalledWith('workspace_calendar_events');
  });
  it('passes the pinned creation boundary into finance before pagination', async () => {
    const until = '2026-09-30T00:00:00.000Z';
    await GET(
      new NextRequest(`https://example.test/api?page=1&until=${until}`),
      params
    );
    expect(rpc).toHaveBeenCalledWith(
      'get_wallet_transactions_with_permissions',
      expect.objectContaining({
        p_created_at_until: until,
        p_offset: 200,
        p_limit: 200,
      })
    );
  });
});
