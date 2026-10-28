import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
const { default: worker } = await import('./worker');

const token = `tdbx_${'a'.repeat(64)}`;
const runnerId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const envValues = {
  DEVBOX_CONTROL_INTERNAL_TOKEN: 'internal-token-with-at-least-32-characters',
  RUNNER_WAKE: {
    getByName: () => ({
      fetch: async () => new Response(null, { status: 204 }),
    }),
  },
  SUPABASE_SECRET_KEY: 'test-secret-key',
  SUPABASE_URL: 'https://db.example.test',
  TUTURUUU_DEVBOX_AGENT_API_ENABLED: 'true',
};
const env = envValues as never;
const originalFetch = globalThis.fetch;
let revoked = false;
let member = true;
let heartbeatEnabled = true;
let writes = 0;

beforeEach(() => {
  envValues.TUTURUUU_DEVBOX_AGENT_API_ENABLED = 'true';
  revoked = false;
  member = true;
  heartbeatEnabled = true;
  writes = 0;
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'PATCH') {
        writes++;
        return new Response(null, { status: 204 });
      }
      if (path.endsWith('/devbox_runner_tokens'))
        return Response.json(
          revoked ? [] : [{ runner_id: runnerId, expires_at: null }]
        );
      if (path.endsWith('/devbox_runners'))
        return Response.json([
          {
            id: runnerId,
            actor_id: actorId,
            status: 'online',
            heartbeat_enabled: heartbeatEnabled,
          },
        ]);
      if (path.endsWith('/workspace_members'))
        return Response.json([{ type: member ? 'MEMBER' : 'GUEST' }]);
      if (path.endsWith('/rpc/claim_next_devbox_run'))
        return Response.json([
          {
            id: '33333333-3333-4333-8333-333333333333',
            lease_id: '44444444-4444-4444-8444-444444444444',
            command: ['echo', 'ok'],
            env: {},
            env_files: [],
            preview_ports: [],
            timeout_seconds: 30,
          },
        ]);
      return Response.json([]);
    }
  ) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

it('rejects missing and revoked runner tokens', async () => {
  expect(
    (await worker.fetch(new Request('https://control.test/v1/poll'), env))
      .status
  ).toBe(401);
  revoked = true;
  expect(
    (
      await worker.fetch(
        new Request('https://control.test/v1/poll', {
          headers: { 'X-Devbox-Runner-Token': token },
        }),
        env
      )
    ).status
  ).toBe(401);
  expect(writes).toBe(0);
});

it('records a heartbeat and returns the agent claim shape', async () => {
  const heartbeat = await worker.fetch(
    new Request('https://control.test/v1/heartbeat', {
      method: 'POST',
      headers: { 'X-Devbox-Runner-Token': token },
      body: JSON.stringify({
        capabilities: {
          judge: { ready: true, languages: ['python'], reason: null },
        },
      }),
    }),
    env
  );
  expect(heartbeat.status).toBe(200);
  expect(writes).toBe(1);
  const poll = await worker.fetch(
    new Request('https://control.test/v1/poll', {
      headers: { 'X-Devbox-Runner-Token': token },
    }),
    env
  );
  const body = (await poll.json()) as {
    jobs: { runId: string; leaseId: string }[];
  };
  expect(body.jobs[0]?.runId).toBe('33333333-3333-4333-8333-333333333333');
  expect(body.jobs[0]?.leaseId).toBe('44444444-4444-4444-8444-444444444444');
});

it('rejects nonmember agents and disabled heartbeats', async () => {
  member = false;
  const denied = await worker.fetch(
    new Request('https://control.test/v1/poll', {
      headers: { 'X-Devbox-Runner-Token': token },
    }),
    env
  );
  expect(denied.status).toBe(401);
  member = true;
  heartbeatEnabled = false;
  const disabled = await worker.fetch(
    new Request('https://control.test/v1/heartbeat', {
      method: 'POST',
      headers: { 'X-Devbox-Runner-Token': token },
      body: JSON.stringify({ capabilities: {} }),
    }),
    env
  );
  expect(disabled.status).toBe(403);
  expect(writes).toBe(0);
});

it('requires the internal token for wake notifications', async () => {
  const response = await worker.fetch(
    new Request('https://control.test/v1/notify', {
      method: 'POST',
      body: JSON.stringify({ runId: '33333333-3333-4333-8333-333333333333' }),
    }),
    env
  );
  expect(response.status).toBe(401);
});

