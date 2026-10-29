import { createHash } from 'node:crypto';
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

const TOKEN = 'a'.repeat(64);
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const future = () => new Date(Date.now() + 60_000).toISOString();

const invite = (overrides: Record<string, unknown> = {}) => ({
  accepted_at: null,
  expires_at: future(),
  id: 'invite-1',
  invited_by: 'teacher',
  parent_email: 'parent@example.com',
  parent_user_id: null,
  status: 'pending',
  student_workspace_user_id: 'student-ws',
  token_hash: hash(TOKEN),
  ws_id: 'workspace-a',
  ...overrides,
});

function setup({
  authUsers = {
    parent: {
      email: 'Parent@Example.com',
      email_confirmed_at: '2026-01-01T00:00:00.000Z',
    },
  } as Record<
    string,
    { email: string | null; email_confirmed_at: string | null }
  >,
  invites = [invite()],
  links = [] as Record<string, unknown>[],
} = {}) {
  const admin = createFakeSupabase(
    {
      tulearn_parent_invites: invites,
      tulearn_parent_student_links: links,
      workspace_user_linked_users: [
        {
          platform_user_id: 'student-platform',
          virtual_user_id: 'student-ws',
          ws_id: 'workspace-a',
        },
      ],
    },
    { authUsers, unique: { tulearn_parent_student_links: activeLinkUnique } }
  );
  state.admin = admin;
  return admin;
}

function accept(token: unknown = TOKEN) {
  return POST(
    new NextRequest('http://localhost/accept', {
      body: JSON.stringify({ token }),
      method: 'POST',
    }),
    { params: { wsId: 'workspace-a' } }
  );
}

beforeEach(() => {
  state.user = { id: 'parent' };
});

it('accepts with a matching verified email (case-insensitive) and creates the active link', async () => {
  const admin = setup();
  const response = await accept();

  expect(response.status).toBe(200);
  expect((await response.json()).link).toMatchObject({
    created_by: 'teacher',
    parent_user_id: 'parent',
    status: 'active',
    student_platform_user_id: 'student-platform',
    student_workspace_user_id: 'student-ws',
  });
  expect(admin.rows('tulearn_parent_invites')[0]).toMatchObject({
    accepted_at: expect.any(String),
    parent_user_id: 'parent',
    status: 'accepted',
  });
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(1);
});

it('activates the parent own pending link instead of duplicating it', async () => {
  const admin = setup({
    links: [
      {
        accepted_at: null,
        id: 'pending-link',
        parent_user_id: 'parent',
        status: 'pending',
        student_platform_user_id: 'student-platform',
        student_workspace_user_id: 'student-ws',
        ws_id: 'workspace-a',
      },
    ],
  });
  const response = await accept();

  expect((await response.json()).link).toMatchObject({
    id: 'pending-link',
    status: 'active',
  });
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(1);
});

it('rejects a verified email that does not match the invited address', async () => {
  const admin = setup({
    authUsers: {
      parent: {
        email: 'other@example.com',
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
      },
    },
  });

  expect((await accept()).status).toBe(403);
  expect(admin.rows('tulearn_parent_invites')[0]?.status).toBe('pending');
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(0);
});

it('rejects a matching but unverified email', async () => {
  const admin = setup({
    authUsers: {
      parent: { email: 'parent@example.com', email_confirmed_at: null },
    },
  });

  expect((await accept()).status).toBe(403);
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(0);
});

it('rejects an expired invite and marks it expired', async () => {
  const admin = setup({
    invites: [
      invite({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    ],
  });

  expect((await accept()).status).toBe(410);
  expect(admin.rows('tulearn_parent_invites')[0]?.status).toBe('expired');
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(0);
});

it('is single-use: another account cannot reuse an accepted invite', async () => {
  const admin = setup({
    authUsers: {
      parent: {
        email: 'parent@example.com',
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
      },
      second: {
        email: 'parent@example.com',
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
      },
    },
  });

  expect((await accept()).status).toBe(200);
  state.user = { id: 'second' };
  expect((await accept()).status).toBe(410);
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(1);
});

it('is idempotent when the same parent repeats the acceptance', async () => {
  const admin = setup();
  const first = await (await accept()).json();
  const second = await accept();

  expect(second.status).toBe(200);
  expect((await second.json()).link.id).toBe(first.link.id);
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(1);
});

it('repairs a missing link when the same parent retries after a partial failure', async () => {
  const admin = setup({
    invites: [invite({ parent_user_id: 'parent', status: 'accepted' })],
  });

  expect((await accept()).status).toBe(200);
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(1);
});

it('lets only one of two concurrent accepts win', async () => {
  const admin = setup({
    authUsers: {
      parent: {
        email: 'parent@example.com',
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
      },
      second: {
        email: 'parent@example.com',
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
      },
    },
  });
  const first = accept();
  state.user = { id: 'second' };
  const second = accept();

  const statuses = (await Promise.all([first, second]))
    .map((response) => response.status)
    .sort();
  expect(statuses).toEqual([200, 410]);
  expect(admin.rows('tulearn_parent_student_links')).toHaveLength(1);
});

it('rejects unknown tokens, malformed tokens and anonymous callers', async () => {
  setup();

  expect((await accept('b'.repeat(64))).status).toBe(404);
  expect((await accept('short')).status).toBe(400);
  state.user = null;
  expect((await accept()).status).toBe(401);
});

it('does not accept a token from a different workspace', async () => {
  setup({ invites: [invite({ ws_id: 'workspace-b' })] });

  expect((await accept()).status).toBe(404);
});
