import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  enqueue: vi.fn(),
  getExistingStates: vi.fn(),
  getPermissions: vi.fn(),
  hasPost: vi.fn(),
  recordChanges: vi.fn(),
  resolveActor: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../src/lib/post-check-audit', () => ({
  getExistingPostCheckStates: mocks.getExistingStates,
  recordPostCheckChanges: mocks.recordChanges,
}));
vi.mock('../../src/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.getPermissions,
}));
vi.mock('../../src/lib/user-groups/route-helpers', () => ({
  hasUserGroupPostInWorkspace: mocks.hasPost,
  resolveRequestActorAuthUid: mocks.resolveActor,
  resolveUserGroupRouteWorkspaceId: mocks.resolveWorkspaceId,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.resolveWorkspaceId,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn().mockResolvedValue({ user: null }),
}));
vi.mock('@/lib/post-email-queue', () => ({
  enqueueApprovedPostEmails: mocks.enqueue,
}));
vi.mock('@/lib/post-email-queue/enqueue-access', () => ({
  resolvePostEmailEnqueueAccess: vi.fn().mockResolvedValue({ allowed: true }),
}));

import {
  DELETE as WEB_DELETE,
  PUT as WEB_PUT,
} from '../../../../apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/[postId]/route';
import { POST as WEB_POST } from '../../../../apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/group-checks/route';
import {
  DELETE,
  PUT,
} from '../../src/routes/user-groups/[groupId]/group-checks/[postId]/route';
import { POST } from '../../src/routes/user-groups/[groupId]/group-checks/route';

const WS = '11111111-1111-4111-8111-111111111111';
const GROUP = '22222222-2222-4222-8222-222222222222';
const POST_ID = '33333333-3333-4333-8333-333333333333';
const MEMBER = '44444444-4444-4444-8444-444444444444';
const OTHER = '55555555-5555-4555-8555-555555555555';
const OTHER_WS = '66666666-6666-4666-8666-666666666666';
const OTHER_GROUP = '77777777-7777-4777-8777-777777777777';
const context = {
  params: Promise.resolve({ wsId: WS, groupId: GROUP, postId: POST_ID }),
};

type Participant = { userId: string; wsId: string; groupId: string };
let participants: Participant[];
let lookupError: boolean;
let mutations: string[];
let membershipReads: URL[];

const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.pathname === '/rest/v1/workspace_user_groups_users') {
    membershipReads.push(url);
    if (lookupError) {
      return Response.json(
        { message: 'Fixture lookup failed' },
        { status: 500 }
      );
    }
    const selected = participants.filter(
      (row) =>
        (!url.searchParams.has('group_id') ||
          url.searchParams.get('group_id') === `eq.${row.groupId}`) &&
        (!url.searchParams.has('workspace_users.ws_id') ||
          url.searchParams.get('workspace_users.ws_id') === `eq.${row.wsId}`) &&
        (url.searchParams.get('user_id') ?? '').includes(row.userId)
    );
    return Response.json(selected.map((row) => ({ user_id: row.userId })));
  }
  if (url.pathname === '/rest/v1/user_group_posts') {
    return Response.json((await mocks.hasPost()) ? { id: POST_ID } : null);
  }
  expect(url.pathname).toBe('/rest/v1/user_group_post_checks');
  expect(new Headers(init?.headers).get('content-profile')).toBe('private');
  mutations.push(init?.method ?? 'GET');
  return new Response(null, { status: 204 });
};

type Surface = {
  label: string;
  POST: typeof POST;
  PUT: typeof PUT;
  DELETE: typeof DELETE;
};
let surface: Surface;
async function invoke(
  method: 'POST' | 'PUT' | 'DELETE',
  userIds: string[],
  single = false
) {
  const checks = userIds.map((user_id) => ({
    user_id,
    is_completed: true,
    ...(method === 'POST' ? { post_id: POST_ID } : {}),
  }));
  const req = new Request('https://fixture.invalid/group-checks', {
    method,
    body: JSON.stringify(
      method === 'DELETE'
        ? single
          ? { user_id: userIds[0] }
          : { user_ids: userIds }
        : single
          ? checks[0]
          : checks
    ),
  });
  if (method === 'POST') return surface.POST(req, context);
  if (method === 'PUT') return surface.PUT(req, context);
  return surface.DELETE(req, context);
}

