import { describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';
import type { ApiEnv, Principal, SecurityAdapter } from './contracts';
import { ApiError } from './errors';
import { FORWARD_HOP } from './forward';
import { createApi as createPipeline, type PipelineOptions } from './pipeline';

function createApi(options: PipelineOptions) {
  const run = createPipeline(options);
  return (
    request: Request,
    env: ApiEnv,
    execution: Parameters<typeof run>[2]
  ) =>
    run(
      request,
      {
        API_WORKER_OPERATIONS: options.endpoints
          .map((endpoint) => endpoint.operationId)
          .join(','),
        ...env,
      },
      execution
    );
}

import { defineRoute, validateRegistry } from './registry';
import { endpoints } from './routes';

const execution = { waitUntil: (_promise: Promise<unknown>) => {} };
const request = (path: string, init?: RequestInit) =>
  new Request(`https://tuturuuu.com${path}`, init);
const env: ApiEnv = {
  MOBILE_VERSION_POLICY: JSON.stringify({
    ios: {
      minimumSupportedBuild: 42,
      latestBuild: 50,
      storeUrl: 'https://apps.apple.com/app/example',
    },
    android: {
      minimumSupportedBuild: 12,
      latestBuild: 15,
      storeUrl: 'https://play.google.com/store/apps/details?id=example',
    },
  }),
};
const user: Principal = {
  kind: 'user',
  userId: 'synthetic-user',
  authentication: 'bearer',
  mfaVerified: true,
};
const workspaceRoute = defineRoute({
  operationId: 'getWorkspaceObject',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/objects/{objectId}',
  aliases: [
    { path: '/api/compat/{wsId}/{objectId}', errorEncoding: 'legacy-error' },
  ],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'read',
    object: { resource: 'object', param: 'objectId' },
  },
  guard: 'web-api',
  limits: { bodyBytes: 0, deadlineMs: 1000, ratePolicy: 'read' },
  input: z.object({
    params: z.object({ wsId: z.string(), objectId: z.string() }),
    query: z.object({}).strict(),
    body: z.null(),
  }),
  output: z.object({ ok: z.literal(true) }),
  body: 'none',
  status: 200,
  handle: () => ({ ok: true as const }),
});
function security(overrides: Partial<SecurityAdapter> = {}): SecurityAdapter {
  return {
    guard: async () => {},
    resolvePrincipal: async () => user,
    authorize: async () => ({
      kind: 'workspace',
      workspaceId: 'A',
      membership: 'active',
      permissions: ['read'],
      objects: [{ id: 'one', resource: 'object', workspaceId: 'A' }],
    }),
    ...overrides,
  };
}

describe('foundation public contracts', () => {
  const fetch = createApi({ endpoints, retained: [] });
  test('health, HEAD, OPTIONS, Allow and build identity', async () => {
    const health = await fetch(request('/api/health'), env, execution);
    expect(await health.json()).toEqual({ status: 'ok' });
    expect(health.headers.get('cache-control')).toBe('no-store');
    expect(health.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/);
    const head = await fetch(
      request('/api/health', { method: 'HEAD' }),
      env,
      execution
    );
    expect(await head.text()).toBe('');
    const options = await fetch(
      request('/api/health', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://tuturuuu.com',
          'access-control-request-method': 'GET',
        },
      }),
      env,
      execution
    );
    expect(options.status).toBe(204);
    expect(options.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
    const denied = await fetch(
      request('/api/health', { method: 'POST' }),
      env,
      execution
    );
    expect(denied.status).toBe(405);
    expect(denied.headers.get('allow')).toContain('GET');
    const build = await fetch(request('/api/build-info'), env, execution);
    expect(await build.json()).toMatchObject({
      appName: 'api',
      commitHash: 'local',
      shortCommitHash: 'local',
      environment: 'cloudflare-worker',
    });
  });
  test.each([
    ['ios', 41, 'update-required', true],
    ['ios', 42, 'update-recommended', false],
    ['ios', 50, 'supported', false],
    ['android', 11, 'update-required', true],
    ['android', 12, 'update-recommended', false],
    ['android', 15, 'supported', false],
  ])(
    'enforces %s build %d threshold',
    async (platform, build, status, requiresUpdate) => {
      const response = await fetch(
        request(`/api/v1/mobile/version?platform=${platform}&build=${build}`),
        env,
        execution
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        platform,
        currentBuild: build,
        status,
        requiresUpdate,
      });
    }
  );
  test('missing/malformed policy fails closed and invalid builds are rejected', async () => {
    expect(
      (
        await fetch(
          request('/api/v1/mobile/version?platform=ios&build=50'),
          {},
          execution
        )
      ).status
    ).toBe(503);
    for (const query of [
      'platform=web&build=1',
      'platform=ios',
      'platform=ios&build=-1',
      'platform=ios&build=1e3',
      'platform=ios&build=1&build=2',
    ]) {
      expect(
        (
          await fetch(
            request(`/api/v1/mobile/version?${query}`),
            env,
            execution
          )
        ).status
      ).toBe(400);
    }
    const invalid = {
      MOBILE_VERSION_POLICY: env.MOBILE_VERSION_POLICY?.replace(
        '"minimumSupportedBuild":42',
        '"minimumSupportedBuild":51'
      ),
    };
    expect(
      (
        await fetch(
          request('/api/v1/mobile/version?platform=ios&build=50'),
          invalid,
          execution
        )
      ).status
    ).toBe(503);
  });
  test('rejects malformed encodings/cookies and credentialed CORS from a foreign origin', async () => {
    expect((await fetch(request('/api/%zz'), env, execution)).status).toBe(400);
    expect(
      (
        await fetch(
          request('/api/health', { headers: { cookie: 'sb-auth=%zz' } }),
          env,
          execution
        )
      ).status
    ).toBe(400);
    const response = await fetch(
      request('/api/health', {
        headers: { origin: 'https://untrusted.example' },
      }),
      env,
      execution
    );
    expect(response.status).toBe(403);
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });
});

