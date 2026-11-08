import {
  STANDARD_TUTORING_POLICY,
  serializeTutoringPolicyConfigRows,
} from '@tuturuuu/internal-api/tutoring-policy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const FEEDBACK_ID = '44444444-4444-4444-8444-444444444444';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  admin: vi.fn(),
  granted: new Set<string>(),
  restrict: { value: false },
  flagged: { value: true },
  writes: [] as string[],
}));

vi.mock('@/lib/workspace', () => ({
  getContactsWorkspaceAccess: mocks.access,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));

import * as groupRoute from '../../user-groups/[groupId]/members/[userId]/feedbacks/route';
import * as workspaceRoute from './route';

function chain(result: () => unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result());
  query.like = vi.fn(async () => result());
  return query;
}

function admin() {
  return {
    from: (table: string) => {
      if (table === 'workspace_configs')
        return chain(() => ({
          data: serializeTutoringPolicyConfigRows({
            ...STANDARD_TUTORING_POLICY,
            restrictWeakContentEditors: mocks.restrict.value,
          }),
          error: null,
        }));
      if (table === 'user_feedbacks') {
        const lookup = chain(() => ({
          data: { id: FEEDBACK_ID, require_attention: mocks.flagged.value },
          error: null,
        }));
        const write = (kind: string) => () => ({
          eq: async () => {
            mocks.writes.push(kind);
            return { error: null };
          },
        });
        return {
          ...lookup,
          insert: async () => {
            mocks.writes.push('insert');
            return { error: null };
          },
          update: write('update'),
          delete: write('delete'),
        };
      }
      return chain(() => ({ data: { id: 'found' }, error: null }));
    },
  };
}

const routes = [
  {
    name: 'workspace feedback route',
    module: workspaceRoute,
    params: { wsId: WS_ID },
    url: `https://contacts.tuturuuu.com/api/v1/workspaces/${WS_ID}/users/feedbacks`,
    body: { userId: USER_ID, groupId: GROUP_ID },
  },
  {
    name: 'group member feedback route',
    module: groupRoute,
    params: { wsId: WS_ID, groupId: GROUP_ID, userId: USER_ID },
    url: `https://contacts.tuturuuu.com/api/v1/workspaces/${WS_ID}/user-groups/${GROUP_ID}/members/${USER_ID}/feedbacks`,
    body: {},
  },
] as const;

function call(
  route: (typeof routes)[number],
  method: 'POST' | 'PUT' | 'DELETE',
  body?: Record<string, unknown>
) {
  const url = new URL(route.url);
  if (method !== 'POST') url.searchParams.set('feedbackId', FEEDBACK_ID);
  const request = new Request(url, {
    method,
    body: body ? JSON.stringify({ ...route.body, ...body }) : undefined,
  });
  // Both route modules share the same handler signature.
  const handler = route.module[method] as (
    request: Request,
    context: { params: Promise<typeof route.params> }
  ) => Promise<Response>;
  return handler(request, { params: Promise.resolve(route.params) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.granted = new Set(['view_user_groups', 'update_user_groups_scores']);
  mocks.restrict.value = true;
  mocks.flagged.value = true;
  mocks.writes = [];
  mocks.admin.mockImplementation(async () => admin());
  mocks.access.mockImplementation(async () => ({
    permissions: {
      containsPermission: (permission: string) => mocks.granted.has(permission),
    },
    user: { virtual_user_id: 'creator' },
  }));
});

describe.each(routes)('weak-support content policy via $name', (route) => {
  it('blocks creating, editing and deleting flagged feedback without class management', async () => {
    const flagged = { content: 'Reading', require_attention: true };
    expect((await call(route, 'POST', flagged)).status).toBe(403);
    expect((await call(route, 'PUT', flagged)).status).toBe(403);
    // Editing a flagged entry to unflag it still changes tutoring content.
    expect(
      (await call(route, 'PUT', { content: 'x', require_attention: false }))
        .status
    ).toBe(403);
    expect((await call(route, 'DELETE')).status).toBe(403);
    expect(mocks.writes).toEqual([]);
  });

  it('lets class managers change flagged feedback', async () => {
    mocks.granted.add('update_user_groups');
    const flagged = { content: 'Reading', require_attention: true };
    expect((await call(route, 'POST', flagged)).status).toBe(200);
    expect((await call(route, 'PUT', flagged)).status).toBe(200);
    expect((await call(route, 'DELETE')).status).toBe(200);
    expect(mocks.writes).toEqual(['insert', 'update', 'delete']);
  });

  it('leaves ordinary feedback and unrestricted workspaces alone', async () => {
    mocks.flagged.value = false;
    const plain = { content: 'Great work', require_attention: false };
    expect((await call(route, 'POST', plain)).status).toBe(200);
    expect((await call(route, 'PUT', plain)).status).toBe(200);

    mocks.restrict.value = false;
    mocks.flagged.value = true;
    expect(
      (
        await call(route, 'PUT', {
          content: 'Reading',
          require_attention: true,
        })
      ).status
    ).toBe(200);
    expect(mocks.writes).toEqual(['insert', 'update', 'update']);
  });
});