describe('group-check participant validation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://fixture.invalid');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.invalid');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-only');
    participants = [{ userId: MEMBER, wsId: WS, groupId: GROUP }];
    lookupError = false;
    mutations = [];
    membershipReads = [];
    const actual = await vi.importActual<
      typeof import('@tuturuuu/supabase/next/server')
    >('@tuturuuu/supabase/next/server');
    mocks.createAdminClient.mockResolvedValue(
      await actual.createAdminClient({ noCookie: true, fetch: fixtureFetch })
    );
    mocks.getExistingStates.mockResolvedValue(new Map());
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => false });
    mocks.hasPost.mockResolvedValue(true);
    mocks.resolveWorkspaceId.mockResolvedValue(WS);
    mocks.resolveActor.mockResolvedValue(null);
  });
  afterEach(() => vi.unstubAllEnvs());

  for (const target of [
    { label: 'shared', POST, PUT, DELETE },
    { label: 'web', POST: WEB_POST, PUT: WEB_PUT, DELETE: WEB_DELETE },
  ]) {
    describe(target.label, () => {
      beforeEach(() => {
        surface = target;
      });
      for (const method of ['POST', 'PUT', 'DELETE'] as const) {
        describe(method, () => {
          it.each([
            { label: 'another group', wsId: WS, groupId: OTHER_GROUP },
            { label: 'another workspace', wsId: OTHER_WS, groupId: GROUP },
            { label: 'guest group', wsId: WS, groupId: OTHER_GROUP },
          ])(
            'rejects the entire batch for $label',
            async ({ wsId, groupId }) => {
              participants.push({ userId: OTHER, wsId, groupId });
              const response = await invoke(method, [MEMBER, OTHER]);
              expect(response.status).toBe(400);
              expect(mutations).toEqual([]);
              expect(mocks.enqueue).not.toHaveBeenCalled();
              expect(mocks.getExistingStates).not.toHaveBeenCalled();
              expect(mocks.recordChanges).not.toHaveBeenCalled();
            }
          );

          it('rejects a missing participant', async () => {
            const response = await invoke(method, [OTHER]);
            expect(response.status).toBe(400);
            expect(mutations).toEqual([]);
            expect(mocks.enqueue).not.toHaveBeenCalled();
            expect(mocks.recordChanges).not.toHaveBeenCalled();
          });

          it('fails closed when participant resolution fails', async () => {
            lookupError = true;
            const response = await invoke(method, [MEMBER]);
            expect(response.status).toBe(500);
            expect(mutations).toEqual([]);
            expect(mocks.enqueue).not.toHaveBeenCalled();
            expect(mocks.getExistingStates).not.toHaveBeenCalled();
            expect(mocks.recordChanges).not.toHaveBeenCalled();
          });

          it('accepts members and validates both request scopes', async () => {
            participants.push({ userId: OTHER, wsId: WS, groupId: GROUP });
            const response = await invoke(method, [MEMBER, OTHER]);
            expect(response.status).toBe(200);
            expect(mutations).toEqual([
              method === 'DELETE' ? 'DELETE' : 'POST',
            ]);
            expect(membershipReads).toHaveLength(1);
            expect(membershipReads[0]?.searchParams.get('group_id')).toBe(
              `eq.${GROUP}`
            );
            expect(
              membershipReads[0]?.searchParams.get('workspace_users.ws_id')
            ).toBe(`eq.${WS}`);
            expect(membershipReads[0]?.searchParams.get('select')).toContain(
              'workspace_users!inner'
            );
            expect(mocks.recordChanges).toHaveBeenCalledTimes(
              target.label === 'web' && method === 'POST' ? 0 : 1
            );
            expect(mocks.enqueue).toHaveBeenCalledTimes(
              target.label === 'web' && method !== 'DELETE' ? 1 : 0
            );
          });

          it('accepts a single member payload', async () => {
            expect((await invoke(method, [MEMBER], true)).status).toBe(200);
            expect(mutations).toHaveLength(1);
          });

          it('rejects a single nonmember payload', async () => {
            expect((await invoke(method, [OTHER], true)).status).toBe(400);
            expect(mutations).toEqual([]);
            expect(mocks.enqueue).not.toHaveBeenCalled();
          });

          it.each([true, false])(
            'validates every lookup page before writes (valid=%s)',
            async (valid) => {
              const ids = Array.from(
                { length: 201 },
                (_, i) =>
                  `88888888-8888-4888-8888-${i.toString(16).padStart(12, '0')}`
              );
              participants = ids.map((userId, i) => ({
                userId,
                wsId: WS,
                groupId: !valid && i === 200 ? OTHER_GROUP : GROUP,
              }));
              expect((await invoke(method, ids)).status).toBe(
                valid ? 200 : 400
              );
              expect(membershipReads).toHaveLength(2);
              expect(mutations).toHaveLength(valid ? 1 : 0);
              if (!valid) {
                expect(mocks.getExistingStates).not.toHaveBeenCalled();
                expect(mocks.enqueue).not.toHaveBeenCalled();
              }
            }
          );

          it('keeps the permission gate ahead of participant resolution', async () => {
            mocks.getPermissions.mockResolvedValue({
              withoutPermission: () => true,
            });
            expect((await invoke(method, [MEMBER])).status).toBe(403);
            expect(membershipReads).toEqual([]);
            expect(mutations).toEqual([]);
            expect(mocks.enqueue).not.toHaveBeenCalled();
          });

          it('keeps the post scope gate ahead of participant resolution', async () => {
            mocks.hasPost.mockResolvedValue(false);
            expect((await invoke(method, [MEMBER])).status).toBe(404);
            expect(membershipReads).toEqual([]);
            expect(mutations).toEqual([]);
            expect(mocks.enqueue).not.toHaveBeenCalled();
          });
        });
      }
    });
  }
});
