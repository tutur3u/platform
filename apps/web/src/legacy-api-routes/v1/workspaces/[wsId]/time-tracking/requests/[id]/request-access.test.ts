import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  owner: 'other',
  manager: false,
  membership: true,
  tables: [] as string[],
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: m.membership }),
  getPermissions: async () => ({
    containsPermission: (permission: string) =>
      permission === 'manage_time_tracking_requests' && m.manager,
  }),
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    user: { id: 'actor' },
    supabase: {},
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({
      from: (table: string) => {
        m.tables.push(table);
        const result = {
          data:
            table === 'time_tracking_requests'
              ? { id: 'request', user_id: m.owner }
              : table === 'time_tracking_request_comments'
                ? { id: 'comment' }
                : [],
          error: null,
          count: 0,
        };
        const q = Object.assign(Promise.resolve(result), {
          select: () => q,
          eq: () => q,
          insert: () => q,
          order: () => q,
          range: () => Promise.resolve(result),
          single: () => Promise.resolve(result),
        });
        return q;
      },
    }),
  }),
}));

import { GET as activity } from './activity/route';
import { GET as comments, POST } from './comments/route';

describe.each([
  ['activity', activity, 'GET'],
  ['comments', comments, 'GET'],
  ['comment create', POST, 'POST'],
] as const)('%s request authorization', (_, handler, method) => {
  beforeEach(() => {
    m.owner = 'other';
    m.manager = false;
    m.membership = true;
    m.tables = [];
  });
  const run = () =>
    handler(
      new NextRequest('https://example.test/?page=1&limit=5', {
        method,
        ...(method === 'POST'
          ? {
              body: JSON.stringify({ content: 'Comment' }),
              headers: { 'Content-Type': 'application/json' },
            }
          : {}),
      }),
      {
        params: Promise.resolve({
          wsId: '11111111-1111-4111-8111-111111111111',
          id: 'request',
        }),
      }
    );
  it('denies a member reading or commenting on another user request', async () => {
    expect((await run()).status).toBe(403);
    expect(m.tables).toEqual(['time_tracking_requests']);
  });
  it('allows the request owner', async () => {
    m.owner = 'actor';
    expect((await run()).status).toBe(method === 'POST' ? 201 : 200);
  });
  it('allows a time-tracking request manager', async () => {
    m.manager = true;
    expect((await run()).status).toBe(method === 'POST' ? 201 : 200);
  });
  it('denies nonmembers even with management permission', async () => {
    m.membership = false;
    m.manager = true;
    expect((await run()).status).toBe(403);
    expect(m.tables).toEqual([]);
  });
});
