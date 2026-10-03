import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: () => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    });
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('fixture-version\n'));
      child.emit('exit', 0);
    });
    return child;
  },
}));
vi.mock('./devbox-judge-sandbox', () => ({
  getJudgeReadiness: vi.fn().mockResolvedValue({
    ready: false,
    languages: [],
    reason: 'Fixture runtime is unavailable.',
  }),
}));
vi.mock('./devbox-playground-sandbox', () => ({
  getPlaygroundReadiness: vi.fn(() => {
    throw new Error('Parent must not probe an unsupported capability.');
  }),
}));
vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }));
vi.mock('@/lib/devboxes/agent-auth', () => ({
  authorizeDevboxAgent: vi.fn().mockResolvedValue({
    ok: true,
    runner: {
      id: '11111111-1111-4111-8111-111111111111',
      heartbeatEnabled: true,
    },
  }),
}));
vi.mock('@/lib/devboxes/agent-store', () => ({
  heartbeatDevboxRunner: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/devboxes/agent-traffic-gate', () => ({
  isDevboxAgentApiEnabled: () => true,
  createDevboxAgentApiDisabledResponse: vi.fn(),
}));
vi.mock('@/lib/devboxes/store-utils', () => ({
  createDevboxRouteErrorResponse: vi.fn(),
}));

afterEach(() => vi.unstubAllGlobals());

it('emits capabilities accepted by both currently deployed heartbeat contracts', async () => {
  const { createDevboxAgentCapabilities } = await import(
    './devbox-agent-capabilities'
  );
  const capabilities = await createDevboxAgentCapabilities();
  expect(capabilities).not.toHaveProperty('playground');
  const webRoute = new URL(
    '../../../../apps/web/src/legacy-api-routes/v1/devboxes/agents/heartbeat/route.ts',
    import.meta.url
  ).pathname;
  const { POST } = await import(/* @vite-ignore */ webRoute);
  const request = () =>
    new Request('https://fixture.test/v1/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ capabilities }),
    });
  expect((await POST(request())).status).toBe(200);

  const controlRoute = new URL(
    '../../../../apps/devbox-control/src/worker.ts',
    import.meta.url
  ).pathname;
  const { default: worker } = await import(/* @vite-ignore */ controlRoute);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') return new Response(null, { status: 204 });
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/devbox_runner_tokens'))
        return Response.json([
          { runner_id: '11111111-1111-4111-8111-111111111111' },
        ]);
      if (path.endsWith('/devbox_runners'))
        return Response.json([
          {
            id: '11111111-1111-4111-8111-111111111111',
            actor_id: '22222222-2222-4222-8222-222222222222',
            status: 'online',
            heartbeat_enabled: true,
          },
        ]);
      return Response.json([{ type: 'MEMBER' }]);
    })
  );
  const controlRequest = request();
  controlRequest.headers.set('X-Devbox-Runner-Token', `tdbx_${'a'.repeat(64)}`);
  const response = await worker.fetch(controlRequest, {
    DEVBOX_CONTROL_INTERNAL_TOKEN: 'synthetic-fixture-internal-token-32chars',
    SUPABASE_SECRET_KEY: 'synthetic-fixture',
    SUPABASE_URL: 'https://db.example.test',
  } as never);
  expect(response.status).toBe(200);
});
