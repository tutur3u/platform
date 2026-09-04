import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  membership: { ok: false, type: null } as {
    ok: boolean;
    type: string | null;
  },
  queryTables: [] as string[],
  resolveUser: vi.fn(),
  rpc: vi.fn(),
  shareLink: {} as Record<string, unknown>,
  sharePermission: null as 'edit' | 'view' | null,
  verifyMembership: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: (...args: Parameters<typeof mocks.connection>) =>
    mocks.connection(...args),
}));

const attachedAssignee = {
  user_id: 'attached-user-id',
  users: {
    id: 'attached-user-id',
    display_name: 'Attached Person',
    handle: 'attached',
    avatar_url: 'https://example.com/attached.png',
  },
};

const resultsByTable: Record<string, () => unknown> = {
  task_assignees: () => [attachedAssignee],
  task_labels: () => [
    {
      label_id: 'attached-label-id',
      workspace_task_labels: {
        id: 'attached-label-id',
        name: 'Attached Label',
        color: '#123456',
        created_at: '2026-08-01T00:00:00.000Z',
      },
    },
  ],
  task_lists: () => [
    {
      id: 'list-id',
      name: 'Current List',
      archived: false,
      deleted: false,
      board_id: 'board-id',
      creator_id: 'creator-id',
      status: 'not_started',
      color: 'GRAY',
      position: 1,
      created_at: '2026-08-01T00:00:00.000Z',
    },
    {
      id: 'unrelated-list-id',
      name: 'Unrelated Secret List',
      archived: false,
      deleted: false,
      board_id: 'board-id',
      creator_id: 'creator-id',
      status: 'not_started',
      color: 'GRAY',
      position: 2,
      created_at: '2026-08-01T00:00:00.000Z',
    },
  ],
  task_project_tasks: () => [
    {
      project_id: 'attached-project-id',
      task_projects: {
        id: 'attached-project-id',
        name: 'Attached Project',
        status: 'active',
      },
    },
  ],
  task_projects: () => [
    {
      id: 'unrelated-project-id',
      name: 'Unrelated Secret Project',
      status: 'active',
    },
  ],
  task_share_link_uses: () => [{ id: 'recent-use-id' }],
  workspace_task_labels: () => [
    {
      id: 'unrelated-label-id',
      name: 'Unrelated Secret Label',
      color: '#654321',
      created_at: '2026-08-01T00:00:00.000Z',
    },
  ],
};

class QueryBuilder implements PromiseLike<{ data: unknown; error: null }> {
  constructor(private readonly table: string) {}

  select() {
    return this;
  }

  eq() {
    return this;
  }

  gte() {
    return this;
  }

  or() {
    return this;
  }

  order() {
    return this;
  }

  insert() {
    return Promise.resolve({ data: null, error: null });
  }

  single() {
    if (this.table === 'task_share_links') {
      return Promise.resolve({ data: mocks.shareLink, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  }

  maybeSingle() {
    if (this.table === 'user_private_details') {
      return Promise.resolve({ data: { email: 'viewer@example.com' } });
    }
    if (this.table === 'task_shares') {
      return Promise.resolve({
        data: mocks.sharePermission
          ? { permission: mocks.sharePermission }
          : null,
      });
    }
    if (this.table === 'task_share_link_uses') {
      return Promise.resolve({ data: { id: 'recent-use-id' } });
    }
    return Promise.resolve({ data: null });
  }

  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: unknown;
          error: null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    const value = {
      data: resultsByTable[this.table]?.() ?? [],
      error: null,
    };
    return Promise.resolve(value).then(onfulfilled, onrejected);
  }
}

const adminClient = {
  from: vi.fn((table: string) => {
    mocks.queryTables.push(table);
    return new QueryBuilder(table);
  }),
  rpc: (...args: Parameters<typeof mocks.rpc>) => mocks.rpc(...args),
};

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => adminClient),
  createClient: vi.fn(async () => ({ auth: {} })),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyMembership>
  ) => mocks.verifyMembership(...args),
}));

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveUser>
  ) => mocks.resolveUser(...args),
}));

import { GET } from './route';

function request() {
  return new NextRequest(
    'https://tasks.tuturuuu.com/api/v1/shared/tasks/share-code'
  );
}

function context() {
  return { params: Promise.resolve({ shareCode: 'share-code' }) };
}

function serialized(body: unknown) {
  return JSON.stringify(body);
}

