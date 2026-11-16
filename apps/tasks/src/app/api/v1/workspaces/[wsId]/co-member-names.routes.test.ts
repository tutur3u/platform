import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  coMemberTables,
  createFakeAdmin,
  type FakeTables,
} from '@/test/co-member-admin-fake';

/**
 * D246: task routes resolve nameless co-members to their email as the NAME
 * string, server-side, and only for member viewers of a workspace that does
 * not hide member emails. These tests run the real resolver against an
 * in-memory admin client.
 */

const { WS_ID, VIEWER } = vi.hoisted(() => ({
  WS_ID: '00000000-0000-4000-8000-0000000000a1',
  VIEWER: '00000000-0000-4000-8000-0000000000b1',
}));

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  userClient: null as unknown,
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({ CLI_APP_TARGET_APP: 'cli' }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => mocks.admin,
  createClient: async () => ({}),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({ containsPermission: () => true }),
  normalizeWorkspaceId: async () => WS_ID,
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('@/lib/workspace-helper', () => ({
  normalizeWorkspaceId: async () => WS_ID,
}));
vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: VIEWER },
    authError: null,
    supabase: null,
  }),
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: vi.fn(),
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: { supabase: unknown; user: { id: string } },
        params: Record<string, string>
      ) => Promise<Response>
    ) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<Record<string, string>> }
    ) =>
      handler(
        request,
        { supabase: mocks.userClient, user: { id: VIEWER } },
        (await routeContext?.params) ?? {}
      ),
}));

import { GET as getMyTasks } from '@/app/api/v1/users/me/tasks/route';
import { GET as getProject } from './task-projects/[projectId]/route';
import { GET as getProjectUpdates } from './task-projects/[projectId]/updates/route';
import { GET as listProjects } from './task-projects/route';
import { GET as listInitiatives } from './task-initiatives/route';
import { hydrateLeaderboards } from './task-progress/leaderboards/_leaderboards';

const NAMELESS = '00000000-0000-4000-8000-0000000000c1';
const NAMED = '00000000-0000-4000-8000-0000000000c2';
const EMAIL = 'nameless@example.com';

const nameless = {
  id: NAMELESS,
  display_name: null,
  handle: 'nameless-handle',
  avatar_url: null,
};
const named = {
  id: NAMED,
  display_name: 'Named Lead',
  handle: 'named',
  avatar_url: null,
};

const members = [
  { user_id: VIEWER, type: 'MEMBER' as const },
  { user_id: NAMELESS, type: 'MEMBER' as const },
  { user_id: NAMED, type: 'MEMBER' as const },
];
const emails = [
  { user_id: NAMELESS, email: EMAIL },
  { user_id: NAMED, email: 'named@example.com' },
];

const scenarios = {
  member: coMemberTables({ wsId: WS_ID, members, emails }),
  hidden: coMemberTables({ wsId: WS_ID, hideEmail: true, members, emails }),
  guest: coMemberTables({
    wsId: WS_ID,
    members: [{ user_id: VIEWER, type: 'GUEST' }, ...members.slice(1)],
    emails,
  }),
};

function useTables(scenario: FakeTables, data: FakeTables) {
  mocks.admin = createFakeAdmin({ ...scenario, ...data });
}

function request(path: string) {
  return new NextRequest(`http://localhost${path}`);
}

const params = <Extra extends Record<string, string>>(extra: Extra) => ({
  params: Promise.resolve({ wsId: WS_ID, ...extra }),
});

const projectRow = {
  id: 'project-1',
  ws_id: WS_ID,
  name: 'Project',
  created_at: '2026-11-01T00:00:00Z',
  creator: nameless,
  lead: named,
  task_project_tasks: [],
};

beforeEach(() => {
  mocks.userClient = {};
});

describe('task projects (list, detail)', () => {
  it('shows a nameless creator by email to a member viewer', async () => {
    useTables(scenarios.member, { task_projects: [projectRow] });

    const [project] = (await (
      await listProjects(request('/api'), params({}))
    ).json()) as Array<Record<string, any>>;
    const detail = (await (
      await getProject(request('/api'), params({ projectId: 'project-1' }))
    ).json()) as Record<string, any>;

    for (const body of [project, detail]) {
      expect(body?.creator.display_name).toBe(EMAIL);
      expect(body?.lead.display_name).toBe('Named Lead');
      expect(body?.creator).not.toHaveProperty('email');
    }
  });

  it.each([
    ['the workspace hides member emails', scenarios.hidden],
    ['the viewer is a guest', scenarios.guest],
  ])('keeps the handle when %s', async (_label, scenario) => {
    useTables(scenario, { task_projects: [projectRow] });

    const body = await (await listProjects(request('/api'), params({}))).json();

    expect(body[0].creator.display_name).toBe('nameless-handle');
    expect(JSON.stringify(body)).not.toContain('@example.com');
  });
});

