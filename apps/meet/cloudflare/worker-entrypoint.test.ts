import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configure: vi.fn(),
  handle: vi.fn(async () => new Response('ok')),
}));

vi.mock('../src/runtime/abuse-guard', () => ({
  configureMeetAbuseGuard: mocks.configure,
}));
vi.mock('../src/runtime/handler', () => ({ handleMeetRequest: mocks.handle }));
vi.mock('./live/session', () => ({
  MeetLiveDurableObject: class {},
}));
vi.mock('./provider', () => ({ MeetingAIProvider: class {} }));

import worker from './worker';

describe('Meet Worker entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('configures the abuse guard from the Worker env before handling', async () => {
    const env = {
      ABUSE_GUARD_FAMILIES: 'password',
    } as unknown as CloudflareEnv;
    const ctx = {} as ExecutionContext;
    const response = await worker.fetch(
      new Request('https://meet.example.test/en'),
      env,
      ctx
    );
    expect(response.status).toBe(200);
    expect(mocks.configure).toHaveBeenCalledWith(env);
    expect(mocks.configure.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.handle.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });
});

it.each([
  ['meet.tutur3u.com', 500],
  ['meet.tuturuuu.com', 200],
])(
  'enforces cookie scope at the %s Worker exit',
  async (host, expectedStatus) => {
    const env = {
      NEXT_PUBLIC_APP_URL: `https://${host}`,
      NEXT_PUBLIC_WEB_APP_URL: host.endsWith('.tutur3u.com')
        ? 'https://web.tutur3u.com'
        : 'https://tuturuuu.com',
    } as unknown as CloudflareEnv;
    const cookie = 'session=fixture; Domain=.tuturuuu.com; Path=/; Secure';
    mocks.handle.mockResolvedValueOnce(
      new Response('cookie response', { headers: { 'set-cookie': cookie } })
    );
    const response = await worker.fetch(
      new Request(`https://${host}/en`),
      env,
      {} as ExecutionContext
    );
    expect(response.status).toBe(expectedStatus);
    expect(response.headers.getSetCookie()).toEqual(
      expectedStatus === 500 ? [] : [cookie]
    );
  }
);

const ctx = {} as ExecutionContext;
const meetEnv = (mode: string, status = '302') =>
  ({
    TTR_ONE_ORIGIN_MEET: mode,
    TTR_ONE_ORIGIN_MEET_REDIRECT_STATUS: status,
    NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
  }) as unknown as CloudflareEnv;

it.each([302, 301])(
  'uses rollout status %i and preserves encoded paths and queries',
  async (status) => {
    const request = new Request(
      'https://meet.tuturuuu.com/vi/plans/a%2Fb/?tag=1&tag=2&space=a+b',
      {
        headers: { 'Sec-Fetch-Mode': 'navigate' },
      }
    );
    const response = await worker.fetch(
      request,
      meetEnv('on', String(status)),
      ctx
    );
    expect(response.status).toBe(status);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/meet/vi/plans/a%2Fb/?tag=1&tag=2&space=a+b'
    );
    if (status === 302)
      expect(response.headers.get('cache-control')).toBe('no-store');
  }
);

it.each([
  '/api/auth/verify-app-token',
  '/.well-known/meeting-runtime',
  '/vi/verify-token',
  '/vi/native-collaboration',
  '/assets/current.js',
  '/meet-live-processor.js',
])('keeps legacy machine traffic on %s', async (path) => {
  const response = await worker.fetch(
    new Request(`https://meet.tuturuuu.com${path}`, {
      headers: { Accept: 'text/html' },
    }),
    meetEnv('on'),
    ctx
  );
  expect(response.status).toBe(200);
  expect(response.headers.has('location')).toBe(false);
});

it('allows a noindex apex shadow and refuses it when disabled', async () => {
  const request = new Request('https://tuturuuu.com/meet/vi/r/test');
  expect((await worker.fetch(request, meetEnv('off'), ctx)).status).toBe(404);
  const response = await worker.fetch(request, meetEnv('shadow'), ctx);
  expect(response.status).toBe(200);
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
});

it.each([
  ['https://tuturuuu.com/meet/live-connect', 'https://tuturuuu.com', 400],
  ['https://meet.tuturuuu.com/live-connect', 'https://meet.tuturuuu.com', 400],
  ['https://tuturuuu.com/meet/live-connect', 'https://meet.tuturuuu.com', 403],
  [
    'https://tuturuuu.com/meet/live-connect',
    'https://tuturuuu.com.evil.test',
    403,
  ],
])(
  'admits only the serving origin to the live socket at %s from %s',
  async (url, origin, status) => {
    const request = new Request(url, {
      headers: { Upgrade: 'websocket', Origin: origin },
    });
    const response = await worker.fetch(request, meetEnv('on'), ctx);
    expect(response.status).toBe(status);
    expect(response.headers.has('location')).toBe(false);
  }
);
