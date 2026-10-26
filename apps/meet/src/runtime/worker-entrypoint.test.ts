import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configure: vi.fn(),
  handle: vi.fn(async () => new Response('ok')),
}));

vi.mock('./abuse-guard', () => ({ configureMeetAbuseGuard: mocks.configure }));
vi.mock('./handler', () => ({ handleMeetRequest: mocks.handle }));
vi.mock('../../cloudflare/live/session', () => ({
  MeetLiveDurableObject: class {},
}));
vi.mock('../../cloudflare/provider', () => ({ MeetingAIProvider: class {} }));

import worker from '../../cloudflare/worker';

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
