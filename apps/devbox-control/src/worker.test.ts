import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
const { default: worker } = await import('./worker');

const token = `tdbx_${'a'.repeat(64)}`;
const runnerId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const env = {
  DEVBOX_CONTROL_INTERNAL_TOKEN: 'internal-token-with-at-least-32-characters',
  RUNNER_WAKE: {
    getByName: () => ({
      fetch: async () => new Response(null, { status: 204 }),
    }),
  },
  SUPABASE_SECRET_KEY: 'test-secret-key',
  SUPABASE_URL: 'https://db.example.test',
} as never;
const originalFetch = globalThis.fetch;
let revoked = false;
let member = true;
let heartbeatEnabled = true;
let writes = 0;

beforeEach(() => {
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
        return Response.json(revoked ? [] : [{ runner_id: runnerId }]);
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