describe('shared task GET permission-shaped responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryTables.length = 0;
    mocks.membership = { ok: false, type: null };
    mocks.sharePermission = null;
    mocks.shareLink = {
      id: 'share-link-id',
      task_id: 'task-id',
      code: 'share-code',
      public_access: 'view',
      requires_invite: false,
      created_at: '2026-08-01T00:00:00.000Z',
      tasks: {
        id: 'task-id',
        name: 'Shared Task',
        description: 'Visible description',
        priority: 'normal',
        start_date: null,
        end_date: null,
        created_at: '2026-08-01T00:00:00.000Z',
        completed_at: null,
        closed_at: null,
        estimation_points: 2,
        display_number: 7,
        list_id: 'list-id',
        task_lists: {
          id: 'list-id',
          name: 'Current List',
          workspace_boards: {
            id: 'board-id',
            name: 'Shared Board',
            ws_id: 'workspace-id',
            ticket_prefix: 'TASK',
            estimation_type: 'fibonacci',
            extended_estimation: false,
            allow_zero_estimates: false,
            workspaces: { id: 'workspace-id', name: 'Shared Workspace' },
          },
        },
      },
    };
    mocks.resolveUser.mockResolvedValue({
      user: { id: 'viewer-id' },
      authError: null,
    });
    mocks.verifyMembership.mockImplementation(async () => mocks.membership);
    mocks.rpc.mockResolvedValue({
      data: [
        {
          user_id: 'unrelated-member-id',
          display_name: 'Unrelated Secret Person',
          avatar_url: 'https://example.com/unrelated-secret.png',
        },
      ],
      error: null,
    });
  });

  it.each([
    ['public viewer', null],
    ['view invitee', 'view' as const],
  ])('returns a minimal response for a %s', async (_label, permission) => {
    mocks.sharePermission = permission;

    const response = await GET(request(), context());
    const body = await response.json();
    const json = serialized(body);

    expect(response.status).toBe(200);
    expect(body.permission).toBe('view');
    expect(body.task.assignees).toEqual([
      expect.objectContaining({ display_name: 'Attached Person' }),
    ]);
    expect(body.task.labels).toEqual([
      expect.objectContaining({ name: 'Attached Label' }),
    ]);
    expect(body.task.projects).toEqual([
      expect.objectContaining({ name: 'Attached Project' }),
    ]);
    expect(body).not.toHaveProperty('availableLists');
    expect(body).not.toHaveProperty('workspaceLabels');
    expect(body).not.toHaveProperty('workspaceProjects');
    expect(body).not.toHaveProperty('workspaceMembers');
    expect(json).not.toContain('Unrelated Secret List');
    expect(json).not.toContain('Unrelated Secret Label');
    expect(json).not.toContain('Unrelated Secret Project');
    expect(json).not.toContain('unrelated-member-id');
    expect(json).not.toContain('Unrelated Secret Person');
    expect(json).not.toContain('unrelated-secret.png');
    expect(mocks.queryTables).not.toContain('task_lists');
    expect(mocks.queryTables).not.toContain('workspace_task_labels');
    expect(mocks.queryTables).not.toContain('task_projects');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['workspace editor', true, null],
    ['edit invitee', false, 'edit' as const],
  ])(
    'returns bounded editing catalogs for a %s',
    async (_label, member, permission) => {
      mocks.membership = { ok: member, type: member ? 'MEMBER' : null };
      mocks.sharePermission = permission;

      const response = await GET(request(), context());
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.permission).toBe('edit');
      expect(body.availableLists).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'unrelated-list-id' }),
        ])
      );
      expect(body.workspaceLabels).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'unrelated-label-id' }),
        ])
      );
      expect(body.workspaceProjects).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'unrelated-project-id' }),
        ])
      );
      expect(body.workspaceMembers).toEqual([
        expect.objectContaining({ id: 'unrelated-member-id' }),
      ]);
      expect(mocks.rpc).toHaveBeenCalledWith(
        'get_task_board_workspace_members',
        { p_ws_id: 'workspace-id' }
      );
    }
  );

  it('denies an uninvited caller when the link requires an invite', async () => {
    mocks.shareLink.requires_invite = true;

    const response = await GET(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.queryTables).not.toContain('task_assignees');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects an anonymous caller before reading shared-task data', async () => {
    mocks.resolveUser.mockResolvedValueOnce({ user: null, authError: null });

    const response = await GET(request(), context());

    expect(response.status).toBe(401);
    expect(adminClient.from).not.toHaveBeenCalled();
  });
});
