import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// The collector and its fake providers: the contract test below feeds the
// real collector output through Web's schema.
import { collectShip } from '../../../../../../../../cron-control/src/processors/mastermind-ship';
import {
  ACCOUNT,
  CF_TOKEN,
  GITHUB_TOKEN,
  makeWorld,
  seedWorld,
  STORE_TOKEN,
  STORE_URL,
} from '../../../../../../../../cron-control/src/processors/mastermind-ship/test-world';
import {
  SHIP_SNAPSHOT_KEY,
  shipSnapshotSchema,
} from '@/lib/mastermind/ship/contract';
import { POST } from './check/route';
import { GET } from './route';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const URL = 'https://tuturuuu.com/api/v1/mastermind/fleet/ship';
const CHECK_TOKEN = 'k'.repeat(40);

const mocks = vi.hoisted(() => ({
  user: { id: '' },
  permission: false,
  store: null as ReturnType<typeof createMemoryMastermindStore> | null,
  cronControl: undefined as { fetch: typeof fetch } | undefined,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: { user: { id: string } }) => Response) =>
    (request: Request) =>
      handler(request, { user: mocks.user }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    containsPermission: () => mocks.permission,
  }),
}));
vi.mock('@/lib/mastermind/store', () => ({
  getMastermindStore: async () => mocks.store,
}));
vi.mock('@opennextjs/cloudflare/cloudflare-context', () => ({
  getCloudflareContext: () => {
    if (!mocks.cronControl) throw new Error('not in a Worker');
    return { env: { CRON_CONTROL: mocks.cronControl } };
  },
}));

/** One real collector run against the fake providers. */
async function collected() {
  const { world, fetch } = makeWorld();
  seedWorld(world);
  const now = Date.parse('2026-11-22T10:00:00Z');
  await collectShip({
    deadline: now + 30_000,
    env: {
      MASTERMIND_SHIP_GITHUB_TOKEN: GITHUB_TOKEN,
      MASTERMIND_SHIP_CLOUDFLARE_TOKEN: CF_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
    } as never,
    fetch: fetch as typeof globalThis.fetch,
    fence: async () => true,
    now: () => now,
    slot: '2026-11-22T10:00:00.000Z',
    pending: {} as never,
    target: {
      secret: STORE_TOKEN,
      url: new globalThis.URL('/v1/ops', STORE_URL),
    },
    userAgent: 'test',
  });
  return world.store.get(SHIP_SNAPSHOT_KEY)!;
}

describe('ship routes', () => {
  beforeEach(() => {
    vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', OWNER);
    mocks.user = { id: OWNER };
    mocks.permission = true;
    mocks.store = createMemoryMastermindStore();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('accepts the collector output under the Web contract', async () => {
    const parsed = shipSnapshotSchema.safeParse(JSON.parse(await collected()));
    expect(parsed.success).toBe(true);
  });

  it('serves the validated snapshot to the owner only', async () => {
    const raw = await collected();
    await mocks.store!.set(SHIP_SNAPSHOT_KEY, raw, { ttlMs: 60_000 });
    const response = await GET(new NextRequest(URL));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const body = await response.json();
    expect(body.snapshot.apps).toHaveLength(10);
    expect(JSON.stringify(body)).not.toContain(GITHUB_TOKEN);

    mocks.user = { id: '22222222-2222-4222-8222-222222222222' };
    expect((await GET(new NextRequest(URL))).status).toBe(403);
  });

  it('answers not_collected, and refuses a tampered value', async () => {
    expect((await GET(new NextRequest(URL))).status).toBe(404);
    const snapshot = JSON.parse(await collected());
    snapshot.apps[0].production.release.sha = 'not-a-sha';
    await mocks.store!.set(SHIP_SNAPSHOT_KEY, JSON.stringify(snapshot), {
      ttlMs: 60_000,
    });
    const response = await GET(new NextRequest(URL));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'invalid_snapshot' });
  });

  it('relays "Check now" to Cron Control with the check token', async () => {
    vi.stubEnv('MASTERMIND_SHIP_CHECK_ORIGIN', 'https://cron.example.test');
    vi.stubEnv('MASTERMIND_SHIP_CHECK_TOKEN', CHECK_TOKEN);
    const calls: { url: string; auth: string | null }[] = [];
    let reply: Response = Response.json({ state: 'checked', outcome: 'ok' });
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          auth: new Headers(init?.headers).get('authorization'),
        });
        return reply;
      }
    );
    const check = () =>
      POST(new NextRequest(`${URL}/check`, { method: 'POST' }));

    const ok = await check();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ state: 'checked', code: 'checked' });
    expect(calls).toEqual([
      {
        url: 'https://cron.example.test/mastermind-ship/check',
        auth: `Bearer ${CHECK_TOKEN}`,
      },
    ]);

    reply = Response.json(
      { state: 'rate_limited', retryAfterMs: 20_000 },
      { status: 429 }
    );
    const limited = await check();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('20');
    expect(await limited.json()).toMatchObject({
      code: 'rate_limited',
      retryAfter: 20,
    });

    reply = new Response('<html>', { status: 502 });
    expect(await (await check()).json()).toEqual({
      state: 'failed',
      code: 'failed',
    });

    mocks.user = { id: '22222222-2222-4222-8222-222222222222' };
    calls.length = 0;
    expect((await check()).status).toBe(403);
    expect(calls).toEqual([]);
  });

  it('relays Check now over the CRON_CONTROL binding with the token', async () => {
    vi.stubEnv('MASTERMIND_SHIP_CHECK_TOKEN', CHECK_TOKEN);
    // The binding wins over any configured origin.
    vi.stubEnv('MASTERMIND_SHIP_CHECK_ORIGIN', 'https://cron.example.test');
    const calls: { url: string; auth: string | null }[] = [];
    mocks.cronControl = {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({
          url: String(input),
          auth: new Headers(init?.headers).get('authorization'),
        });
        return Response.json({ state: 'checked', outcome: 'ok' });
      }) as typeof fetch,
    };
    vi.stubGlobal('fetch', async () => {
      throw new Error('public fetch must not be used');
    });
    try {
      const response = await POST(
        new NextRequest(`${URL}/check`, { method: 'POST' })
      );
      expect(response.status).toBe(200);
      expect(calls).toEqual([
        {
          url: 'https://cron-control.internal/mastermind-ship/check',
          auth: `Bearer ${CHECK_TOKEN}`,
        },
      ]);
      // Without the token the binding is not called at all.
      vi.stubEnv('MASTERMIND_SHIP_CHECK_TOKEN', '');
      calls.length = 0;
      expect(
        (await POST(new NextRequest(`${URL}/check`, { method: 'POST' }))).status
      ).toBe(503);
      expect(calls).toEqual([]);
    } finally {
      mocks.cronControl = undefined;
    }
  });

  it('is unconfigured without an HTTPS origin and a token', async () => {
    vi.stubEnv('MASTERMIND_SHIP_CHECK_ORIGIN', 'http://cron.example.test');
    vi.stubEnv('MASTERMIND_SHIP_CHECK_TOKEN', CHECK_TOKEN);
    const response = await POST(
      new NextRequest(`${URL}/check`, { method: 'POST' })
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      state: 'unconfigured',
      code: 'unconfigured',
    });
  });
});
