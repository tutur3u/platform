import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSessionAuthContext: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  createAdminClient: vi.fn(),
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
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data, error: null }),
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
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      user: { id: 'viewer' },
      supabase: { from, rpc },
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
    tables.notes.limit.mockResolvedValueOnce({
      data: null,
      error: { code: 'permission_denied' },
    });
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      partial: true,
      items: [
        { id: 'task-1', type: 'task' },
        { id: 'transaction-1', type: 'transaction' },
      ],
    });
  });

  it('offers retry when every activity source fails', async () => {
    const failure = { data: null, error: { code: 'unavailable' } };
    tables.tasks.limit.mockResolvedValueOnce(failure);
    tables.notes.limit.mockResolvedValueOnce(failure);
    tables.workspace_calendar_events.limit.mockResolvedValueOnce(failure);
    rpc.mockResolvedValueOnce(failure);
    expect((await GET(request(), params)).status).toBe(500);
  });
});
