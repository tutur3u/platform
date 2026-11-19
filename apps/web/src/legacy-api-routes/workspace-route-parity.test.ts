import { NextRequest } from 'next/server';
import { beforeAll, expect, test, vi } from 'vitest';

// Path and explicit method exports from the 75 original concrete wrappers.
const originalRoutes = {
  'api-keys/[keyId]/rotate': ['POST'],
  'api-keys/[keyId]': ['GET', 'PUT', 'DELETE'],
  'api-keys/[keyId]/usage-logs': ['GET'],
  'api-keys/roles': ['GET'],
  'api-keys': ['GET', 'POST'],
  'encryption/fix': ['POST'],
  'encryption/migrate': ['GET', 'POST'],
  encryption: ['GET', 'POST', 'DELETE'],
  'external-apps/cron/executions': ['GET'],
  'external-apps/cron/jobs/[jobKey]/executions': ['GET'],
  'external-apps/cron/jobs/[jobKey]': ['PATCH'],
  'external-apps/cron/jobs/[jobKey]/run-now': ['POST'],
  'external-apps/cron': ['GET'],
  'external-apps/cron/setup': ['POST'],
  'external-apps/drive/finalize': ['POST'],
  'external-apps/drive/read-url': ['POST'],
  'external-apps/drive': ['DELETE'],
  'external-apps/drive/upload-url': ['POST'],
  'external-apps/members/[userId]/role': ['PATCH'],
  'external-apps/members/access': ['DELETE'],
  'external-apps/members/default-admin': ['PATCH'],
  'external-apps/members/invitations': ['POST'],
  'external-apps/members': ['GET'],
  'group-tags/[tagId]': ['GET', 'PUT', 'DELETE'],
  'group-tags/[tagId]/user-groups/[groupId]': ['DELETE'],
  'group-tags/[tagId]/user-groups': ['GET', 'POST'],
  'group-tags': ['GET', 'POST'],
  'integrations/sepay/disconnect': ['POST'],
  'integrations/sepay/endpoints/[id]/rotate': ['POST'],
  'integrations/sepay/endpoints/[id]': ['DELETE'],
  'integrations/sepay/endpoints': ['GET', 'POST'],
  'integrations/sepay/oauth/callback': ['GET'],
  'integrations/sepay/oauth/start': ['POST'],
  'integrations/sepay/provision-webhooks': ['POST'],
  'integrations/sepay/sync-bank-accounts': ['POST'],
  'posts/bootstrap': ['GET'],
  'posts/filter-options': ['GET'],
  'posts/force-send': ['POST'],
  'posts/permissions': ['GET'],
  posts: ['GET'],
  'posts/status': ['GET'],
  'time-tracking/analytics': ['GET'],
  'time-tracking/break-types/[breakTypeId]': ['PATCH', 'DELETE'],
  'time-tracking/break-types': ['GET', 'POST'],
  'time-tracking/breaks': ['GET', 'POST'],
  'time-tracking/categories/[categoryId]': ['PATCH', 'DELETE'],
  'time-tracking/categories/copy': ['POST'],
  'time-tracking/categories': ['GET', 'POST'],
  'time-tracking/goals/[goalId]': ['PATCH', 'DELETE'],
  'time-tracking/goals': ['GET', 'POST'],
  'time-tracking/quick-start': ['POST'],
  'time-tracking/requests/[id]/activity': ['GET'],
  'time-tracking/requests/[id]/comments/[commentId]': ['PATCH', 'DELETE'],
  'time-tracking/requests/[id]/comments': ['GET', 'POST'],
  'time-tracking/requests/[id]/image-urls': ['POST'],
  'time-tracking/requests/[id]': ['PUT', 'PATCH'],
  'time-tracking/requests': ['GET', 'POST'],
  'time-tracking/requests/upload-url': ['POST'],
  'time-tracking/requests/users': ['GET'],
  'time-tracking/sessions/[sessionId]/breaks/active': ['GET'],
  'time-tracking/sessions/[sessionId]/move': ['POST'],
  'time-tracking/sessions/[sessionId]': ['GET', 'PATCH', 'DELETE'],
  'time-tracking/sessions': ['GET', 'POST'],
  'time-tracking/stats/period': ['GET'],
  'time-tracking/templates': ['GET'],
  'time-tracking/threshold': ['PUT'],
  'user-profile-links/[linkId]': ['PATCH', 'DELETE'],
  'user-profile-links': ['GET', 'POST'],
  'user-profile-links/users': ['GET'],
  'wallets/[walletId]/roles/[roleId]': ['PUT', 'DELETE'],
  'wallets/[walletId]/roles': ['GET', 'POST'],
  wallets: ['GET', 'POST'],
  'whiteboards/[boardId]/image-url': ['GET', 'POST'],
  'whiteboards/[boardId]': ['GET', 'PATCH', 'DELETE'],
  whiteboards: ['POST'],
} as const;

