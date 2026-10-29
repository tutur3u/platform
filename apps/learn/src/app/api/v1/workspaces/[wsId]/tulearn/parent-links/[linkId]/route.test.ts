import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';
import { activeLinkUnique, createFakeSupabase } from '@/test/fake-supabase';

const state = vi.hoisted(() => ({ admin: null as unknown }));
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
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'workspace-a',
  getPermissions: async () => ({ containsPermission: () => true }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => state.admin,
}));

import { PATCH } from './route';

const link = (overrides: Record<string, unknown>) => ({
  accepted_at: '2026-01-01T00:00:00.000Z',
  id: 'link-1',
  parent_user_id: 'parent',
  revoked_at: null,
  status: 'active',
  student_workspace_user_id: 'student',
  ws_id: 'workspace-a',
  ...overrides,
});

function patch(
  rows: Record<string, unknown>[],
  status: string,
  invites: Record<string, unknown>[] = []
) {
  const admin = createFakeSupabase(
    { tulearn_parent_invites: invites, tulearn_parent_student_links: rows },
    {
      authUsers: {
        parent: {
          email: 'parent@example.com',
          email_confirmed_at: '2026-01-01T00:00:00.000Z',
        },
      },
      unique: { tulearn_parent_student_links: activeLinkUnique },
    }
  );
  state.admin = admin;
  return {
    admin,
    response: PATCH(
      new NextRequest('http://localhost/parent-links/link-1', {
        body: JSON.stringify({ status }),
        method: 'PATCH',
      }),
      { params: { linkId: 'link-1', wsId: 'workspace-a' } }
    ),
  };
}

it('sends a revoked link back to pending for re-consent, never active', async () => {
  const { admin, response } = patch(
    [link({ revoked_at: '2026-02-01T00:00:00.000Z', status: 'revoked' })],
    'active'
  );
  const res = await response;

  expect(res.status).toBe(200);
  expect((await res.json()).link).toMatchObject({
    accepted_at: null,
    revoked_at: null,
    status: 'pending',
  });
  expect(admin.rows('tulearn_parent_student_links')[0]?.status).toBe('pending');
});

it('also treats an explicit pending request as re-consent', async () => {
  const { response } = patch([link({ status: 'revoked' })], 'pending');
  expect((await (await response).json()).link.status).toBe('pending');
});

it('does not promote a pending link to active', async () => {
  const { admin, response } = patch(
    [link({ accepted_at: null, status: 'pending' })],
    'active'
  );
  const res = await response;

  expect((await res.json()).link.status).toBe('pending');
  expect(admin.writes).toHaveLength(0);
});

it('rejects reactivation while another pending or active link exists', async () => {
  const { admin, response } = patch(
    [
      link({ status: 'revoked' }),
      link({ id: 'link-2', accepted_at: null, status: 'pending' }),
    ],
    'active'
  );

  expect((await response).status).toBe(409);
  expect(admin.rows('tulearn_parent_student_links')[0]?.status).toBe('revoked');
});

it('revokes an active link', async () => {
  const { response } = patch([link({ status: 'active' })], 'revoked');
  const res = await response;

  expect((await res.json()).link).toMatchObject({ status: 'revoked' });
});

it('revokes pending invites for the same parent and learner when revoking a link', async () => {
  const invite = (overrides: Record<string, unknown>) => ({
    id: 'invite',
    parent_email: 'PARENT@example.com',
    status: 'pending',
    student_workspace_user_id: 'student',
    ws_id: 'workspace-a',
    ...overrides,
  });
  const { admin, response } = patch([link({ status: 'active' })], 'revoked', [
    invite({ id: 'same-parent' }),
    invite({ id: 'other-parent', parent_email: 'other@example.com' }),
    invite({ id: 'other-student', student_workspace_user_id: 'student-2' }),
  ]);
  await response;

  const statusById = Object.fromEntries(
    admin.rows('tulearn_parent_invites').map((row) => [row.id, row.status])
  );
  expect(statusById).toEqual({
    'other-parent': 'pending',
    'other-student': 'pending',
    'same-parent': 'revoked',
  });
});
