import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  permissions: vi.fn(),
  membership: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: mocks.from }),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: {
          user: { id: string };
          supabase: { from: typeof mocks.from };
        },
        params: Promise<{ wsId: string }>
      ) => Promise<Response>
    ) =>
    (request: NextRequest, context: { params: Promise<{ wsId: string }> }) =>
      handler(
        request,
        {
          user: { id: 'verified-teach-actor' },
          supabase: { from: mocks.from },
        },
        context.params
      ),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  normalizeWorkspaceId: async () => 'normalized-workspace',
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { POST } from './route';

function post(body: object) {
  return POST(
    new NextRequest(
      'https://tuturuuu.com/teach/api/v1/workspaces/alias/courses',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    ),
    { params: Promise.resolve({ wsId: 'alias' }) }
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.permissions.mockResolvedValue({
    withoutPermission: (permission: string) => permission === 'manage_courses',
  });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockReturnValue({
    select: () => ({
      single: async () => ({ data: { id: 'new-course' }, error: null }),
    }),
  });
});

it('rejects creation with publication from a create-only actor before passing any data to the service client', async () => {
  const response = await post({
    name: 'Draft bypass',
    is_course_published: true,
  });
  expect(response.status).toBe(403);
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.insert).not.toHaveBeenCalled();
});

it('lets create-only staff save a draft and derives creator identity from the session', async () => {
  const response = await post({
    name: 'Course draft',
    creator_id: 'request-supplied-id',
  });
  expect(response.status).toBe(200);
  expect(mocks.insert).toHaveBeenCalledWith({
    name: 'Course draft',
    ws_id: 'normalized-workspace',
    archived: false,
    is_guest: false,
    creator_id: 'verified-teach-actor',
    is_course_published: false,
  });
});

it('lets a staff actor with both permissions publish on creation', async () => {
  mocks.permissions.mockResolvedValue({
    withoutPermission: (permission: string) =>
      permission !== 'create_user_groups' && permission !== 'manage_courses',
  });
  const response = await post({
    name: 'Published course',
    is_course_published: true,
  });
  expect(response.status).toBe(200);
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      creator_id: 'verified-teach-actor',
      is_course_published: true,
    })
  );
});
