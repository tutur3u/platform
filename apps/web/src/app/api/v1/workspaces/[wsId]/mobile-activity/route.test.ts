import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveSessionAuthContext: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => mocks);
vi.mock('@tuturuuu/utils/workspace-helper', () => mocks);
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
    wallet_transactions: query([
      { id: 'transaction-1', created_at: '2026-09-28T09:00:00Z' },
    ]),
    notes: query([]),
    workspace_calendar_events: query([]),
  };
  const from = vi.fn((name: keyof typeof tables) => tables[name]);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      user: { id: 'viewer' },
      supabase: { from },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('requires authenticated workspace membership', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: false });
    expect((await GET(request(), params)).status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns scoped entries without shared caching', async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith(
      expect.objectContaining({ requiredType: 'ANY' })
    );
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(tables.tasks.eq).toHaveBeenCalledWith('creator_id', 'viewer');
    expect(tables.wallet_transactions.eq).toHaveBeenCalledWith(
      'platform_creator_id',
      'viewer'
    );
    expect(tables.notes.eq).toHaveBeenCalledWith('creator_id', 'viewer');
    expect(await response.json()).toMatchObject({
      items: [
        { id: 'task-1', type: 'task', scope: 'personal', boardId: 'board-1' },
        { id: 'transaction-1', type: 'transaction', scope: 'personal' },
      ],
    });
  });
});
