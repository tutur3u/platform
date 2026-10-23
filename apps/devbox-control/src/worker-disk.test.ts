import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
const { default: worker } = await import('./worker');

const token = `tdbx_${'a'.repeat(64)}`;
const runnerId = '11111111-1111-4111-8111-111111111111';
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
let patches: unknown[] = [];

beforeEach(() => {
  patches = [];
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'PATCH') {
        patches.push(JSON.parse(String(init.body)));
        return new Response(null, { status: 204 });
      }
      if (path.endsWith('/devbox_runner_tokens'))
        return Response.json([{ runner_id: runnerId }]);
      if (path.endsWith('/devbox_runners'))
        return Response.json([
          {
            id: runnerId,
            actor_id: '22222222-2222-4222-8222-222222222222',
            status: 'online',
            heartbeat_enabled: true,
          },
        ]);
      if (path.endsWith('/workspace_members'))
        return Response.json([{ type: 'MEMBER' }]);
      return Response.json([]);
    }
  ) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const beat = (resources: unknown) =>
  worker.fetch(
    new Request('https://control.test/v1/heartbeat', {
      method: 'POST',
      headers: { 'X-Devbox-Runner-Token': token },
      body: JSON.stringify({ capabilities: { resources } }),
    }),
    env
  );

it('stores a bucketed disk headroom report unchanged', async () => {
  const resources = {
    loadAverage: [1, 1, 1],
    disk: { freeGiB: 50, freePct: 10, inodeFreePct: 95 },
  };
  expect((await beat(resources)).status).toBe(200);
  expect(
    (patches[0] as { capabilities: { resources: unknown } }).capabilities
      .resources
  ).toEqual(resources);
});

it.each([
  { freeGiB: '50', freePct: 10 },
  { freeGiB: ['50'], freePct: 10 },
  { freeGiB: 1.5, freePct: 10 },
  { freeGiB: -1, freePct: 10 },
  { freeGiB: 50, freePct: 12 },
  { freeGiB: 50, freePct: '10' },
  { freeGiB: 50, freePct: 10, inodeFreePct: [95] },
  { freeGiB: 50, freePct: 10, path: '/' },
  [50, 10],
  null,
])('rejects a malformed disk report without writes: %j', async (disk) => {
  expect((await beat({ disk })).status).toBe(400);
  expect(patches).toHaveLength(0);
});

it('rejects a non-object resources report', async () => {
  expect((await beat(['disk'])).status).toBe(400);
  expect(patches).toHaveLength(0);
});
