import { describe, expect, it, vi } from 'vitest';
import {
  APP_SWITCH_MAX_BODY_BYTES,
  type AppSwitchSample,
  appSwitchDataPoint,
  clearAppSwitchStart,
  handleAppSwitchBeacon,
  parseAppSwitchSample,
  parseAppSwitchStart,
  resolveTopology,
  resolveUrlApp,
  serializeAppSwitchStart,
} from '../app-switch-rum';

const sample: AppSwitchSample = {
  from: 'platform',
  to: 'meet',
  topology: 'subdomain',
  durationMs: 812.4,
  prerendered: false,
  handoff: true,
  protocol: 'h3',
  connectMs: 41,
  effectiveType: '4g',
};
const beacon = (body: unknown, init: RequestInit = {}) =>
  new Request('https://meet.tuturuuu.com/_rum', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });

describe('start marker cookie', () => {
  it('round-trips a fresh marker and bounds its lifetime', () => {
    const cookie = serializeAppSwitchStart('platform', 1_000, {
      domain: '.tuturuuu.com',
      secure: true,
    });
    expect(cookie).toBe(
      'ttr_switch=1000.platform; Path=/; Max-Age=30; SameSite=Lax; Domain=.tuturuuu.com; Secure'
    );
    const header = `a=b; ${cookie!.split(';')[0]}; c=d`;
    expect(parseAppSwitchStart(header, 1_500)).toEqual({
      from: 'platform',
      epochMs: 1_000,
    });
    expect(parseAppSwitchStart(header, 31_001)).toBeNull();
    expect(parseAppSwitchStart(header, 999)).toBeNull();
    expect(clearAppSwitchStart()).toContain('Max-Age=0');
  });

  it('rejects malformed markers and app names', () => {
    expect(serializeAppSwitchStart('Bad App', 1)).toBeNull();
    expect(serializeAppSwitchStart('meet', -1)).toBeNull();
    for (const value of [
      'ttr_switch=abc.meet',
      'ttr_switch=1.<script>',
      'ttr_switch=',
      undefined,
    ])
      expect(parseAppSwitchStart(value, 2)).toBeNull();
  });
});

describe('sample validation', () => {
  it('accepts a valid sample and rounds timings', () => {
    expect(parseAppSwitchSample({ ...sample, extra: 'dropped' })).toEqual({
      ...sample,
      durationMs: 812,
    });
  });

  it.each([
    ['same app', { to: 'platform' }],
    ['unknown topology', { topology: 'proxy' }],
    ['negative duration', { durationMs: -1 }],
    ['duration past the marker lifetime', { durationMs: 30_001 }],
    ['non-finite connect time', { connectMs: Number.NaN }],
    ['long protocol text', { protocol: 'x'.repeat(17) }],
    ['protocol with markup', { protocol: '<b>' }],
    ['missing flag', { handoff: undefined }],
  ])('rejects %s', (_name, change) => {
    expect(parseAppSwitchSample({ ...sample, ...change })).toBeNull();
  });

  it('maps a sample to one Analytics Engine data point', () => {
    expect(appSwitchDataPoint({ ...sample, durationMs: 812 }, 'VN')).toEqual({
      indexes: ['meet'],
      blobs: ['platform', 'meet', 'subdomain', '0', '1', 'h3', '4g', 'VN'],
      doubles: [812, 41],
    });
  });
});

describe('beacon ingest', () => {
  it('writes one data point and answers 204', async () => {
    const writeDataPoint = vi.fn();
    const response = await handleAppSwitchBeacon(
      beacon(sample),
      { writeDataPoint },
      'VN'
    );
    expect(response.status).toBe(204);
    expect(writeDataPoint).toHaveBeenCalledTimes(1);
  });

  it('accepts and drops beacons without a dataset binding', async () => {
    expect(
      (await handleAppSwitchBeacon(beacon(sample), undefined)).status
    ).toBe(204);
  });

  it('rejects other methods, oversized and invalid bodies', async () => {
    const writeDataPoint = vi.fn();
    const dataset = { writeDataPoint };
    expect(
      (
        await handleAppSwitchBeacon(
          new Request('https://meet.tuturuuu.com/_rum'),
          dataset
        )
      ).status
    ).toBe(405);
    expect(
      (
        await handleAppSwitchBeacon(
          beacon('x'.repeat(APP_SWITCH_MAX_BODY_BYTES + 1)),
          dataset
        )
      ).status
    ).toBe(413);
    expect((await handleAppSwitchBeacon(beacon('{'), dataset)).status).toBe(
      400
    );
    expect(
      (await handleAppSwitchBeacon(beacon({ ...sample, to: 'x y' }), dataset))
        .status
    ).toBe(400);
    expect(writeDataPoint).not.toHaveBeenCalled();
  });
});

describe('app resolution', () => {
  const hostApps = (hostname: string) =>
    ({ 'meet.tuturuuu.com': 'meet', 'calendar.tuturuuu.com': 'calendar' })[
      hostname
    ];

  it('resolves mounted paths, Web and subdomains', () => {
    const app = (href: string) => resolveUrlApp(new URL(href), hostApps);
    expect(app('https://tuturuuu.com/meet/vi/r/a')).toBe('meet');
    expect(app('https://tuturuuu.com/mail')).toBe('mail');
    expect(app('https://tuturuuu.com/meet-together')).toBe('platform');
    expect(app('https://tuturuuu.com/personal')).toBe('platform');
    expect(app('https://meet.tuturuuu.com/r/a')).toBe('meet');
    expect(app('https://example.com/meet')).toBeNull();
  });

  it('labels the topology of the destination page', () => {
    expect(resolveTopology(new URL('https://tuturuuu.com/meet/x'))).toBe(
      'one-origin'
    );
    expect(resolveTopology(new URL('https://meet.tuturuuu.com/x'))).toBe(
      'subdomain'
    );
  });
});
