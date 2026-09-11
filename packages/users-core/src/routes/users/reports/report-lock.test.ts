import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), permissions: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('../../../lib/user-groups/route-auth', () => ({
  getUserGroupRoutePermissions: mocks.permissions,
}));
vi.mock('../../../lib/user-groups/route-helpers', () => ({
  resolveUserGroupRouteWorkspaceId: async () => 'workspace',
  resolveRequestActorAuthUid: async () => null,
}));

import { DELETE, PUT } from './[reportId]/route';

const context = {
  params: Promise.resolve({ wsId: 'workspace', reportId: 'report' }),
};

describe('processing report conflict responses', () => {
  beforeEach(() => {
    mocks.permissions.mockResolvedValue({ containsPermission: () => true });
    const from = (table: string) => {
      const result = {
        data:
          table === 'external_user_monthly_reports_workspace_view'
            ? { id: 'report', generation_mode: 'manual' }
            : null,
        error:
          table === 'external_user_monthly_reports'
            ? {
                code: '55P03',
                message:
                  'Report delivery is in progress. Try again after it finishes.',
              }
            : null,
      };
      const proxy = new Proxy(
        {},
        {
          get: (_, key) => {
            if (key === 'then')
              return Promise.resolve(result).then.bind(Promise.resolve(result));
            return () => proxy;
          },
        }
      );
      return proxy;
    };
    mocks.admin.mockResolvedValue({ from, schema: () => ({ from }) });
  });
  it.each(['PUT', 'DELETE'] as const)(
    'returns an actionable conflict for %s',
    async (method) => {
      const request = new Request('https://example.com/report', {
        method,
        ...(method === 'PUT' ? { body: JSON.stringify({ score: 93 }) } : {}),
      });
      const response = await (method === 'PUT' ? PUT : DELETE)(
        request,
        context
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({
        message: 'Report delivery is in progress. Try again after it finishes.',
      });
    }
  );
});