describe('one security pipeline', () => {
  test('missing adapter denies before the handler and preserves legacy errors', async () => {
    const fetch = createApi({ endpoints: [workspaceRoute], retained: [] });
    const result = await fetch(request('/api/compat/A/one'), {}, execution);
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: 'Service unavailable' });
  });
  test('resolves once and requires membership, permission and object workspace binding', async () => {
    const resolver = spyOn({ resolve: async () => user }, 'resolve');
    const fetch = createApi({
      endpoints: [workspaceRoute],
      retained: [],
      security: security({ resolvePrincipal: resolver }),
    });
    expect(
      (await fetch(request('/api/v1/workspaces/A/objects/one'), {}, execution))
        .status
    ).toBe(200);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(
      (await fetch(request('/api/v1/workspaces/B/objects/one'), {}, execution))
        .status
    ).toBe(403);
    expect(
      (
        await fetch(
          request('/api/v1/workspaces/A/objects/foreign'),
          {},
          execution
        )
      ).status
    ).toBe(403);
    const removed = createApi({
      endpoints: [workspaceRoute],
      retained: [],
      security: security({ authorize: async () => ({ kind: 'identity' }) }),
    });
    expect(
      (
        await removed(
          request('/api/v1/workspaces/A/objects/one'),
          {},
          execution
        )
      ).status
    ).toBe(403);
  });
  test('abuse/cost/ban guard rejects before principal resolution', async () => {
    let resolutions = 0;
    const fetch = createApi({
      endpoints: [workspaceRoute],
      retained: [],
      security: security({
        guard: async () => {
          throw new ApiError('rate_limited', 429, 'Request limit exceeded');
        },
        resolvePrincipal: async () => {
          resolutions++;
          return user;
        },
      }),
    });
    expect(
      (await fetch(request('/api/v1/workspaces/A/objects/one'), {}, execution))
        .status
    ).toBe(429);
    expect(resolutions).toBe(0);
  });
  test('MFA and anonymous failures deny private access', async () => {
    for (const principal of [
      { ...user, mfaVerified: false },
      { kind: 'public' as const },
    ]) {
      const fetch = createApi({
        endpoints: [workspaceRoute],
        retained: [],
        security: security({ resolvePrincipal: async () => principal }),
      });
      expect([401, 403]).toContain(
        (
          await fetch(
            request('/api/v1/workspaces/A/objects/one'),
            {},
            execution
          )
        ).status
      );
    }
  });
  test('logs only allowlisted request metadata', async () => {
    const log = spyOn(console, 'info').mockImplementation(() => {});
    try {
      const fetch = createApi({ endpoints, retained: [] });
      await fetch(
        request('/api/health', {
          headers: {
            authorization: 'Bearer synthetic-secret',
            cookie: 'private=synthetic-cookie',
          },
        }),
        {},
        execution
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-');
      expect(log.mock.calls[0]?.[1]).toMatchObject({
        operationId: 'getHealth',
        runtime: 'worker',
        status: 200,
      });
    } finally {
      log.mockRestore();
    }
  });
  test('registry rejects aliases, implicit policies and metadata guard bypasses', () => {
    expect(() =>
      validateRegistry([
        workspaceRoute,
        { ...workspaceRoute, operationId: 'duplicate' },
      ])
    ).toThrow('Duplicate route');
    expect(() =>
      validateRegistry([{ ...workspaceRoute, policy: { kind: 'deny' } }])
    ).toThrow('Missing serving policy');
    expect(() =>
      validateRegistry([{ ...workspaceRoute, guard: 'metadata' }])
    ).toThrow();
  });
});

