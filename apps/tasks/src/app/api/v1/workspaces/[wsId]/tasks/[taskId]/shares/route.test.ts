import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  membership: vi.fn(),
  normalize: vi.fn(),
}));
vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.session,
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { POST } from './route';

const wsId = '00000000-0000-4000-8000-000000000002';
const taskId = '00000000-0000-4000-8000-000000000001';
function fixture({
  enabled = true,
  error = null,
  existing = false,
  taskWorkspace = wsId,
}: {
  enabled?: boolean | null;
  error?: object | null;
  existing?: boolean;
  taskWorkspace?: string;
} = {}) {
  const insert = vi.fn();
  const update = vi.fn();
  const rpc = vi.fn().mockResolvedValue({ data: enabled, error });
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      ilike: () => query,
      maybeSingle: async () => ({
        data:
          table === 'tasks'
            ? {
                id: taskId,
                task_lists: { workspace_boards: { ws_id: taskWorkspace } },
              }
            : table === 'task_shares' && existing
              ? { id: 'share-a' }
              : null,
        error: null,
      }),
      insert: (row: unknown) => {
        insert(row);
        return query;
      },
      update: (row: unknown) => {
        update(row);
        return query;
      },
      single: async () => ({ data: { id: 'share-a' }, error: null }),
    };
    return query;
  });
  const supabase = { from, rpc };
  mocks.session.mockResolvedValue({
    user: { id: 'actor-a' },
    authError: null,
    supabase,
  });
  mocks.normalize.mockResolvedValue(wsId);
  mocks.membership.mockResolvedValue({ ok: true });
  return { insert, update, rpc, from };
}
function post() {
  return POST(
    new Request('https://synthetic.invalid/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'recipient@synthetic.invalid',
        permission: 'view',
      }),
    }) as never,
    { params: Promise.resolve({ wsId, taskId }) }
  );
}

describe('task share POST creation boundary', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each([false, null])(
    'denies disabled or unknown sharing (%s) without inserting',
    async (enabled) => {
      const db = fixture({ enabled });
      expect((await post()).status).toBe(403);
      expect(db.rpc).toHaveBeenCalledWith('is_task_sharing_enabled', {
        p_task_id: taskId,
      });
      expect(db.insert).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
    }
  );
  it('fails closed on policy lookup error without inserting', async () => {
    const db = fixture({ enabled: null, error: {} });
    expect((await post()).status).toBe(500);
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('creates a new share when the policy is enabled', async () => {
    const db = fixture();
    expect((await post()).status).toBe(201);
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: taskId, shared_by_user_id: 'actor-a' })
    );
  });
  it('preserves existing share updates while new sharing is disabled', async () => {
    const db = fixture({ enabled: false, existing: true });
    expect((await post()).status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('denies a foreign task before policy lookup or insertion', async () => {
    const db = fixture({ taskWorkspace: 'foreign-workspace' });
    expect((await post()).status).toBe(404);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it('denies a nonmember before querying task or inserting', async () => {
    const db = fixture();
    mocks.membership.mockResolvedValue({ ok: false });
    expect((await post()).status).toBe(403);
    expect(db.from).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });
});
