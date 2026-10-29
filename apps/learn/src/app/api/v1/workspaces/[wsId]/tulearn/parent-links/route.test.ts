import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { activeLinkUnique, createFakeSupabase } from '@/test/fake-supabase';

const state = vi.hoisted(() => ({
  admin: null as unknown,
  fromWorkspace: vi.fn(),
  send: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: unknown,
        params: unknown
      ) => unknown
    ) =>
    (request: NextRequest, route: { params: unknown }) =>
      handler(request, { user: { id: 'actor' }, supabase: {} }, route.params),
}));
vi.mock('@tuturuuu/education-core/tulearn/service', () => ({
  hasEducationEnabled: async () => true,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace-a',
  getPermissions: async () => ({ containsPermission: () => true }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => state.admin,
}));
vi.mock('@tuturuuu/email-service', () => ({
  EmailService: { fromWorkspace: state.fromWorkspace },
}));

import { POST } from './route';

const STUDENT_WS_USER = '00000000-0000-4000-8000-000000000001';
const STUDENT_PLATFORM = '00000000-0000-4000-8000-000000000002';
const PARENT = '00000000-0000-4000-8000-000000000003';
const ROOT_WORKSPACE = '00000000-0000-0000-0000-000000000000';

type Rows = Record<string, Record<string, unknown>[]>;

function setup(overrides: Rows = {}, { linked = true } = {}) {
  const admin = createFakeSupabase(
    {
      tulearn_parent_invites: [],
      tulearn_parent_student_links: [],
      workspace_email_credentials: [],
      workspace_user_linked_users: linked
        ? [
            {
              platform_user_id: STUDENT_PLATFORM,
              virtual_user_id: STUDENT_WS_USER,
              ws_id: 'workspace-a',
            },
          ]
        : [],
      workspace_users: [{ id: STUDENT_WS_USER, ws_id: 'workspace-a' }],
      ...overrides,
    },
    {
      defaults: { tulearn_parent_invites: { status: 'pending' } },
      unique: { tulearn_parent_student_links: activeLinkUnique },
    }
  );
  state.admin = admin;
  return admin;
}

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/parent-links', {
      method: 'POST',
      body: JSON.stringify({
        studentWorkspaceUserId: STUDENT_WS_USER,
        studentPlatformUserId: STUDENT_PLATFORM,
        ...body,
      }),
    }),
    { params: { wsId: 'workspace-a' } }
  );
}

beforeEach(() => {
  state.send.mockReset().mockResolvedValue({ success: true });
  state.fromWorkspace.mockReset().mockResolvedValue({ send: state.send });
});

it('rejects a platform identity not linked to the student in this workspace', async () => {
  const admin = setup({}, { linked: false });
  expect((await post({ parentUserId: PARENT })).status).toBe(404);
  expect(admin.writes).toHaveLength(0);
});

it('creates the direct link as pending without an acceptance timestamp', async () => {
  const admin = setup();
  const response = await post({ parentUserId: PARENT });

  expect(response.status).toBe(201);
  const { link } = await response.json();
  expect(link).toMatchObject({
    accepted_at: null,
    created_by: 'actor',
    parent_user_id: PARENT,
    status: 'pending',
    student_platform_user_id: STUDENT_PLATFORM,
  });
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(1);
});

it('never rewrites an existing active link', async () => {
  const existing = {
    accepted_at: '2026-01-01T00:00:00.000Z',
    id: 'link-1',
    parent_user_id: PARENT,
    status: 'active',
    student_platform_user_id: 'older-platform-user',
    student_workspace_user_id: STUDENT_WS_USER,
    ws_id: 'workspace-a',
  };
  const admin = setup({ tulearn_parent_student_links: [{ ...existing }] });
  const response = await post({ parentUserId: PARENT });

  expect(response.status).toBe(200);
  expect(admin.writes).toHaveLength(0);
  expect(admin.rows('tulearn_parent_student_links')).toEqual([existing]);
});

it('does not create a duplicate pending link', async () => {
  const admin = setup({
    tulearn_parent_student_links: [
      {
        accepted_at: null,
        id: 'link-1',
        parent_user_id: PARENT,
        status: 'pending',
        student_platform_user_id: STUDENT_PLATFORM,
        student_workspace_user_id: STUDENT_WS_USER,
        ws_id: 'workspace-a',
      },
    ],
  });
  const response = await post({ parentUserId: PARENT });

  expect(response.status).toBe(200);
  expect((await response.json()).link.id).toBe('link-1');
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(1);
});

it('emails the invite token to the parent and never returns it', async () => {
  const admin = setup();
  const response = await post({ parentEmail: 'Parent@Example.com' });
  const bodyText = await response.text();

  expect(response.status).toBe(201);
  expect(state.send).toHaveBeenCalledOnce();
  const [{ content, metadata, recipients }] = state.send.mock.calls[0] ?? [];
  expect(metadata).toMatchObject({
    isInvite: true,
    templateType: 'tulearn-parent-invite',
    wsId: 'workspace-a',
  });
  expect(recipients).toEqual({ to: ['Parent@Example.com'] });

  const token = /token=([0-9a-f]{64})/.exec(content.html)?.[1];
  expect(token).toBeDefined();
  expect(bodyText).not.toContain(token);
  expect(JSON.parse(bodyText)).not.toHaveProperty('token');
  expect(JSON.parse(bodyText).invite).not.toHaveProperty('token_hash');

  const [stored] = admin.rows('tulearn_parent_invites');
  expect(stored?.token_hash).toBe(
    createHash('sha256')
      .update(token ?? '')
      .digest('hex')
  );
  expect(stored?.status).toBe('pending');
});

it('sends through the root credentials when the workspace has none of its own', async () => {
  setup();

  expect((await post({ parentEmail: 'parent@example.com' })).status).toBe(201);
  expect(state.fromWorkspace).toHaveBeenCalledWith('workspace-a', {
    credentialWorkspaceId: ROOT_WORKSPACE,
  });
});

it('prefers the workspace own credentials when it has them', async () => {
  setup({ workspace_email_credentials: [{ ws_id: 'workspace-a' }] });

  expect((await post({ parentEmail: 'parent@example.com' })).status).toBe(201);
  expect(state.fromWorkspace).toHaveBeenCalledWith('workspace-a', undefined);
});

it('revokes the invite and reports failure when the email cannot be sent', async () => {
  const admin = setup();
  state.send.mockResolvedValue({
    error: 'smtp down',
    success: false,
  });
  const response = await post({ parentEmail: 'parent@example.com' });

  expect(response.status).toBe(502);
  expect(await response.text()).not.toMatch(/[0-9a-f]{64}/);
  expect(admin.rows('tulearn_parent_invites')[0]?.status).toBe('revoked');
});

it('supersedes older pending invites for the same recipient after sending', async () => {
  const admin = setup({
    tulearn_parent_invites: [
      {
        id: 'old-invite',
        parent_email: 'PARENT@example.com',
        status: 'pending',
        student_workspace_user_id: STUDENT_WS_USER,
        ws_id: 'workspace-a',
      },
      {
        id: 'other-recipient',
        parent_email: 'someone@example.com',
        status: 'pending',
        student_workspace_user_id: STUDENT_WS_USER,
        ws_id: 'workspace-a',
      },
    ],
  });
  expect((await post({ parentEmail: 'parent@example.com' })).status).toBe(201);

  const statusById = Object.fromEntries(
    admin.rows('tulearn_parent_invites').map((row) => [row.id, row.status])
  );
  expect(statusById['old-invite']).toBe('revoked');
  expect(statusById['other-recipient']).toBe('pending');
});
