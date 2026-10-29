import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  permissions: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: mocks.workspace,
}));
vi.mock('@/lib/post-email-queue', () => ({
  getPostEmailQueueRows: vi.fn().mockResolvedValue([]),
  summarizePostEmailQueue: vi.fn().mockReturnValue({}),
}));

import { GET as webGet } from '../../../../apps/web/src/app/api/v1/workspaces/[wsId]/users/approvals/get';
import { handleGetApprovalsRequest } from '../../src/routes/users/approvals/get';

const WS = '11111111-1111-4111-8111-111111111111';
const FOREIGN_WS = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ wsId: WS }) };
const actor = { id: 'actor', email: 'approver@example.test' };
const checks = [
  {
    post_id: 'post-1',
    user_id: 'user-1',
    userWs: WS,
    postWs: WS,
    name: 'Member 1',
  },
  {
    post_id: 'post-2',
    user_id: 'user-2',
    userWs: FOREIGN_WS,
    postWs: WS,
    name: 'Foreign member',
  },
  {
    post_id: 'post-3',
    user_id: 'user-3',
    userWs: WS,
    postWs: FOREIGN_WS,
    name: 'Foreign post',
  },
  {
    post_id: 'post-4',
    user_id: 'user-4',
    userWs: WS,
    postWs: WS,
    name: 'Member 4',
  },
];
let reads: URL[];
let failLookup: boolean;
const fixtureFetch: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (!url.pathname.endsWith('/user_group_post_checks'))
    return Response.json([]);
  reads.push(url);
  if (failLookup)
    return Response.json({ message: 'Fixture lookup failed' }, { status: 500 });
  const postScope =
    url.searchParams.get('post.workspace_user_groups.ws_id') ??
    url.searchParams.get('user_group_posts.workspace_user_groups.ws_id');
  const userScope = url.searchParams.get('user.ws_id');
  const rows = checks.filter(
    (row) =>
      (!postScope || postScope === `eq.${row.postWs}`) &&
      (!userScope || userScope === `eq.${row.userWs}`)
  );
  const from = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? rows.length);
  const data = rows.slice(from, from + limit).map((row) => ({
    post_id: row.post_id,
    user_id: row.user_id,
    is_completed: true,
    approval_status: 'PENDING',
    user: {
      full_name: row.name,
      display_name: null,
      email: 'fixture@example.test',
    },
    post: {
      id: row.post_id,
      title: 'Lesson',
      content: 'Content',
      group_id: 'group-1',
      workspace_user_groups: { name: 'Group', ws_id: row.postWs },
    },
  }));
  return new Response(init?.method === 'HEAD' ? null : JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
    },
  });
};

beforeEach(async () => {
  vi.clearAllMocks();
  reads = [];
  failLookup = false;
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://fixture.invalid');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.invalid');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-only');
  const actual = await vi.importActual<
    typeof import('@tuturuuu/supabase/next/server')
  >('@tuturuuu/supabase/next/server');
  mocks.admin.mockResolvedValue(
    await actual.createAdminClient({ noCookie: true, fetch: fixtureFetch })
  );
  mocks.workspace.mockResolvedValue(WS);
  mocks.permissions.mockResolvedValue({ containsPermission: () => true });
});
afterEach(() => vi.unstubAllEnvs());

for (const [label, get] of [
  ['shared', (req: Request) => handleGetApprovalsRequest(req, context, actor)],
  ['web', (req: Request) => webGet(req, context)],
] as const) {
  describe(`${label} post approval reads`, () => {
    it('uses the same workspace population for items and counts', async () => {
      const response = await get(
        new Request('https://fixture.invalid/?kind=posts&status=all')
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(
        body.items.map((row: { user_name: string }) => row.user_name)
      ).toEqual(['Member 1', 'Member 4']);
      expect(body.totalCount).toBe(2);
      expect(body.totalPages).toBe(1);
      expect(reads).toHaveLength(2);
      for (const url of reads) {
        expect(url.searchParams.get('select')).toContain(
          'user:workspace_users!user_id!inner'
        );
        expect(url.searchParams.get('user.ws_id')).toBe(`eq.${WS}`);
      }
    });
    it('paginates after both workspace scopes are applied', async () => {
      const body = await (
        await get(
          new Request(
            'https://fixture.invalid/?kind=posts&status=all&page=2&limit=1'
          )
        )
      ).json();
      expect(
        body.items.map((row: { user_name: string }) => row.user_name)
      ).toEqual(['Member 4']);
      expect(body.totalCount).toBe(2);
      expect(body.totalPages).toBe(2);
    });
    it('fails closed on read errors', async () => {
      failLookup = true;
      expect(
        (await get(new Request('https://fixture.invalid/?kind=posts'))).status
      ).toBe(500);
    });
    it('keeps permission denial before reads', async () => {
      mocks.permissions.mockResolvedValue({ containsPermission: () => false });
      expect(
        (await get(new Request('https://fixture.invalid/?kind=posts'))).status
      ).toBe(403);
      expect(reads).toEqual([]);
    });
  });
}
