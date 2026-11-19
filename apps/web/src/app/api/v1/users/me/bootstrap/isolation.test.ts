/**
 * Runs the real section readers against an admin-style in-memory database, which
 * returns whatever a query fails to filter. These tests therefore prove each
 * section is scoped to the verified actor, matches the individual endpoint, and
 * keeps non-member and nonexistent workspaces indistinguishable.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fakeQuery,
  type MemoryDb,
  memorySupabase,
} from '@/lib/current-user/test-support';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const WS_A = '00000000-0000-4000-8000-0000000000a1';
const WS_B = '00000000-0000-4000-8000-0000000000b1';
const WS_GHOST = '00000000-0000-4000-8000-0000000000c1';

const h = vi.hoisted(() => ({
  actor: '',
  db: {} as Record<string, Record<string, unknown>[]>,
  failGuestRead: false,
  failTable: '' as string,
  guestCount: 0,
}));

const readOnlyDb = () => h.db as MemoryDb;
const client = () => {
  const base = memorySupabase(readOnlyDb());
  return {
    from: (table: string) =>
      table === h.failTable
        ? fakeQuery({ data: null, error: { code: 'XX000' } })
        : base.from(table),
  };
};

vi.mock('next/server', async () => ({
  ...(await vi.importActual('next/server')),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: Request,
        context: unknown,
        params: unknown
      ) => Promise<Response>
    ) =>
    async (
      request: Request,
      routeContext?: { params?: Promise<Record<string, string>> }
    ) =>
      handler(
        request,
        {
          supabase: client(),
          user: {
            created_at: 'created',
            email: h.actor === A ? 'a@example.test' : 'b@example.test',
            id: h.actor,
          },
        },
        routeContext?.params ? await routeContext.params : {}
      ),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    ...client(),
    from: (table: string) => {
      if (table === 'workspaces' && h.failGuestRead)
        return fakeQuery({ data: null, error: { code: 'XX000' } });
      if (table !== 'notifications') return client().from(table);
      let filter = '';
      const query: Record<string, unknown> = {
        eq: () => query,
        is: () => query,
        or: (value: string) => {
          filter = value;
          return query;
        },
        select: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({
            count: (h.db.notifications ?? []).filter(
              (row) => `user:${row.user_id}` === filter
            ).length,
            error: null,
          }).then(resolve),
      };
      return query;
    },
  }),
  createDynamicAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => {
  class WorkspaceNotFoundError extends Error {}
  const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value
    );
  return {
    getPermissions: vi.fn(),
    isWorkspaceUuidLiteral: isUuid,
    normalizeWorkspaceId: async (id: string) =>
      isUuid(id)
        ? id
        : ((h.db.workspaces ?? []).find((row) => row.handle === id)?.id ?? id),
    verifyHasSecrets: vi.fn(),
    verifyWorkspaceMembershipType: async ({
      userId,
      wsId,
    }: {
      userId: string;
      wsId: string;
    }) =>
      (h.db.workspace_members ?? []).some(
        (row) => row.ws_id === wsId && row.user_id === userId
      )
        ? { ok: true }
        : { error: 'membership_missing', ok: false },
    WorkspaceNotFoundError,
  };
});
vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
  loadTaskBoardGuestSharesForWorkspace: async () => ({ count: h.guestCount }),
  summarizeTaskBoardGuestShares: (shares: { count: number }) => ({
    boardCount: shares.count,
    highestPermission: 'view',
    landingPath: '/tasks',
  }),
}));
vi.mock('@/lib/workspaces/workspace-deletion', () => ({
  deleteWorkspaceForActor: vi.fn(),
}));
vi.mock('@/legacy-api-routes/v1/notifications/access', () => ({
  buildNotificationAccessFilter: (context: { userId: string }) =>
    `user:${context.userId}`,
  getNotificationAccessContext: async (
    _supabase: unknown,
    user: { id: string }
  ) => ({ userId: user.id }),
}));
vi.mock('@/lib/workspace-invitations/status', () => ({
  listPendingWorkspaceInvitations: async (
    _admin: unknown,
    { authEmail, userId }: { authEmail: string | null; userId: string }
  ) =>
    (h.db.invitations ?? []).filter(
      (row) => row.email === authEmail || row.user_id === userId
    ),
}));
vi.mock('@tuturuuu/ui/lib/workspace-actions', () => ({
  fetchWorkspaceSummaries: async ({ userId }: { userId: string }) =>
    (h.db.workspace_members ?? [])
      .filter((row) => row.user_id === userId)
      .map((row) => ({ id: row.ws_id })),
}));
vi.mock('@/app/api/v1/users/me/hidden-workspaces/board-share-access', () => ({
  hasBoardShareWorkspaceAccess: vi.fn(),
}));

import { GET as getOnboarding } from '@/app/api/v1/user/onboarding-progress/route';
import { GET as getHidden } from '@/app/api/v1/users/me/hidden-workspaces/route';
import { GET as getProfile } from '@/app/api/v1/users/me/profile/route';
import { GET as getUnread } from '@/legacy-api-routes/v1/notifications/unread-count/route';
import { GET as getConfig } from '@/legacy-api-routes/v1/users/me/configs/[configId]/route';
import { GET as getWorkspaces } from '@/legacy-api-routes/v1/workspaces/route';
import { GET as getInvitations } from '@/legacy-api-routes/workspaces/invitations/route';
import { GET as getWorkspace } from '@/app/api/workspaces/[wsId]/route';
import { GET as getBootstrap } from './route';

const SECTIONS =
  'sections=profile,workspace,configs,onboarding,unreadCount,invitations,hiddenWorkspaces,workspaces';
const configIds = 'SORBET_THEME,EXPERIMENTAL_SORBET_UI,SIDEBAR_BEHAVIOR';

function seed(): Record<string, Record<string, unknown>[]> {
  return {
    invitations: [
      { email: 'a@example.test', id: 'invite-a', user_id: null },
      { email: 'b@example.test', id: 'invite-b-secret', user_id: null },
    ],
    notifications: [
      { id: 'n1', user_id: A },
      { id: 'n2', user_id: B },
      { id: 'n3', user_id: B },
    ],
    onboarding_progress: [
      { current_step: 1, user_id: A },
      { current_step: 99, user_id: B },
    ],
    user_configs: [
      { id: 'SORBET_THEME', user_id: A, value: 'a-theme' },
      { id: 'SORBET_THEME', user_id: B, value: 'b-secret-theme' },
      { id: 'SIDEBAR_BEHAVIOR', user_id: B, value: 'b-secret-sidebar' },
      { id: `HIDDEN_WORKSPACE:${WS_A}`, user_id: A, value: 'true' },
      { id: `HIDDEN_WORKSPACE:${WS_B}`, user_id: B, value: 'true' },
    ],
    user_private_details: [
      {
        default_workspace_id: WS_A,
        email: 'a@example.test',
        full_name: 'A Full',
        new_email: null,
        user_id: A,
      },
      {
        default_workspace_id: WS_B,
        email: 'b-secret@example.test',
        full_name: 'B Full',
        new_email: null,
        user_id: B,
      },
    ],
    user_workspace_configs: [
      { id: 'HIDDEN_WORKSPACE', user_id: A, value: 'true', ws_id: WS_A },
      { id: 'HIDDEN_WORKSPACE', user_id: B, value: 'true', ws_id: WS_B },
    ],
    users: [
      {
        avatar_url: null,
        banner_url: null,
        bio: null,
        created_at: 'c',
        display_name: 'Alice',
        handle: 'alice',
        id: A,
      },
      {
        avatar_url: null,
        banner_url: null,
        bio: null,
        created_at: 'c',
        display_name: 'B-secret',
        handle: 'bob',
        id: B,
      },
    ],
    workspace_members: [
      { user_id: A, ws_id: WS_A },
      { user_id: B, ws_id: WS_B },
    ],
    workspaces: [
      { handle: 'team-a', id: WS_A, name: 'Team A' },
      { handle: 'team-b', id: WS_B, name: 'Team B' },
    ],
  };
}

const request = (query: string, expected = h.actor) =>
  new NextRequest(
    `https://example.test/api/v1/users/me/bootstrap?expectedActorId=${expected}&${query}`
  );
const bootstrap = async (query: string) => {
  const response = await getBootstrap(request(query), undefined as never);
  return { body: JSON.parse(await response.clone().text()), response };
};
const individual = async (
  handler: (...args: never[]) => Promise<Response>,
  url: string,
  params?: Record<string, string>
) => {
  const response = await (handler as (...args: unknown[]) => Promise<Response>)(
    new NextRequest(`https://example.test${url}`),
    params ? { params: Promise.resolve(params) } : undefined
  );
  return { body: await response.json(), status: response.status };
};

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.actor = A;
  h.db = seed();
  h.failGuestRead = false;
  h.failTable = '';
  h.guestCount = 0;
});

describe('actor A bootstrap equals the individual endpoints', () => {
  it('returns the same data per section', async () => {
    const { body } = await bootstrap(
      `${SECTIONS}&configs=${configIds}&wsId=${WS_A}&unreadWsId=${WS_A}`
    );
    const s = body.sections;
    const expectSame = (
      section: { data: unknown; ok: boolean },
      other: unknown
    ) => {
      expect(section.ok).toBe(true);
      expect(section.data).toEqual(other);
    };

    expectSame(s.profile, (await individual(getProfile, '/x')).body);
    expectSame(s.onboarding, (await individual(getOnboarding, '/x')).body);
    expectSame(
      s.hiddenWorkspaces,
      (await individual(getHidden, `/x?expectedActorId=${A}`)).body
    );
    expectSame(s.invitations, (await individual(getInvitations, '/x')).body);
    expectSame(s.workspaces, (await individual(getWorkspaces, '/x')).body);
    expectSame(
      s.workspace,
      (await individual(getWorkspace, '/x', { wsId: WS_A })).body
    );
    expectSame(
      s.unreadCount,
      (await individual(getUnread, `/x?wsId=${WS_A}`)).body
    );
    for (const id of configIds.split(',')) {
      expectSame(
        s.configs[id],
        (await individual(getConfig, '/x', { configId: id })).body
      );
    }
    expect(s.configs.SORBET_THEME.data).toEqual({ value: 'a-theme' });
    expect(s.configs.EXPERIMENTAL_SORBET_UI.data).toEqual({ value: null });
  });
});

describe('cross-user isolation', () => {
  it('never returns user B rows to user A in any section', async () => {
    const { body, response } = await bootstrap(
      `${SECTIONS}&configs=${configIds}&wsId=${WS_A}&unreadWsId=${WS_A}`
    );
    const text = JSON.stringify(body);
    for (const secret of [
      'B-secret',
      'b-secret',
      'B Full',
      B,
      WS_B,
      'invite-b-secret',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(body.sections.unreadCount.data).toEqual({ count: 1 });
    expect(body.sections.workspaces.data).toEqual([{ id: WS_A }]);
    expect(body.sections.hiddenWorkspaces.data).toEqual({
      hiddenWorkspaceIds: [WS_A],
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it("returns 403 for unreadWsId set to B's workspace", async () => {
    const { body } = await bootstrap(`sections=unreadCount&unreadWsId=${WS_B}`);
    expect(body.sections.unreadCount).toEqual({
      error: { code: 'forbidden', status: 403 },
      ok: false,
    });
  });

  it("refuses B's workspace id without leaking its row", async () => {
    const { body } = await bootstrap(`sections=workspace&wsId=${WS_B}`);
    expect(body.sections.workspace).toEqual({
      error: { code: 'workspace_unavailable', status: 404 },
      ok: false,
    });
    expect(JSON.stringify(body)).not.toContain('Team B');
  });

  it('refuses to act for another actor with 409 and no B or A data', async () => {
    const response = await getBootstrap(
      request(`${SECTIONS}&configs=${configIds}&wsId=${WS_A}`, B),
      undefined as never
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'Account changed' });
  });
});

describe('workspace section availability', () => {
  const sectionText = async (wsId: string) => {
    const response = await getBootstrap(
      request(`sections=workspace&wsId=${wsId}`),
      undefined as never
    );
    expect(response.status).toBe(200);
    return response.text();
  };

  it('is byte-identical for a non-member and a nonexistent workspace (uuid form)', async () => {
    const nonMember = await sectionText(WS_B);
    const missing = await sectionText(WS_GHOST);
    expect(nonMember).toBe(missing);
    expect(JSON.parse(nonMember).sections.workspace).toEqual({
      error: { code: 'workspace_unavailable', status: 404 },
      ok: false,
    });
  });

  it('is byte-identical for a non-member and a nonexistent workspace (slug form)', async () => {
    const nonMember = await sectionText('team-b');
    const missing = await sectionText('no-such-team');
    expect(nonMember).toBe(missing);
    expect(nonMember).toBe(await sectionText(WS_GHOST));
  });

  it('keeps the guest shape for a board-share guest', async () => {
    h.guestCount = 2;
    const { body } = await bootstrap(`sections=workspace&wsId=${WS_B}`);
    expect(body.sections.workspace).toEqual({
      data: {
        access_type: 'guest',
        guest_board_count: 2,
        guest_highest_permission: 'view',
        guest_landing_path: '/tasks',
        guest_products: ['tasks'],
        handle: 'team-b',
        id: WS_B,
        name: 'Team B',
      },
      ok: true,
    });
  });

  it('keeps a genuine lookup error as failed/500', async () => {
    h.failTable = 'workspaces';
    const { body } = await bootstrap(`sections=workspace&wsId=${WS_A}`);
    expect(body.sections.workspace).toEqual({
      error: { code: 'failed', status: 500 },
      ok: false,
    });
  });

  it("keeps a board-share guest's workspace read error as failed/500", async () => {
    h.guestCount = 2;
    h.failGuestRead = true;
    const { body } = await bootstrap(`sections=workspace&wsId=${WS_B}`);
    expect(body.sections.workspace).toEqual({
      error: { code: 'failed', status: 500 },
      ok: false,
    });
  });
});
