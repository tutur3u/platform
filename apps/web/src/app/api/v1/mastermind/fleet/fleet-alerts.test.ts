import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryMastermindStore } from '@tuturuuu/utils/mastermind-store/client';
import {
  FLEET_ALERTS_TTL_MS,
  resetFleetAlertsCache,
} from '@/lib/mastermind/fleet/alerts';
import { sampleFleetState } from '@/lib/mastermind/fleet/sample-state.fixture';
import { fleetSignedPayload } from '@/lib/mastermind/fleet/signing';
import { signMastermindPushEvent } from '@/lib/mastermind/push-events/signature';

vi.mock('server-only', () => ({}));

const OWNER = '11111111-1111-4111-8111-111111111111';
const SECRET = 'fleet-test-'.padEnd(44, 'f');
const ALERTS_PATH = '/api/v1/mastermind/fleet/alerts';

const mocks = vi.hoisted(() => ({
  store: null as ReturnType<typeof createMemoryMastermindStore> | null,
  alerts: vi.fn(),
  queries: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (r: Request, a: unknown) => Response, _options?: unknown) =>
    async (request: Request) =>
      handler(request, { user: { id: OWNER } }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({ containsPermission: () => true }),
}));
vi.mock('@/lib/mastermind/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mastermind/store')>()),
  getMastermindStore: async () => mocks.store,
}));
// A chainable PostgREST stand-in: records the query and returns the rows
// (written in the RPC shape below) as table rows with the embedded SLO.
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: (schema: string) => ({
      from: (table: string) => {
        const query: Record<string, unknown> = { schema, table, order: [] };
        const chain = {
          select: (columns: string) => ((query.select = columns), chain),
          eq: (column: string, value: unknown) => (
            (query.eq = [column, value]),
            chain
          ),
          order: (column: string, options: unknown) => (
            (query.order as unknown[]).push([column, options]),
            chain
          ),
          limit: (count: number) => ((query.limit = count), chain),
          abortSignal: async (_signal: AbortSignal) => {
            mocks.queries.push(query);
            const result = await mocks.alerts(query);
            if (!Array.isArray(result.data)) return result;
            return {
              ...result,
              data: result.data.map(
                ({
                  indicator,
                  objective,
                  latency_threshold_ms,
                  ...alert
                }: Record<string, unknown>) => ({
                  ...alert,
                  observability_slos: {
                    indicator,
                    objective,
                    latency_threshold_ms,
                  },
                })
              ),
            };
          },
        };
        return chain;
      },
    }),
  }),
}));

const row = (overrides: Record<string, unknown> = {}) => ({
  burn_long: 20.5,
  burn_short: 30,
  dedupe_key: 'slo:workers-availability:page:tuturuuu-meet:20261121t0300',
  indicator: 'availability',
  latency_threshold_ms: null,
  objective: 0.995,
  resolved_at: null,
  service: 'tuturuuu-meet',
  severity: 'page',
  slo_id: 'workers-availability',
  started_at: '2026-11-21T03:00:00Z',
  state: 'firing',
  ...overrides,
});

const rows = [
  row({
    dedupe_key: 'slo:workers-latency:ticket:web:20261121t0400',
    severity: 'ticket',
    indicator: 'latency',
    latency_threshold_ms: 1000,
    service: 'web',
    started_at: '2026-11-21T04:00:00Z',
  }),
  row(),
  row({
    dedupe_key: 'slo:workers-availability:page:web:20261121t0100',
    state: 'resolved',
    resolved_at: '2026-11-21T02:00:00Z',
  }),
];

async function publish() {
  const body = JSON.stringify(sampleFleetState());
  const { PUT } = await import('./state/route');
  return PUT(signed('PUT', '/api/v1/mastermind/fleet/state', body));
}

function signed(method: string, path: string, body = '') {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request(`https://tuturuuu.com${path}`, {
    method,
    headers: {
      'x-mm-signature': signMastermindPushEvent(
        SECRET,
        timestamp,
        fleetSignedPayload(method, path, body)
      ),
      'x-mm-timestamp': timestamp,
    },
    ...(body ? { body } : {}),
  });
}

async function ownerRead(headers: Record<string, string> = {}) {
  const { GET } = await import('./state/route');
  return GET(
    new NextRequest('https://tuturuuu.com/api/v1/mastermind/fleet/state', {
      headers,
    })
  );
}

const withAlerts = { 'x-mastermind-fleet-features': 'login,alerts' };

