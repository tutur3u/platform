// @vitest-environment node
import { NextResponse } from 'next/dist/server/web/spec-extension/response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarTelemetryPort } from './request-telemetry.server';

const suppliers = vi.hoisted(() => ({
  start: vi.fn<(request: Request) => Promise<Response>>(),
  proxy: vi.fn(),
  verify: vi.fn<(request: Request) => Promise<boolean>>(),
}));
vi.mock('@tuturuuu/start-bridge/start/server-entry', () => ({
  createBridgeStartHandler: () => ({ fetch: suppliers.start }),
}));
vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('../proxy', () => ({ proxy: suppliers.proxy }));
vi.mock('@tuturuuu/utils/cloudflare-access', async (actual) => ({
  ...(await actual<typeof import('@tuturuuu/utils/cloudflare-access')>()),
  verifyCloudflareAccessRequest: suppliers.verify,
}));

const asset = vi.fn(async () => new Response('asset'));
const env = { ASSETS: { fetch: asset } };
const ctx = { waitUntil: (work: Promise<unknown>) => void work };
const telemetry: CalendarTelemetryPort = {
  setActor: () => {},
  cron: async (_options, handler) => handler(),
};

async function load(profile: string | undefined) {
  vi.resetModules();
  // Stub first so unstubAllEnvs restores the pinned value, then unset it.
  vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', profile ?? '');
  if (profile === undefined) delete process.env.CALENDAR_DEPLOYMENT_PROFILE;
  return import('./handler');
}

beforeEach(() => {
  vi.resetAllMocks();
  suppliers.proxy.mockImplementation(async () => NextResponse.next());
  suppliers.start.mockResolvedValue(new Response('served'));
  suppliers.verify.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

describe('Calendar deployment profile', () => {
  it.each([undefined, '', 'Production', 'prod', 'preview'])(
    'fails closed when the profile is %j',
    async (profile) => {
      await expect(load(profile)).rejects.toThrow(
        /CALENDAR_DEPLOYMENT_PROFILE must be/
      );
    }
  );

  it('accepts development only for the dev server, never a build', async () => {
    const { resolveCalendarDeploymentProfile } = await import(
      './deployment-profile'
    );
    expect(resolveCalendarDeploymentProfile('development', 'serve')).toBe(
      'development'
    );
    expect(() => resolveCalendarDeploymentProfile('development')).toThrow();
    expect(() =>
      resolveCalendarDeploymentProfile('development', 'build')
    ).toThrow();
    expect(() =>
      resolveCalendarDeploymentProfile(undefined, 'serve')
    ).toThrow();
    expect(resolveCalendarDeploymentProfile('production', 'build')).toBe(
      'production'
    );
  });

  it('gives each profile exactly one environment root host', async () => {
    for (const [profile, hosts] of [
      ['production', ['calendar.tuturuuu.com']],
      ['staging', ['calendar.tutur3u.com']],
    ] as const) {
      vi.resetModules();
      vi.stubEnv('CALENDAR_DEPLOYMENT_PROFILE', profile);
      const { default: config } = await import('../../start-bridge.config');
      expect(config.mounts?.rootHosts).toEqual(hosts);
      expect(config.mounts?.mountHosts).toEqual([]);
      expect(config.mounts?.unknownHost).toBe('reject');
    }
  });

  // N9: the staging artifact never answers production or retired hosts.
  it.each([
    'calendar.tuturuuu.com',
    'calendar-cutover.tutur3u.com',
    'calendar-staging.tuturuuu.com',
    'tuturuuu-calendar-wave1-staging.fixture.workers.dev',
  ])(
    'staging rejects %s with 404 before Access, middleware or SSR',
    async (host) => {
      const { handleCalendarRequest } = await load('staging');
      const response = await handleCalendarRequest(
        new Request(`https://${host}/api/build-info`),
        env,
        ctx,
        telemetry
      );
      expect(response.status).toBe(404);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(suppliers.verify).not.toHaveBeenCalled();
      expect(suppliers.proxy).not.toHaveBeenCalled();
      expect(suppliers.start).not.toHaveBeenCalled();
      expect(asset).not.toHaveBeenCalled();
    }
  );

  it('staging serves its own host only after Access verification', async () => {
    const { handleCalendarRequest } = await load('staging');
    const response = await handleCalendarRequest(
      new Request('https://calendar.tutur3u.com/api/build-info'),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(200);
    expect(suppliers.verify).toHaveBeenCalledTimes(1);
  });

  // N19 (unit): a missing or invalid Access JWT is denied before any work.
  it('staging answers 403 when Access verification fails', async () => {
    suppliers.verify.mockResolvedValue(false);
    const { handleCalendarRequest } = await load('staging');
    for (const path of ['/api/build-info', '/en/personal', '/api/v1/x']) {
      const response = await handleCalendarRequest(
        new Request(`https://calendar.tutur3u.com${path}`),
        env,
        ctx,
        telemetry
      );
      expect(response.status).toBe(403);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    expect(suppliers.proxy).not.toHaveBeenCalled();
    expect(suppliers.start).not.toHaveBeenCalled();
    expect(asset).not.toHaveBeenCalled();
  });

  it('production never consults Access', async () => {
    const { handleCalendarRequest } = await load('production');
    const response = await handleCalendarRequest(
      new Request('https://calendar.tuturuuu.com/api/build-info'),
      env,
      ctx,
      telemetry
    );
    expect(response.status).toBe(200);
    expect(suppliers.verify).not.toHaveBeenCalled();
  });
});
