import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fleetSignedPayload } from '@/lib/mastermind/fleet/signing';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';
import { GET, PUT } from './route';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const SECRET = 'test-publisher-signing-secret-usage-v1';
const PATH = '/api/v1/mastermind/fleet/usage';
const URL = `https://tuturuuu.com${PATH}`;
const NOW = '2026-11-21T11:25:00.000Z';

const mocks = vi.hoisted(() => ({
  user: { id: '' },
  permission: false,
  store: null as ReturnType<typeof createMemoryMastermindStore> | null,
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

const snapshot = {
  v: 1,
  generatedAt: NOW,
  machines: [
    {
      id: 'test-machine',
      label: 'Test machine',
      quota: { kind: 'complete', observedAt: NOW },
      accounting: { kind: 'unavailable' },
      accounts: [
        {
          id: 'test-account',
          provider: 'Codex',
          instance: 'Work',
          email: 'owner@example.com',
          plan: 'Plus',
          checkedAt: NOW,
          status: { kind: 'available' },
          windows: [{ kind: 'session', usedPercent: 40, resetsAt: null }],
        },
      ],
      buckets: [],
    },
  ],
};

function put(payload: unknown = snapshot, path = PATH) {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signMastermindPushEvent(
    SECRET,
    timestamp,
    fleetSignedPayload('PUT', path, body)
  );
  return PUT(
    new Request(URL, {
      method: 'PUT',
      body,
      headers: { 'x-mm-signature': signature, 'x-mm-timestamp': timestamp },
    })
  );
}

function get() {
  return GET(new NextRequest(URL));
}

describe('fleet usage route', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(NOW));
    vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
    vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', OWNER);
    mocks.user = { id: OWNER };
    mocks.permission = true;
    mocks.store = createMemoryMastermindStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('returns structured account identity only to the fleet owner', async () => {
    expect((await get()).status).toBe(404);
    expect((await put()).status).toBe(200);

    mocks.user = { id: '22222222-2222-4222-8222-222222222222' };
    const nonOwner = await get();
    expect(nonOwner.status).toBe(403);
    expect(await nonOwner.text()).not.toContain('owner@example.com');

    mocks.user = { id: OWNER };
    mocks.permission = false;
    expect((await get()).status).toBe(403);

    mocks.permission = true;
    const owner = await get();
    expect(owner.headers.get('cache-control')).toBe('private, no-store');
    expect(await owner.json()).toEqual({ snapshot, receivedAt: NOW });
  });

  it('rejects unrelated signatures, extra fields and oversized bodies', async () => {
    expect((await put(snapshot, '/api/v1/mastermind/fleet/state')).status).toBe(
      401
    );
    expect((await put({ ...snapshot, credentials: 'disallowed' })).status).toBe(
      422
    );
    expect(
      (await put({ ...snapshot, extra: 'x'.repeat(100_000) })).status
    ).toBe(413);
    expect((await get()).status).toBe(404);
  });

  it('preserves the newest observation across stale and future writes', async () => {
    expect((await put()).status).toBe(200);
    expect((await put()).status).toBe(409);
    expect(
      (await put({ ...snapshot, generatedAt: '2026-11-21T11:24:59.000Z' }))
        .status
    ).toBe(409);
    expect(
      (await put({ ...snapshot, generatedAt: '2026-11-21T11:26:00.000Z' }))
        .status
    ).toBe(409);
    expect(await (await get()).json()).toEqual({ snapshot, receivedAt: NOW });
  });
});
