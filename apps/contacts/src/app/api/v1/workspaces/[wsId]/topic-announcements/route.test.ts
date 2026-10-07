import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as contactsPreview } from './preview/route';
import { GET as contactsGET } from './route';

const fixture = vi.hoisted(() => ({
  webActor: false,
  populated: false,
  queries: [] as Array<[string, string, unknown]>,
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
  const contact = {
    id: '00000000-0000-4000-8000-000000000003',
    archived: false,
    email: 'teacher@example.test',
    name: 'Synthetic teacher',
    tags: [],
    metadata: {},
    created_at: '2026-10-01T00:00:00Z',
    workspace_user_id: null,
  };
  const from = (table: string) => {
    const rows = () =>
      table === 'topic_announcement_recipients'
        ? [{ announcement_id: 'announcement-id', contact }]
        : table === 'topic_announcement_contact_verifications'
          ? [
              {
                contact_id: contact.id,
                status: 'verified',
                expires_at: '2027-01-01T00:00:00Z',
              },
            ]
          : table === 'topic_announcement_attachments'
            ? []
            : [{ id: contact.id }];
    const query: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((key, value) => {
        fixture.queries.push([table, key, value]);
        return query;
      }),
      neq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      range: vi.fn(async () => ({
        data: fixture.populated
          ? [
              {
                id: 'announcement-id',
                ws_id: fixture.workspaceId,
                title: 'Synthetic lesson',
              },
            ]
          : [],
        error: null,
        count: fixture.populated ? 1 : 0,
      })),
      maybeSingle: vi.fn(async () => ({
        data: { personal: fixture.personal, name: 'Synthetic workspace' },
        error: null,
      })),
      // biome-ignore lint/suspicious/noThenProperty: Model the Supabase query builder await contract.
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: rows(), error: null }).then(resolve),
    };
    fixture.effects.push(table);
    return query;
  };
  const client: any = {
    from,
    schema: () => client,
    rpc: vi.fn(async () => ({ data: false, error: null })),
  };
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
  fixture.populated = false;
  fixture.queries = [];
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
describe('actual topic handlers at Contacts-only session boundary', () => {
  it('lists scoped announcements with a verified Contacts session and no Supabase session', async () => {
    const response = await contactsGET(request(), params());
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([]);
    expect(fixture.getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
  });
  it('keeps workspace filtering and verified recipient serialization on the actual shared list path', async () => {
    fixture.populated = true;
    const response = await contactsGET(request(), params());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.count).toBe(1);
    expect(body.data[0].contacts[0]).toMatchObject({
      name: 'Synthetic teacher',
      verificationStatus: 'verified',
    });
    expect(fixture.queries).toContainEqual([
      'topic_announcements',
      'ws_id',
      fixture.workspaceId,
    ]);
  });
  it('previews the authored teacher topic with a verified Contacts-only session', async () => {
    const response = await contactsPreview(request('POST'), params());
    expect(response.status).toBe(200);
    expect((await response.json()).data.text).toContain(
      'Synthetic teacher topic'
    );
    expect(fixture.getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
  });
  it.each(['revoked', 'wrong-audience'] as const)(
    'does not admit a %s satellite identity',
    async (session) => {
      fixture.session = session;
      expect((await contactsGET(request(), params())).status).toBe(404);
      expect(fixture.createAdminClient).not.toHaveBeenCalled();
    }
  );
});

import { resolveContactsTopicAnnouncementsAccess } from '@/lib/topic-announcements-access';

describe('Contacts feature and capability admission', () => {
  it.each(['member', 'enabled', 'personal', 'manage', 'send'] as const)(
    'denies %s without topic reads',
    async (control) => {
      if (control === 'personal') fixture.personal = true;
      else fixture[control] = false;
      const result = await resolveContactsTopicAnnouncementsAccess(
        request(),
        fixture.workspaceId,
        { requireManage: true, requireSend: true }
      );
      expect(result.response?.status).toBe(
        control === 'manage' || control === 'send' ? 403 : 404
      );
      expect(fixture.effects).not.toContain('topic_announcements');
    }
  );
});
