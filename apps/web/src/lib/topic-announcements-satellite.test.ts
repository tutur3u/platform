import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createScheduleFixture,
  K1,
  OTHER_WS,
  SUPERVISOR,
  T1,
  WS,
} from './topic-schedule/schedule-fixture.test-helper';

const mocks = vi.hoisted(() => ({
  admin: null as ReturnType<typeof createScheduleFixture> | null,
  authenticated: true,
  member: true,
  manager: true,
  enabled: true,
  teacherAssignments: false,
}));
// Identity verification is synthetic; no credentials or network are used.
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: vi.fn(
    async (
      _request: Request,
      options?: { allowAppSessionAuth?: { targetApp?: readonly string[] } }
    ) => {
      if (
        !mocks.authenticated ||
        !options?.allowAppSessionAuth?.targetApp?.includes('contacts')
      ) {
        return {
          ok: false,
          response: NextResponse.json(
            { message: 'Unauthorized' },
            { status: 401 }
          ),
        };
      }
      return { ok: true, user: { id: SUPERVISOR }, supabase: mocks.admin };
    }
  ),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.admin),
  createClient: vi.fn(async () => ({})),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(async () => ({ user: null })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(
    async ({ user, wsId }: { user?: { id: string }; wsId: string }) =>
      user?.id === SUPERVISOR && wsId === WS && mocks.member
        ? {
            withoutPermission: (permission: string) =>
              !(mocks.manager && permission === 'manage_users'),
          }
        : null
  ),
  normalizeWorkspaceId: vi.fn(async (wsId: string) => wsId),
  getSecret: (name: string, rows: { name: string; value: string }[]) =>
    rows.find((row) => row.name === name),
  getSecrets: vi.fn(async () => [
    { name: 'ENABLE_TOPIC_ANNOUNCEMENTS', value: String(mocks.enabled) },
    {
      name: 'ENABLE_TOPIC_TEACHER_ASSIGNMENTS',
      value: String(mocks.teacherAssignments),
    },
  ]),
}));
vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
  WorkspaceStorageError: class extends Error {},
}));

import { getPermissions, getSecrets } from '@tuturuuu/utils/workspace-helper';
import { GET as SCHEDULE } from '@/app/api/v1/workspaces/[wsId]/topic-announcements/schedule/route';
import {
  POST as ADD_CONTACT,
  GET as CONTACTS,
} from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/contacts/route';
import { GET as TEMPLATES } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/templates/route';
import { resolveSessionAuthContext } from './api-auth';

const params = { params: Promise.resolve({ wsId: WS }) };
// The Web destination of a Contacts external rewrite; Origin remains Contacts.
function forwarded(suffix: string, body?: unknown) {
  return new Request(
    `https://web.example.test/api/v1/workspaces/${WS}/topic-announcements/${suffix}`,
    {
      headers: { origin: 'https://contacts.example.test' },
      ...(body === undefined
        ? {}
        : { method: 'POST', body: JSON.stringify(body) }),
    }
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin = createScheduleFixture();
  mocks.authenticated = mocks.member = mocks.manager = mocks.enabled = true;
  mocks.teacherAssignments = false;
});

describe('Contacts-proxied topic APIs with teacher assignments off', () => {
  it('loads contacts rather than showing an empty list', async () => {
    const request = forwarded('contacts');
    const response = await CONTACTS(request, params);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Anna' })])
    );
    expect(resolveSessionAuthContext).toHaveBeenCalledWith(request, {
      allowAppSessionAuth: expect.objectContaining({
        targetApp: expect.arrayContaining(['contacts']),
      }),
    });
    expect(getPermissions).toHaveBeenCalledWith({
      user: { id: SUPERVISOR },
      wsId: WS,
    });
  });
  it('loads templates without opting into teacher assignments', async () => {
    if (mocks.admin)
      mocks.admin.tables.topic_announcement_templates = [
        {
          id: 'template',
          ws_id: WS,
          name: 'Fixture template',
          archived: false,
        },
      ];
    const response = await TEMPLATES(forwarded('templates'), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Fixture template' }),
      ])
    );
  });
  it('persists Add contact with the verified actor and workspace', async () => {
    const response = await ADD_CONTACT(
      forwarded('contacts', {
        name: 'Fixture contact',
        email: 'new@example.test',
      }),
      params
    );
    expect(response.status).toBe(201);
    expect(mocks.admin?.tables.topic_announcement_contacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Fixture contact',
          created_by: SUPERVISOR,
          ws_id: WS,
        }),
      ])
    );
  });
  it.each(['contacts', 'templates'])(
    'denies a nonmember on %s',
    async (suffix) => {
      mocks.member = false;
      const handler = suffix === 'contacts' ? CONTACTS : TEMPLATES;
      expect((await handler(forwarded(suffix), params)).status).toBe(404);
      expect(getSecrets).not.toHaveBeenCalled();
    }
  );
  it('denies a member without manage_users', async () => {
    mocks.manager = false;
    expect((await CONTACTS(forwarded('contacts'), params)).status).toBe(403);
  });
  it('rejects unverified identity before reading feature flags', async () => {
    mocks.authenticated = false;
    expect((await CONTACTS(forwarded('contacts'), params)).status).toBe(401);
    expect(getSecrets).not.toHaveBeenCalled();
  });
  it('does not authorize a different workspace', async () => {
    expect(
      (
        await CONTACTS(forwarded('contacts'), {
          params: Promise.resolve({ wsId: OTHER_WS }),
        })
      ).status
    ).toBe(404);
  });
  it('keeps the master flag off fence', async () => {
    mocks.enabled = false;
    expect((await TEMPLATES(forwarded('templates'), params)).status).toBe(404);
  });
  it('keeps personal workspaces denied', async () => {
    if (mocks.admin) mocks.admin.tables.workspaces[0].personal = true;
    expect((await CONTACTS(forwarded('contacts'), params)).status).toBe(404);
  });
});
describe('Contacts-proxied schedule', () => {
  it('loads the month and primary teacher when enabled', async () => {
    mocks.teacherAssignments = true;
    const response = await SCHEDULE(
      forwarded('schedule?month=2026-10'),
      params
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data.classes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: K1, primaryTeacherId: T1 }),
      ])
    );
  });
  it('keeps schedule unavailable with teacher assignments off', async () => {
    expect(
      (await SCHEDULE(forwarded('schedule?month=2026-10'), params)).status
    ).toBe(404);
  });
});
