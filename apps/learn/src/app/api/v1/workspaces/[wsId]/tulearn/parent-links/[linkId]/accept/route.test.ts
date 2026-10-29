import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { activeLinkUnique, createFakeSupabase } from '@/test/fake-supabase';

const state = vi.hoisted(() => ({
  admin: null as unknown,
  user: null as { id: string } | null,
}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: async () => state.user,
}));
vi.mock('@tuturuuu/education-core/tulearn/service', () => ({
  hasEducationEnabled: async () => true,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace-a',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => state.admin,
}));

import { POST } from './route';

const LINK_ID = '00000000-0000-4000-8000-0000000000a1';

const link = (overrides: Record<string, unknown> = {}) => ({
  accepted_at: null,
  id: LINK_ID,
  parent_user_id: 'parent',
  revoked_at: null,
  status: 'pending',
  student_platform_user_id: 'student-platform',
  student_workspace_user_id: 'student-ws',
  ws_id: 'workspace-a',
  ...overrides,
});

function setup(rows: Record<string, unknown>[], { bound = true } = {}) {
  state.admin = createFakeSupabase(
    {
      tulearn_parent_student_links: rows,
      workspace_user_linked_users: bound
        ? [
            {
              platform_user_id: 'student-platform',
              virtual_user_id: 'student-ws',
              ws_id: 'workspace-a',
            },
          ]
        : [],
    },
    { unique: { tulearn_parent_student_links: activeLinkUnique } }
  ) as never;
  return state.admin as ReturnType<typeof createFakeSupabase>;
}

function accept(linkId = LINK_ID) {
  return POST(new NextRequest('http://localhost/accept', { method: 'POST' }), {
    params: { linkId, wsId: 'workspace-a' },
  });
}

beforeEach(() => {
  state.user = { id: 'parent' };
});

it('lets the linked parent activate a pending link', async () => {
  const admin = setup([link()]);
  const response = await accept();

  expect(response.status).toBe(200);
  const { link: body } = await response.json();
  expect(body.status).toBe('active');
  expect(body.accepted_at).toEqual(expect.any(String));
  expect(admin.rows('tulearn_parent_student_links')[0]?.status).toBe('active');
});

it('is idempotent for a link that is already active', async () => {
  const acceptedAt = '2026-01-01T00:00:00.000Z';
  const admin = setup([link({ accepted_at: acceptedAt, status: 'active' })]);
  const response = await accept();

  expect(response.status).toBe(200);
  expect((await response.json()).link.accepted_at).toBe(acceptedAt);
  expect(admin.writes).toHaveLength(0);
});

it('does not let another user accept the parent link', async () => {
  state.user = { id: 'someone-else' };
  const admin = setup([link()]);

  expect((await accept()).status).toBe(404);
  expect(admin.rows('tulearn_parent_student_links')[0]?.status).toBe('pending');
});

it('does not let workspace staff accept on the parent behalf', async () => {
  state.user = { id: 'teacher' };
  const admin = setup([link({ created_by: 'teacher' })]);

  expect((await accept()).status).toBe(404);
  expect(admin.writes).toHaveLength(0);
});

it('rejects a link that is not pending', async () => {
  const admin = setup([link({ status: 'revoked' })]);

  expect((await accept()).status).toBe(409);
  expect(admin.rows('tulearn_parent_student_links')[0]?.status).toBe('revoked');
});

it('rejects acceptance after the student identity was re-linked', async () => {
  const admin = setup([link()], { bound: false });

  expect((await accept()).status).toBe(409);
  expect(admin.rows('tulearn_parent_student_links')[0]?.status).toBe('pending');
});

it('requires a signed-in session', async () => {
  state.user = null;
  setup([link()]);

  expect((await accept()).status).toBe(401);
});

it('does not reveal malformed or unknown link ids', async () => {
  setup([link()]);

  expect((await accept('not-a-uuid')).status).toBe(404);
  expect((await accept('00000000-0000-4000-8000-0000000000ff')).status).toBe(
    404
  );
});