const playgroundHeartbeat = (playground: unknown) =>
  new Request('https://control.test/v1/heartbeat', {
    method: 'POST',
    headers: { 'X-Devbox-Runner-Token': token },
    body: JSON.stringify({ capabilities: { playground } }),
  });
it('accepts optional playground readiness and forwards it unchanged', async () => {
  const playground = {
    ready: true,
    languages: ['python', 'shell'],
    environments: 1,
  };
  expect(
    (await worker.fetch(playgroundHeartbeat(playground), env)).status
  ).toBe(200);
  expect(writes).toBe(1);
  const write = vi
    .mocked(globalThis.fetch)
    .mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(JSON.parse(String(write?.[1]?.body)).capabilities.playground).toEqual(
    playground
  );
});
it.each([
  { ready: 'true', languages: ['python'], environments: 0 },
  { ready: true, languages: ['unknown'], environments: 0 },
  { ready: true, languages: Array(12).fill('python'), environments: 0 },
  { ready: true, languages: [], environments: -1 },
  { ready: true, languages: [], environments: 9 },
  { ready: true, languages: [], environments: 1.5 },
  { ready: true, languages: [], environments: 0, command: ['unsafe'] },
])(
  'rejects malformed playground readiness without writes: %j',
  async (playground) => {
    expect(
      (await worker.fetch(playgroundHeartbeat(playground), env)).status
    ).toBe(400);
    expect(writes).toBe(0);
  }
);
const capabilityHeartbeat = (capabilities: unknown) =>
  new Request('https://control.test/v1/heartbeat', {
    method: 'POST',
    headers: { 'X-Devbox-Runner-Token': token },
    body: JSON.stringify({ capabilities }),
  });
it('accepts an optional advisory execution mode and isolation summary', async () => {
  const capabilities = {
    executionMode: 'trusted',
    protocols: { commitRun: [1] },
    isolation: { checkedAt: '2026-10-23T00:00:00.000Z', dedicatedUser: true },
  };
  expect(
    (await worker.fetch(capabilityHeartbeat(capabilities), env)).status
  ).toBe(200);
  const write = vi
    .mocked(globalThis.fetch)
    .mock.calls.find(([, init]) => init?.method === 'PATCH');
  const stored = JSON.parse(String(write?.[1]?.body)).capabilities;
  expect([stored.executionMode, stored.protocols, stored.isolation]).toEqual([
    'trusted',
    capabilities.protocols,
    capabilities.isolation,
  ]);
});
it('drops a protocol advertisement from a Judge-only runner', async () => {
  const capabilities = {
    executionMode: 'judge-only',
    protocols: { commitRun: [1] },
  };
  expect(
    (await worker.fetch(capabilityHeartbeat(capabilities), env)).status
  ).toBe(200);
  const write = vi
    .mocked(globalThis.fetch)
    .mock.calls.find(([, init]) => init?.method === 'PATCH');
  const stored = JSON.parse(String(write?.[1]?.body)).capabilities;
  expect(stored).toEqual({ executionMode: 'judge-only' });
});
it.each([
  { executionMode: 'root' },
  { executionMode: 1 },
  { executionMode: ['trusted'] },
  { executionMode: [['sandboxed']] },
  { executionMode: { toString: 'trusted' } },
  { executionMode: null },
  { isolation: { dedicatedUser: 'yes' } },
  { isolation: { tokenValue: true } },
  { isolation: { checkedAt: 'x'.repeat(101) } },
  { isolation: null },
  { isolation: [] },
  { protocols: { commitRun: ['1'] } },
  { protocols: { commitRun: [0] } },
  { protocols: { shell: [1] } },
  { protocols: [] },
])(
  'rejects malformed execution mode or isolation reports without writes: %j',
  async (capabilities) => {
    expect(
      (await worker.fetch(capabilityHeartbeat(capabilities), env)).status
    ).toBe(400);
    expect(writes).toBe(0);
  }
);
it('still rejects unknown top-level capability keys', async () => {
  expect(
    (
      await worker.fetch(
        new Request('https://control.test/v1/heartbeat', {
          method: 'POST',
          headers: { 'X-Devbox-Runner-Token': token },
          body: JSON.stringify({ capabilities: { unexpected: true } }),
        }),
        env
      )
    ).status
  ).toBe(400);
  expect(writes).toBe(0);
});

