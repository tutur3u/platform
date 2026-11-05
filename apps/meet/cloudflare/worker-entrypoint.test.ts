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