describe('project updates', () => {
  const updateRow = {
    id: 'update-1',
    project_id: 'project-1',
    creator_id: NAMELESS,
    content: 'Shipped',
    created_at: '2026-11-02T00:00:00Z',
    creator: nameless,
    reactions: [
      {
        id: 'r1',
        emoji: '+1',
        user_id: NAMELESS,
        created_at: '2026-11-02T00:00:00Z',
        user: nameless,
      },
    ],
    comments: [],
    attachments: [],
  };

  it('resolves the update creator and reaction users', async () => {
    useTables(scenarios.member, {
      task_projects: [projectRow],
      task_project_updates: [updateRow],
    });

    const body = await (
      await getProjectUpdates(request('/api'), {
        params: Promise.resolve({ wsId: WS_ID, projectId: 'project-1' }),
      })
    ).json();

    expect(body.updates[0].creator.display_name).toBe(EMAIL);
    expect(body.updates[0].reactionGroups[0].users[0].display_name).toBe(EMAIL);
  });

  it('keeps the handle when the workspace hides member emails', async () => {
    useTables(scenarios.hidden, {
      task_projects: [projectRow],
      task_project_updates: [updateRow],
    });

    const body = await (
      await getProjectUpdates(request('/api'), {
        params: Promise.resolve({ wsId: WS_ID, projectId: 'project-1' }),
      })
    ).json();

    expect(body.updates[0].creator.display_name).toBe('nameless-handle');
    expect(JSON.stringify(body)).not.toContain('@example.com');
  });
});

describe('task initiatives', () => {
  const initiativeRow = {
    id: 'initiative-1',
    ws_id: WS_ID,
    name: 'Initiative',
    description: null,
    status: 'active',
    created_at: '2026-11-01T00:00:00Z',
    creator: nameless,
    task_project_initiatives: [],
  };

  it.each([
    ['member viewer', scenarios.member, EMAIL],
    ['hidden emails', scenarios.hidden, 'nameless-handle'],
    ['guest viewer', scenarios.guest, 'nameless-handle'],
  ])('resolves the creator name for a %s', async (_label, scenario, name) => {
    useTables(scenario, { task_initiatives: [initiativeRow] });

    const body = await (
      await listInitiatives(request('/api'), params({}))
    ).json();

    expect(body[0].creator.display_name).toBe(name);
    expect(body[0].creator).not.toHaveProperty('email');
  });
});

describe('my tasks assignees', () => {
  const rpcRow = {
    task_id: 'task-1',
    task_name: 'Task',
    task_end_date: null,
    task_priority: 'normal',
    task_created_at: '2026-11-01T00:00:00Z',
    override_self_managed: null,
    list_data: { id: 'list-1', status: 'active', board: { ws_id: WS_ID } },
    assignees_data: [
      { user: { id: NAMELESS, display_name: null, avatar_url: null } },
      { user: { id: NAMED, display_name: 'Named Lead', avatar_url: null } },
    ],
    labels_data: [],
    projects_data: [],
  };

  async function assigneesFor(scenario: FakeTables) {
    useTables(scenario, {
      users: [{ id: NAMELESS, handle: 'nameless-handle' }],
    });
    const overrides = {
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    };
    mocks.userClient = {
      rpc: async () => ({ data: [rpcRow], error: null }),
      from: () => overrides,
    };
    const body = await (
      await getMyTasks(request(`/api?wsId=${WS_ID}`), params({}))
    ).json();
    return body.upcoming[0].assignees.map(
      (entry: { user: Record<string, unknown> }) => entry.user
    );
  }

  it('shows a nameless co-member by email within the task workspace', async () => {
    expect(await assigneesFor(scenarios.member)).toEqual([
      { id: NAMELESS, display_name: EMAIL, avatar_url: null },
      { id: NAMED, display_name: 'Named Lead', avatar_url: null },
    ]);
  });

  it.each([
    ['the workspace hides member emails', scenarios.hidden],
    ['the viewer is a guest', scenarios.guest],
  ])('falls back to the handle when %s', async (_label, scenario) => {
    const assignees = await assigneesFor(scenario);

    expect(assignees[0].display_name).toBe('nameless-handle');
    expect(JSON.stringify(assignees)).not.toContain('@example.com');
  });
});

describe('task progress leaderboards', () => {
  async function rankingsFor(scenario: FakeTables) {
    const admin = createFakeAdmin({
      ...scenario,
      users: [
        { id: NAMELESS, display_name: null, handle: 'nameless-handle' },
        { id: NAMED, display_name: 'Named Lead', handle: 'named' },
      ],
      task_leaderboard_members: [
        { id: 'm1', user_id: NAMELESS, display_name: null, team_id: null },
        { id: 'm2', user_id: NAMED, display_name: 'Alias', team_id: null },
      ],
      task_leaderboard_teams: [],
      task_progress_entries: [],
    });
    const [leaderboard] = await hydrateLeaderboards(
      {
        sbAdmin: admin as never,
        supabase: {} as never,
        user: { id: VIEWER } as never,
        wsId: WS_ID,
      },
      [{ id: 'lb-1', metric_id: 'metric-1', period_start: '2026-11-01' }]
    );
    return Object.fromEntries(
      ((leaderboard?.rankings ?? []) as Array<Record<string, string>>).map(
        (member) => [member.user_id, member.display_name]
      )
    );
  }

  it('names a member without an alias by email for a member viewer', async () => {
    expect(await rankingsFor(scenarios.member)).toEqual({
      [NAMELESS]: EMAIL,
      [NAMED]: 'Alias',
    });
  });

  it.each([
    ['the workspace hides member emails', scenarios.hidden],
    ['the viewer is a guest', scenarios.guest],
  ])('falls back to the handle when %s', async (_label, scenario) => {
    expect(await rankingsFor(scenario)).toEqual({
      [NAMELESS]: 'nameless-handle',
      [NAMED]: 'Alias',
    });
  });
});