async function publisherPull() {
  const { GET } = await import('./alerts/route');
  return GET(signed('GET', `${ALERTS_PATH}?nonce=${randomUUID()}`));
}

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync
describe('Mastermind fleet SLO burn alerts', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.clearAllMocks();
    resetFleetAlertsCache();
    mocks.queries = [];
    mocks.store = createMemoryMastermindStore();
    mocks.alerts.mockResolvedValue({ data: rows, error: null });
    vi.stubEnv('MASTERMIND_FLEET_PUBLISHER_SECRET', SECRET);
    vi.stubEnv('MASTERMIND_PUSH_OWNER_IDS', OWNER);
    vi.stubEnv('MASTERMIND_FLEET_OWNER_IDS', '');
    vi.stubEnv('MASTERMIND_REQUIRE_EXPLICIT_GRANT', '');
    await publish();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('serves firing alerts only to clients with the alerts feature', async () => {
    const old = await ownerRead({ 'x-mastermind-fleet-features': 'login' });
    expect((await old.json()).alerts).toBeUndefined();
    expect(mocks.alerts).not.toHaveBeenCalled();

    const body = await (await ownerRead(withAlerts)).json();
    expect(body.state.version).toBe(1);
    expect(body.alerts).toEqual([
      {
        id: expect.stringMatching(/^slo-workers-availability-page-[a-z0-9-]+$/),
        service: 'tuturuuu-meet',
        severity: 'page',
        indicator: 'availability',
        burnLong: 20.5,
        burnShort: 30,
        startedAt: '2026-11-21T03:00:00Z',
      },
      expect.objectContaining({ severity: 'ticket', service: 'web' }),
    ]);
    for (const alert of body.alerts)
      expect(alert.id).toMatch(/^[a-z0-9][a-z0-9._-]{0,63}$/);
    expect(JSON.stringify(body)).not.toContain('dedupe_key');
    // Firing only, page first, newest, limited in the database.
    expect(mocks.queries).toEqual([
      expect.objectContaining({
        schema: 'private',
        table: 'observability_alerts',
        eq: ['state', 'firing'],
        limit: 20,
        order: [
          ['severity', { ascending: true }],
          ['started_at', { ascending: false }],
          ['dedupe_key', { ascending: true }],
        ],
      }),
    ]);
  });

  it('reads the database at most once a minute per isolate', async () => {
    await ownerRead(withAlerts);
    await Promise.all([ownerRead(withAlerts), publisherPull()]);
    expect(mocks.alerts).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + FLEET_ALERTS_TTL_MS + 1);
    await ownerRead(withAlerts);
    expect(mocks.alerts).toHaveBeenCalledTimes(2);
  });

  it('fails open: no alerts field, the snapshot still served', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.alerts.mockResolvedValue({ data: null, error: { message: 'down' } });
    const response = await ownerRead(withAlerts);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.alerts).toBeUndefined();
    expect(body.state.lanes).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith('Mastermind fleet alerts unavailable');

    mocks.alerts.mockRejectedValue(new Error('network'));
    resetFleetAlertsCache();
    expect((await ownerRead(withAlerts)).status).toBe(200);
    warn.mockRestore();
  });

  it('changes the ETag when the firing set changes', async () => {
    const first = await ownerRead(withAlerts);
    const etag = first.headers.get('etag') ?? '';
    expect(
      (await ownerRead({ ...withAlerts, 'if-none-match': etag })).status
    ).toBe(304);

    mocks.alerts.mockResolvedValue({ data: [rows[1]], error: null });
    resetFleetAlertsCache();
    const next = await ownerRead({ ...withAlerts, 'if-none-match': etag });
    expect(next.status).toBe(200);
    expect((await next.json()).alerts).toHaveLength(1);
  });

  it('changes the ETag when only an alert detail changes', async () => {
    const etag = (await ownerRead(withAlerts)).headers.get('etag') ?? '';
    mocks.alerts.mockResolvedValue({
      data: rows.map((r) =>
        r.severity === 'page' && r.state === 'firing'
          ? { ...r, indicator: 'latency', latency_threshold_ms: 800 }
          : r
      ),
      error: null,
    });
    resetFleetAlertsCache();
    const next = await ownerRead({ ...withAlerts, 'if-none-match': etag });
    expect(next.status).toBe(200);
  });

  it('serves the publisher the same shape behind its signature only', async () => {
    const pulled = await publisherPull();
    expect(pulled.status).toBe(200);
    expect(pulled.headers.get('cache-control')).toBe('private, no-store');
    const owner = await (await ownerRead(withAlerts)).json();
    expect((await pulled.json()).alerts).toEqual(owner.alerts);

    const { GET } = await import('./alerts/route');
    expect(
      (await GET(new Request(`https://tuturuuu.com${ALERTS_PATH}`))).status
    ).toBe(401);
    const replay = signed('GET', `${ALERTS_PATH}?nonce=fixed`);
    const again = new Request(replay.url, { headers: replay.headers });
    expect((await GET(replay)).status).toBe(200);
    expect((await GET(again)).status).toBe(409);
  });

  it('answers the publisher 503 when alerts are unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.alerts.mockResolvedValue({ data: 'nope', error: null });
    expect((await publisherPull()).status).toBe(503);
    warn.mockRestore();
  });
});
