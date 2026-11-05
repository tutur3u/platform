import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  permissions: vi.fn(),
  admin: vi.fn(),
  posts: vi.fn(),
  send: vi.fn(),
  topicAccess: vi.fn(),
  validateUser: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
  createClient: async () => ({
    rpc: async () => ({ data: true, error: null }),
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: async () => 'ws-a',
}));
vi.mock('../../src/lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('../../src/lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'ws-a',
}));
vi.mock('../../src/lib/posts/data', () => ({
  getWorkspacePostsPageData: mocks.posts,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: 'actor' },
    authError: null,
  }),
}));
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: () => 'unknown',
  isIPBlocked: vi.fn(),
}));
vi.mock('@tuturuuu/email-service', () => ({ sendWorkspaceEmail: mocks.send }));
vi.mock('@/lib/require-attention-users', () => ({
  fetchRequireAttentionUserIds: async () => [],
  withRequireAttentionFlag: (rows: unknown) => rows,
}));
vi.mock('@/lib/user-referrals', () => ({
  listAvailableReferralUsers: vi.fn(),
}));
vi.mock('../../src/lib/user-groups/guest-membership', () => ({
  syncWorkspaceUserGuestMembership: vi.fn(),
}));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: vi.fn(),
}));
vi.mock(
  '../../../../apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/shared',
  async () => {
    const { z } = await import('zod');
    return {
      resolveTopicAnnouncementsAccess: mocks.topicAccess,
      validateTopicAnnouncementWorkspaceUserId: mocks.validateUser,
      TopicAnnouncementContactSchema: z.object({
        workspaceUserId: z.string().nullable(),
        name: z.string(),
      }),
      normalizeEmail: (email: string) => email,
      serializeTopicAnnouncementContact: (row: unknown) => row,
    };
  }
);
vi.mock(
  '../../../../apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/email',
  () => ({ getContactVerificationStatuses: async () => new Map() })
);

