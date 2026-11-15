// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runHiveSimulationTick: vi.fn(),
  timingSafeEqual: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  mocks.timingSafeEqual.mockImplementation(actual.timingSafeEqual);
  return { ...actual, timingSafeEqual: mocks.timingSafeEqual };
});

vi.mock('@/lib/hive/simulation', () => ({
  runHiveSimulationTick: (...args: unknown[]) =>
    mocks.runHiveSimulationTick(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_options: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

const CRON_SECRET = 'synthetic-test-cron-value';
const CRON_URL = 'https://hive.tuturuuu.com/api/cron/hive/simulate';

function cronRequest(authorization?: string) {
  return new NextRequest(CRON_URL, {
    headers: authorization ? { Authorization: authorization } : {},
  });
}

describe('Hive simulation cron route', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', CRON_SECRET);
    vi.stubEnv('VERCEL_CRON_SECRET', '');
    mocks.runHiveSimulationTick.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('fails closed when no cron secret is configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const { GET } = await import('./route');

    const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(500);
    expect(mocks.runHiveSimulationTick).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['wrong', 'Bearer wrong-value'],
    ['shorter', 'Bearer synthetic'],
    ['longer', `Bearer ${CRON_SECRET}-extra`],
    ['unprefixed', CRON_SECRET],
  ])('rejects a %s Authorization header', async (_label, authorization) => {
    const { GET } = await import('./route');

    const response = await GET(cronRequest(authorization));

    expect(response.status).toBe(401);
    expect(mocks.runHiveSimulationTick).not.toHaveBeenCalled();
  });

  it('compares fixed-length digests in constant time', async () => {
    const { GET } = await import('./route');

    await GET(cronRequest('Bearer x'));

    expect(mocks.timingSafeEqual).toHaveBeenCalledTimes(1);
    const [provided, expected] = mocks.timingSafeEqual.mock.calls[0] as [
      Buffer,
      Buffer,
    ];
    expect(provided).toHaveLength(32);
    expect(expected).toHaveLength(32);
  });

  it('runs the simulation tick for the configured bearer secret', async () => {
    const { GET } = await import('./route');

    const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, results: [] });
    expect(mocks.runHiveSimulationTick).toHaveBeenCalledTimes(1);
  });

  it('accepts VERCEL_CRON_SECRET when CRON_SECRET is unset', async () => {
    vi.stubEnv('CRON_SECRET', undefined);
    vi.stubEnv('VERCEL_CRON_SECRET', CRON_SECRET);
    const { GET } = await import('./route');

    const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`));

    expect(response.status).toBe(200);
  });
});