const routeGroups = {
  'api-keys': () =>
    import('@/app/api/v1/workspaces/[wsId]/api-keys/[[...segments]]/route'),
  encryption: () =>
    import('@/app/api/v1/workspaces/[wsId]/encryption/[[...segments]]/route'),
  'external-apps': () =>
    import('@/app/api/v1/workspaces/[wsId]/external-apps/[...segments]/route'),
  'group-tags': () =>
    import('@/app/api/v1/workspaces/[wsId]/group-tags/[[...segments]]/route'),
  integrations: () =>
    import('@/app/api/v1/workspaces/[wsId]/integrations/[...segments]/route'),
  posts: () =>
    import('@/app/api/v1/workspaces/[wsId]/posts/[[...segments]]/route'),
  'time-tracking': () =>
    import('@/app/api/v1/workspaces/[wsId]/time-tracking/[...segments]/route'),
  'user-profile-links': () =>
    import('@/app/api/v1/workspaces/[wsId]/user-profile-links/[[...segments]]/route'),
  wallets: () =>
    import('@/app/api/v1/workspaces/[wsId]/wallets/[[...segments]]/route'),
  whiteboards: () =>
    import('@/app/api/v1/workspaces/[wsId]/whiteboards/[[...segments]]/route'),
};
type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
type Handlers = Awaited<
  ReturnType<(typeof routeGroups)[keyof typeof routeGroups]>
>;
const groups = new Map<string, Handlers>();

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}));

beforeAll(async () => {
  for (const [path, methods] of Object.entries(originalRoutes)) {
    vi.doMock(`@/legacy-api-routes/v1/workspaces/[wsId]/${path}/route`, () =>
      Object.fromEntries(
        methods.map((method) => [
          method,
          async (
            request: NextRequest,
            context: { params: Promise<Record<string, string>> }
          ) =>
            Response.json(
              { params: await context.params, method: request.method },
              {
                headers: { 'x-handler': `${path}:${method}` },
              }
            ),
        ])
      )
    );
  }
  for (const [group, load] of Object.entries(routeGroups)) {
    groups.set(group, await load());
  }
});

async function invoke(group: string, segments: string[], method: Method) {
  const handlers = groups.get(group);
  if (!handlers) throw new Error(`Missing route group ${group}`);
  const pathname = ['/api/v1/workspaces/workspace', group, ...segments].join(
    '/'
  );
  return handlers[method](
    new NextRequest(new URL(pathname, 'https://tuturuuu.com'), { method }),
    {
      params: Promise.resolve({
        wsId: 'workspace',
        segments: segments.length ? segments : undefined,
      }),
    }
  );
}

test.each(Object.entries(originalRoutes))(
  '%s preserves the original path and methods',
  async (path, exportedMethods) => {
    const [group, ...pattern] = path.split('/');
    if (!group) throw new Error('Missing workspace route group');
    const params = { wsId: 'workspace' };
    const segments = pattern.map((segment) => {
      if (!segment.startsWith('[')) return segment;
      const key = segment.slice(1, -1);
      const value = `sample-${key}`;
      Object.assign(params, { [key]: value });
      return value;
    });
    const methods = new Set<Method>(exportedMethods);
    for (const method of methods) {
      const response = await invoke(group, segments, method);
      expect(response?.headers.get('x-handler')).toBe(`${path}:${method}`);
      expect(await response?.json()).toEqual({ params, method });
    }
    if (methods.has('GET') && !methods.has('HEAD')) {
      const response = await invoke(group, segments, 'HEAD');
      expect(response?.headers.get('x-handler')).toBe(`${path}:GET`);
      expect(await response?.text()).toBe('');
      methods.add('HEAD');
    }
    if (!methods.has('OPTIONS')) {
      const response = await invoke(group, segments, 'OPTIONS');
      expect(response?.status).toBe(204);
      expect(response?.headers.get('Allow')).toBe(
        [...methods, 'OPTIONS'].sort().join(', ')
      );
    }
    for (const method of [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
    ] as const) {
      if (!methods.has(method))
        expect((await invoke(group, segments, method))?.status).toBe(405);
    }
  }
);

test.each(Object.keys(routeGroups))(
  '%s returns 404 for an unknown sub-path',
  async (group) => {
    const segments = Array.from({ length: 8 }, () => 'unmatched');
    for (const method of [
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ] as const) {
      expect((await invoke(group, segments, method))?.status).toBe(404);
    }
  }
);