it.each(['/v1/poll', '/v1/connect', '/v1/heartbeat'])(
  'agent API defaults off on %s',
  async (path) => {
    envValues.TUTURUUU_DEVBOX_AGENT_API_ENABLED = '';
    const response = await worker.fetch(
      new Request(`https://control.test${path}`, {
        method: path.endsWith('heartbeat') ? 'POST' : 'GET',
        headers: { 'X-Devbox-Runner-Token': token },
      }),
      env
    );
    expect(response.status).toBe(403);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  }
);
it.each(['/v1/poll', '/v1/connect', '/v1/heartbeat'])(
  'refuses tdba credentials on %s',
  async (path) => {
    const response = await worker.fetch(
      new Request(`https://control.test${path}`, {
        method: path.endsWith('heartbeat') ? 'POST' : 'GET',
        headers: { 'X-Devbox-Runner-Token': `tdba_${'a'.repeat(64)}` },
      }),
      env
    );
    expect(response.status).toBe(401);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  }
);
it('checks expiry on every runner request', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    Response.json([{ runner_id: runnerId, expires_at: '2000-01-01T00:00:00Z' }])
  );
  const response = await worker.fetch(
    new Request('https://control.test/v1/poll', {
      headers: { 'X-Devbox-Runner-Token': token },
    }),
    env
  );
  expect(response.status).toBe(401);
});
it('fails closed when runner expiry column is absent', async () => {
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    Response.json(
      { message: 'column expires_at does not exist' },
      { status: 400 }
    )
  );
  const response = await worker.fetch(
    new Request('https://control.test/v1/poll', {
      headers: { 'X-Devbox-Runner-Token': token },
    }),
    env
  );
  expect(response.status).toBe(503);
});

it('personal runner checks the grant and its expiry on every request', async () => {
  member = false;
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation();
  fetch.mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/devbox_runner_tokens'))
      return Response.json([
        {
          runner_id: runnerId,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      ]);
    if (path.endsWith('/rpc/resolve_devbox_identity'))
      return Response.json({
        enabled: true,
        grant: {
          user_id: actorId,
          status: 'active',
          revoked_at: null,
          suspended: false,
          accepted_at: '2026-10-01T00:00:00Z',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
        },
      });
    if (!original) throw new Error('Missing fetch fixture');
    return original(input, init);
  });
  const response = await worker.fetch(
    new Request('https://control.test/v1/heartbeat', {
      method: 'POST',
      headers: { 'X-Devbox-Runner-Token': token },
      body: '{}',
    }),
    env
  );
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({ cache: 'no-store' })
  );
});
it('a personal runner fails closed when the switch column is unavailable', async () => {
  member = false;
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation();
  fetch.mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/devbox_runner_tokens'))
      return Response.json([
        {
          runner_id: runnerId,
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      ]);
    if (path.endsWith('/rpc/resolve_devbox_identity'))
      return Response.json(
        { message: 'personal_pools_enabled does not exist' },
        { status: 400 }
      );
    if (!original) throw new Error('Missing fetch fixture');
    return original(input, init);
  });
  const response = await worker.fetch(
    new Request('https://control.test/v1/poll', {
      headers: { 'X-Devbox-Runner-Token': token },
    }),
    env
  );
  expect(response.status).toBe(503);
});

it('still sweeps expired grants when the quota reaper fails', async () => {
  const fetcher = vi.fn(
    async (input: RequestInfo | URL) =>
      new Response(
        String(input).includes('reap_devbox_quota_runs') ? 'failed' : '0',
        { status: String(input).includes('reap_devbox_quota_runs') ? 503 : 200 }
      )
  );
  globalThis.fetch = fetcher;
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await worker.scheduled(
      { scheduledTime: Date.now() } as ScheduledController,
      {
        ...envValues,
        TUTURUUU_DEVBOX_QUOTA_REAPER_ENABLED: 'true',
        TUTURUUU_DEVBOX_EXPIRY_SWEEP_ENABLED: 'true',
      } as never
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(
      'expire_devbox_personal_grants'
    );
    expect(log).toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
