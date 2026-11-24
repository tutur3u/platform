import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from './fake-db.test-support';

const WS = '22222222-2222-4222-8222-222222222222';
const OTHER_WS = '55555555-5555-4555-8555-555555555555';
const TASK = '33333333-3333-4333-8333-333333333333';
const USER = { id: '11111111-1111-4111-8111-111111111111' };

const mocks = vi.hoisted(() => ({
  requireWorkspaceAccess: vi.fn(),
  getPermissions: vi.fn(),
  db: undefined as unknown,
}));

vi.mock('../taskId/access', () => ({
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => mocks.db,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
}));

import { canManageProjects, requireTaskScope } from './access';

class TaskDb extends FakeDb {
  boardWs = WS;
  deleted: string | null = null;
  override from(table: string) {
    if (table === 'tasks') {
      const result = {
        data: {
          id: TASK,
          deleted_at: this.deleted,
          task_lists: { workspace_boards: { ws_id: this.boardWs } },
        },
        error: null,
      };
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => result,
      };
      return query as never;
    }
    return super.from(table);
  }
}

const request = new NextRequest('http://localhost/x');

function grant(mode: 'member' | 'guest', permission: 'view' | 'edit') {
  mocks.requireWorkspaceAccess.mockResolvedValue({
    access:
      mode === 'member'
        ? { mode, permission }
        : { mode, permission, share: {} },
    supabase: {},
    taskId: TASK,
    user: USER,
    wsId: WS,
  });
}

let db: TaskDb;
beforeEach(() => {
  vi.clearAllMocks();
  db = new TaskDb();
  mocks.db = db;
  grant('member', 'edit');
});

describe('requireTaskScope', () => {
  it('returns the scope for a task in the workspace', async () => {
    const scope = await requireTaskScope(request, {}, undefined);
    expect(scope).toMatchObject({ taskId: TASK, wsId: WS });
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith(
      request,
      {},
      undefined,
      { requiredPermission: 'view' }
    );
  });

  it('asks for edit rights when the caller needs them', async () => {
    await requireTaskScope(request, {}, undefined, { permission: 'edit' });
    expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith(
      request,
      {},
      undefined,
      { requiredPermission: 'edit' }
    );
  });

  it('answers 404 for a task id that belongs to another workspace', async () => {
    db.boardWs = OTHER_WS;
    const scope = await requireTaskScope(request, {}, undefined);
    expect('error' in scope && scope.error.status).toBe(404);
  });

  it('answers 404 for a deleted task', async () => {
    db.deleted = '2024-01-01T00:00:00Z';
    const scope = await requireTaskScope(request, {}, undefined);
    expect('error' in scope && scope.error.status).toBe(404);
  });

  it('keeps the workspace-access denial', async () => {
    mocks.requireWorkspaceAccess.mockResolvedValue({
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });
    const scope = await requireTaskScope(request, {}, undefined);
    expect('error' in scope && scope.error.status).toBe(403);
  });

  it('refuses writes from a view-only guest but allows an edit guest', async () => {
    grant('guest', 'view');
    const denied = await requireTaskScope(request, {}, undefined, {
      write: true,
    });
    expect('error' in denied && denied.error.status).toBe(403);
    grant('guest', 'edit');
    const allowed = await requireTaskScope(request, {}, undefined, {
      write: true,
    });
    expect('error' in allowed).toBe(false);
  });
});

describe('canManageProjects', () => {
  it('follows the workspace permission, which creators hold implicitly', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (id: string) => id === 'manage_projects',
    });
    expect(await canManageProjects(USER as never, WS)).toBe(true);
    mocks.getPermissions.mockResolvedValue({ containsPermission: () => false });
    expect(await canManageProjects(USER as never, WS)).toBe(false);
    mocks.getPermissions.mockResolvedValue(null);
    expect(await canManageProjects(USER as never, WS)).toBe(false);
  });
});