test('retained origin forwards a write exactly once without redirects or body reserialization', async () => {
  let calls = 0;
  const fetcher = async (input: Request) => {
    calls++;
    const outgoing = input instanceof Request ? input : new Request(input);
    expect(outgoing.url).toBe(
      'https://retained-fixture.vercel.app/api/v1/workspaces/A/objects/one'
    );
    expect(outgoing.redirect).toBe('manual');
    expect(outgoing.headers.get(FORWARD_HOP)).toBe('1');
    expect(outgoing.headers.get('authorization')).toBe('Bearer fixture');
    expect(outgoing.headers.get('x-tuturuuu-actor')).toBeNull();
    expect(await outgoing.text()).toBe('{ "signed": true }');
    return new Response('accepted', {
      status: 202,
      headers: [
        ['set-cookie', 'first=1; Path=/'],
        ['set-cookie', 'second=2; Path=/'],
      ],
    });
  };
  const fetch = createApi({
    endpoints: [],
    retained: [{ path: '/api/v1/workspaces/{wsId}/objects/{objectId}' }],
    fetcher,
  });
  const result = await fetch(
    request('/api/v1/workspaces/A/objects/one', {
      method: 'POST',
      headers: {
        authorization: 'Bearer fixture',
        'x-tuturuuu-actor': 'spoofed',
      },
      body: '{ "signed": true }',
    }),
    { RETAINED_API_ORIGIN: 'https://retained-fixture.vercel.app' },
    execution
  );
  expect(result.status).toBe(202);
  expect(result.headers.getSetCookie()).toHaveLength(2);
  expect(calls).toBe(1);
  const loop = await fetch(
    request('/api/v1/workspaces/A/objects/one', {
      headers: { [FORWARD_HOP]: '1' },
    }),
    { RETAINED_API_ORIGIN: 'https://retained-fixture.vercel.app' },
    execution
  );
  expect(loop.status).toBe(503);
  for (const origin of [
    'https://tuturuuu.com',
    'https://api.tuturuuu.com',
    'http://retained.example',
    'https://retained.example/path',
  ]) {
    expect(
      (
        await fetch(
          request('/api/v1/workspaces/A/objects/one'),
          { RETAINED_API_ORIGIN: origin },
          execution
        )
      ).status
    ).toBe(503);
  }
  expect(calls).toBe(1);
});

test('registration stays held until its operation ID is explicitly selected, and removing it rolls back', async () => {
  let forwards = 0;
  const run = createPipeline({
    endpoints,
    retained: [{ path: '/api/health' }],
    fetcher: async () => {
      forwards++;
      return new Response('retained', { status: 202 });
    },
  });
  const retainedEnv = {
    RETAINED_API_ORIGIN: 'https://retained-fixture.vercel.app',
  };
  expect(
    (await run(request('/api/health'), retainedEnv, execution)).status
  ).toBe(202);
  expect(
    (
      await run(
        request('/api/health'),
        { ...retainedEnv, API_WORKER_OPERATIONS: 'getHealth' },
        execution
      )
    ).status
  ).toBe(200);
  expect(
    (
      await run(
        request('/api/health'),
        { ...retainedEnv, API_WORKER_OPERATIONS: '' },
        execution
      )
    ).status
  ).toBe(202);
  expect(forwards).toBe(2);
  expect(
    (
      await run(
        request('/api/health'),
        { ...retainedEnv, API_WORKER_OPERATIONS: 'typo' },
        execution
      )
    ).status
  ).toBe(503);
  expect(forwards).toBe(2);
});
