import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fleetSignedPayload } from '@/lib/mastermind/fleet/signing';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const SECRET = 'fleet-publisher-secret-for-tests-0123456789';
const NOW_S = () => Math.floor(Date.now() / 1000);

const mocks = vi.hoisted(() => ({
  user: { id: '' },
  granted: [] as string[],
  store: null as unknown,
  bridge: null as Record<string, ReturnType<typeof vi.fn>> | null,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (r: Request, a: unknown, p: unknown) => Response) =>
    async (request: Request, context?: { params?: unknown }) =>
      handler(request, { user: mocks.user }, await context?.params),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({}),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    containsPermission: (p: string) => mocks.granted.includes(p),
  }),
}));
vi.mock('@/lib/mastermind/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mastermind/store')>()),
  getMastermindStore: async () => mocks.store,
}));
vi.mock(
  '@tuturuuu/utils/mastermind-store/bridge-client',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@tuturuuu/utils/mastermind-store/bridge-client')
    >()),
    configuredMastermindBridge: () => mocks.bridge,
  })
);

function signed(path: string, body: string, secret = SECRET) {
  const timestamp = String(NOW_S());
  return new NextRequest(`https://tuturuuu.com${path}`, {
    method: 'POST',
    headers: {
      'x-mm-timestamp': timestamp,
      'x-mm-signature': signMastermindPushEvent(
        secret,
        timestamp,
        fleetSignedPayload('POST', path, body)
      ),
    },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
  vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', OWNER);
  mocks.user = { id: OWNER };
  mocks.granted = ['manage_mastermind', 'view_infrastructure'];
  mocks.store = createMemoryMastermindStore();
  mocks.bridge = {
    socketUrl: 'wss://store.example/v1/bridge/connect' as never,
    ticket: vi.fn(async () => ({
      ticket: 't'.repeat(43),
      expiresAt: 1_800_000_060_000,
    })),
    live: vi.fn(async () => ({
      machines: [
        {
          machineId: 'skr-m4',
          connected: true,
          connectedAt: 1_800_000_000_000,
        },
      ],
      pokes: [
        { machineId: 'skr-m4', topic: 'usage', revision: 3, observedAt: 'x' },
      ],
    })),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('fleet bridge tickets and live state', () => {
  const path = '/api/v1/mastermind/fleet/bridge/ticket';

  it('gives a signed publisher one machine ticket per signature', async () => {
    const { POST } = await import('./bridge/ticket/route');
    const body = JSON.stringify({ machineId: 'skr-m4' });
    const request = signed(path, body);
    const response = await POST(request.clone() as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: 'wss://store.example/v1/bridge/connect',
      ticket: 't'.repeat(43),
      expiresAt: new Date(1_800_000_060_000).toISOString(),
    });
    expect(mocks.bridge!.ticket).toHaveBeenCalledWith({
      role: 'machine',
      machineId: 'skr-m4',
    });
    // The same signature is never accepted twice.
    expect((await POST(request as never)).status).toBe(409);
  });

  it('refuses unsigned, wrongly signed and malformed ticket requests', async () => {
    const { POST } = await import('./bridge/ticket/route');
    const body = JSON.stringify({ machineId: 'skr-m4' });
    const unsigned = new NextRequest(`https://tuturuuu.com${path}`, {
      method: 'POST',
      body,
    });
    expect((await POST(unsigned as never)).status).toBe(401);
    expect(
      (
        await POST(
          signed(path, body, 'another-secret-another-secret-123456') as never
        )
      ).status
    ).toBe(401);
    // A signature for another route does not open this one.
    expect(
      (
        await POST(
          new NextRequest(`https://tuturuuu.com${path}`, {
            method: 'POST',
            headers: signed('/api/v1/mastermind/fleet/answers', body).headers,
            body,
          }) as never
        )
      ).status
    ).toBe(401);
    expect(
      (await POST(signed(path, JSON.stringify({ machineId: '../x' })) as never))
        .status
    ).toBe(422);
    expect(mocks.bridge!.ticket).not.toHaveBeenCalled();
  });

  it('serves live state and listen-only tickets to the owner alone', async () => {
    const live = await import('./live/route');
    const ticket = await import('./live/ticket/route');
    const get = () =>
      live.GET(
        new NextRequest('https://tuturuuu.com/api/v1/mastermind/fleet/live'),
        {
          params: Promise.resolve({}),
        } as never
      );
    const post = () =>
      ticket.POST(
        new NextRequest(
          'https://tuturuuu.com/api/v1/mastermind/fleet/live/ticket',
          {
            method: 'POST',
          }
        ),
        { params: Promise.resolve({}) } as never
      );
    expect(await (await get()).json()).toEqual({
      machines: [
        {
          machineId: 'skr-m4',
          connected: true,
          connectedAt: new Date(1_800_000_000_000).toISOString(),
        },
      ],
      pokes: [
        { machineId: 'skr-m4', topic: 'usage', revision: 3, observedAt: 'x' },
      ],
    });
    expect(await (await post()).json()).toMatchObject({
      ticket: 't'.repeat(43),
    });
    expect(mocks.bridge!.ticket).toHaveBeenLastCalledWith({ role: 'owner' });
    mocks.user = { id: STRANGER };
    expect((await get()).status).toBe(403);
    expect((await post()).status).toBe(403);
    expect(mocks.bridge!.ticket).toHaveBeenCalledTimes(1);
  });
});