import { GET as webLogs } from '../../../../apps/web/src/app/api/v1/workspaces/[wsId]/users/approvals/logs/implementation';
import { PATCH as contact } from '../../../../apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/contacts/[contactId]/route';
import { POST as followUp } from '../../../../apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/[userId]/follow-up/route';
import { GET as referrals } from '../../../../apps/web/src/legacy-api-routes/v1/workspaces/[wsId]/users/[userId]/referrals/route';
import { GET as posts } from '../../src/routes/posts/route';
import { handleGetApprovalLogsRequest as logs } from '../../src/routes/users/approvals/logs';
import { GET as emails } from '../../src/routes/users/user-emails';
import { handleUpdateWorkspaceUserRequest as update } from '../../src/routes/users/workspace-user';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
const writes = vi.fn();
const rpc = vi.fn();
function query(initial: Row[]) {
  let rows = initial;
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => {
      rows = rows.filter(
        (row) =>
          key
            .split('.')
            .reduce<unknown>(
              (current, part) =>
                current && typeof current === 'object'
                  ? Reflect.get(current, part)
                  : undefined,
              row
            ) === value
      );
      return q;
    },
    in: () => q,
    order: () => q,
    range: () => q,
    limit: () => q,
    update: (payload: unknown) => {
      writes(payload);
      return q;
    },
    insert: (payload: unknown) => {
      writes(payload);
      return q;
    },
    single: async () => ({ data: rows[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    // biome-ignore lint/suspicious/noThenProperty: Supabase builders are awaitable.
    then: (
      resolve: (result: { data: Row[]; error: null; count: number }) => unknown
    ) =>
      Promise.resolve(resolve({ data: rows, error: null, count: rows.length })),
  };
  return q;
}
const db = {
  from: vi.fn((name: string) => query(tables[name] ?? [])),
  schema: (_name: string): typeof db => db,
  rpc,
};
function allow(...names: string[]) {
  mocks.permissions.mockResolvedValue({
    wsId: 'ws-a',
    containsPermission: (p: string) => names.includes(p),
    withoutPermission: (p: string) => !names.includes(p),
  });
}
function params(userId = 'user-a') {
  return { params: Promise.resolve({ wsId: 'ws-a', userId }) };
}
const actor = { id: 'actor' };
beforeEach(() => {
  vi.clearAllMocks();
  allow();
  tables = {
    workspace_users: [
      {
        id: 'user-a',
        ws_id: 'ws-a',
        archived: false,
        archived_until: null,
        email: 'synthetic@example.invalid',
        phone: 'test-phone',
        referred_by: 'referrer',
      },
      { id: 'user-b', ws_id: 'ws-b', email: 'foreign@example.invalid' },
    ],
    user_group_posts: [
      {
        id: 'post-a',
        group_id: 'group-a',
        workspace_user_groups: { ws_id: 'ws-a' },
      },
      {
        id: 'post-b',
        group_id: 'group-b',
        workspace_user_groups: { ws_id: 'ws-b' },
      },
    ],
    workspace_user_groups: [
      { id: 'group-a', ws_id: 'ws-a' },
      { id: 'group-b', ws_id: 'ws-b' },
    ],
    user_group_post_logs: [
      { post_id: 'post-a', post_approval_status: 'APPROVED', content: 'own' },
      {
        post_id: 'post-b',
        post_approval_status: 'APPROVED',
        content: 'foreign',
      },
    ],
    topic_announcement_contacts: [{ id: 'contact-a', ws_id: 'ws-a' }],
  };
  mocks.admin.mockResolvedValue(db);
  mocks.posts.mockResolvedValue({
    postsData: { count: 0, data: [] },
    postsStatus: {},
  });
  mocks.topicAccess.mockResolvedValue({
    context: { actorUserId: 'actor', normalizedWsId: 'ws-a', sbAdmin: db },
  });
  mocks.validateUser.mockImplementation(
    async ({ workspaceUserId }: { workspaceUserId: string }) =>
      workspaceUserId === 'user-b'
        ? NextResponse.json(
            { message: 'Invalid workspace user' },
            { status: 400 }
          )
        : null
  );
  rpc.mockResolvedValue({ data: { id: 'user-a' }, error: null });
  mocks.send.mockResolvedValue({ success: true, messageId: 'synthetic' });
});
describe('user read and mutation boundaries', () => {
  it('SR-213 denies post review data to members without post permissions', async () => {
    const response = await posts(new Request('https://example.invalid/posts'), {
      params: Promise.resolve({ wsId: 'ws-a' }),
    });
    expect(response.status).toBe(403);
    expect(mocks.posts).not.toHaveBeenCalled();
  });
  it.each(['view_user_groups_posts', 'approve_posts'])(
    'allows post readers with %s',
    async (permission) => {
      allow(permission);
      expect(
        (
          await posts(new Request('https://example.invalid/posts'), {
            params: Promise.resolve({ wsId: 'ws-a' }),
          })
        ).status
      ).toBe(200);
    }
  );
  for (const [name, getLogs] of [
    ['contacts', (request: Request) => logs(request, params(), actor)],
    ['web', (request: Request) => webLogs(request, params())],
  ] as const) {
    it(`SR-214 denies foreign post logs in ${name}`, async () => {
      allow('approve_posts');
      const response = await getLogs(
        new Request('https://example.invalid/logs?kind=posts&postId=post-b')
      );
      expect(response.status).toBe(404);
    });
    it(`allows own post logs in ${name}`, async () => {
      allow('approve_posts');
      const response = await getLogs(
        new Request('https://example.invalid/logs?kind=posts&postId=post-a')
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ content: 'own' });
    });
  }
  it('masks post review contact fields without private-info permission', async () => {
    allow('view_user_groups_posts');
    mocks.posts.mockResolvedValue({
      postsData: {
        count: 1,
        data: [
          {
            id: 'post-a',
            email: 'synthetic@example.invalid',
            recipient: 'synthetic@example.invalid',
            user_phone: 'test-phone',
          },
        ],
      },
      postsStatus: {},
    });
    const response = await posts(new Request('https://example.invalid/posts'), {
      params: Promise.resolve({ wsId: 'ws-a' }),
    });
    expect((await response.json()).data[0]).toMatchObject({
      id: 'post-a',
      email: null,
      recipient: null,
      user_phone: null,
    });
  });
  it('keeps same-workspace follow-up delivery working', async () => {
    allow('create_lead_generations');
    const response = await followUp(
      new NextRequest('https://example.invalid/follow-up', {
        method: 'POST',
        body: JSON.stringify({ subject: 'Synthetic', content: '<p>Test</p>' }),
      }),
      params()
    );
    expect(response.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledWith(
      'ws-a',
      expect.objectContaining({
        recipients: { to: ['synthetic@example.invalid'] },
      })
    );
  });
  it('SR-215 denies sent email bodies without private-info permission', async () => {
    expect(
      (await emails(new Request('https://example.invalid/emails'), params()))
        .status
    ).toBe(403);
  });
  it('allows sent email readers with private-info permission', async () => {
    allow('view_users_private_info');
    expect(
      (await emails(new Request('https://example.invalid/emails'), params()))
        .status
    ).toBe(200);
  });
  it('SR-216 rejects a foreign recipient before outbound delivery', async () => {
    allow('create_lead_generations');
    const response = await followUp(
      new NextRequest('https://example.invalid/follow-up', {
        method: 'POST',
        body: JSON.stringify({ subject: 'Synthetic', content: '<p>Test</p>' }),
      }),
      params('user-b')
    );
    expect(mocks.send).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });
  it('SR-217 masks referral contact fields for public-info readers', async () => {
    allow('view_users_public_info');
    const response = await referrals(
      new Request('https://example.invalid/referrals'),
      params('referrer')
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBeNull();
    expect(body.data[0].phone).toBeNull();
  });
  it('retains referral contacts for private-info readers', async () => {
    allow('view_users_private_info');
    const body = await (
      await referrals(
        new Request('https://example.invalid/referrals'),
        params('referrer')
      )
    ).json();
    expect(body.data[0].email).toBe('synthetic@example.invalid');
  });
  it('SR-245 validates contact workspace-user links before mutation', async () => {
    const response = await contact(
      new Request('https://example.invalid/contact', {
        method: 'PATCH',
        body: JSON.stringify({ workspaceUserId: 'user-b' }),
      }),
      { params: Promise.resolve({ wsId: 'ws-a', contactId: 'contact-a' }) }
    );
    expect(response.status).toBe(400);
    expect(writes).not.toHaveBeenCalled();
  });
  it('keeps same-workspace contact links working', async () => {
    const response = await contact(
      new Request('https://example.invalid/contact', {
        method: 'PATCH',
        body: JSON.stringify({ workspaceUserId: 'user-a' }),
      }),
      { params: Promise.resolve({ wsId: 'ws-a', contactId: 'contact-a' }) }
    );
    expect(response.status).toBe(200);
    expect(writes).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_user_id: 'user-a' })
    );
  });
  it('SR-258 never forwards a caller supplied primary key to the update RPC', async () => {
    allow('update_users');
    const response = await update(
      new Request('https://example.invalid/user', {
        method: 'PUT',
        body: JSON.stringify({ id: 'replacement', display_name: 'Synthetic' }),
      }),
      params(),
      actor
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      'admin_update_workspace_user_with_audit_actor',
      expect.objectContaining({
        p_user_id: 'user-a',
        p_payload: { display_name: 'Synthetic' },
      })
    );
  });
});
