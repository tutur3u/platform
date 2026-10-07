import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTopicAnnouncementsAccess } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/server-helpers';
import { GET } from './route';

const fixture = vi.hoisted(() => ({
  webActor: false,
  session: 'verified' as 'verified' | 'revoked' | 'wrong-audience',
  member: true,
  enabled: true,
  personal: false,
  manage: true,
  send: true,
  actorId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  getSatelliteAppSessionUser: vi.fn(),
  createAdminClient: vi.fn(),
  effects: [] as string[],
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: fixture.getSatelliteAppSessionUser,
}));
vi.mock('@tuturuuu/utils/topic-announcements', () => ({
  TOPIC_ANNOUNCEMENTS_SECRET: 'TOPIC_ANNOUNCEMENTS_ENABLED',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  // Mirrors the real app-session isolation boundary: it is NOT a Supabase
  // session. Verified satellite identity is available through its own resolver.
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: fixture.webActor ? { id: fixture.actorId } : null },
      }),
    },
  })),
  createAdminClient: fixture.createAdminClient,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async (client: any) => ({
    user: (await client.auth.getUser()).data.user,
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => fixture.workspaceId,
  // Preserve absence of Supabase auth instead of mocking a successful access
  // result around the very satellite-only frontier under investigation.
  getPermissions: async (args: any) =>
    fixture.member && (fixture.webActor || args.user?.id === fixture.actorId)
      ? {
          withoutPermission: (name: string) =>
            name === 'manage_users'
              ? !fixture.manage
              : name === 'send_user_group_post_emails'
                ? !fixture.send
                : false,
        }
      : null,
  getSecrets: async () => [],
  getSecret: () => ({ value: fixture.enabled ? 'true' : 'false' }),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  WorkspaceStorageError: class extends Error {},
}));
vi.mock('@tuturuuu/utils/workspace-user-link', () => ({
  getWorkspaceUserLinkForUser: async () =>
    fixture.member ? { ws_id: fixture.workspaceId } : null,
}));

function admin() {
  const from = (table: string) => {
    const query: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn(async () => ({ data: [], error: null, count: 0 })),
      in: vi.fn(async () => ({
        data: [{ id: '00000000-0000-4000-8000-000000000003' }],
        error: null,
      })),
      maybeSingle: vi.fn(async () => ({
        data: { personal: fixture.personal, name: 'Synthetic workspace' },
        error: null,
      })),
    };
    fixture.effects.push(table);
    return query;
  };
  const client: any = { from, schema: () => client };
  return client;
}
function request(method = 'GET') {
  return new Request(
    `https://contacts.example.test/api/v1/workspaces/${fixture.workspaceId}/topic-announcements`,
    {
      method,
      headers: {
        cookie: fixture.webActor
          ? 'synthetic_supabase_cookie=synthetic-web-fixture'
          : 'tuturuuu_app_session=synthetic-session-fixture',
        'content-type': 'application/json',
      },
      ...(method === 'POST'
        ? {
            body: JSON.stringify({
              contactIds: ['00000000-0000-4000-8000-000000000003'],
              title: 'Synthetic lesson',
              topic: 'Synthetic teacher topic',
            }),
          }
        : {}),
    }
  );
}
const params = () => ({
  params: Promise.resolve({ wsId: fixture.workspaceId }),
});
beforeEach(() => {
  fixture.webActor = false;
  fixture.session = 'verified';
  fixture.member = true;
  fixture.enabled = true;
  fixture.personal = false;
  fixture.manage = true;
  fixture.send = true;
  fixture.effects = [];
  fixture.createAdminClient.mockReset().mockImplementation(async () => admin());
  fixture.getSatelliteAppSessionUser
    .mockReset()
    .mockImplementation(async (app: string) =>
      app === 'contacts' && fixture.session === 'verified'
        ? { id: fixture.actorId, email: 'teacher@example.test' }
        : null
    );
});
describe('existing Web admission controls remain effective', () => {
  beforeEach(() => {
    fixture.webActor = true;
  });
  it('retains authenticated Web list access', async () => {
    expect((await GET(request(), params())).status).toBe(200);
  });
  it.each(['member', 'enabled', 'personal', 'manage', 'send'] as const)(
    'enforces %s before protected content or delivery admission',
    async (control) => {
      if (control === 'personal') fixture.personal = true;
      else fixture[control] = false;
      const access = await resolveTopicAnnouncementsAccess(
        request(),
        fixture.workspaceId,
        { requireManage: true, requireSend: true }
      );
      expect(access.response?.status).toBe(
        control === 'manage' || control === 'send' ? 403 : 404
      );
      expect(fixture.effects).not.toContain('topic_announcements');
    }
  );
});
