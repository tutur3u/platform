import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  withSessionAuth: vi.fn((handler: unknown, _options?: unknown) => handler),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

describe('task capacity rule route authentication', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.withSessionAuth.mockImplementation(
      (handler: unknown, _options?: unknown) => handler
    );
  });

  it('allows Tasks and CLI app sessions for every capacity endpoint', async () => {
    await import('./route');
    await import('./[ruleId]/route');

    expect(mocks.withSessionAuth).toHaveBeenCalledTimes(4);
    for (const call of mocks.withSessionAuth.mock.calls) {
      expect(call[1]).toEqual({
        allowAppSessionAuth: {
          targetApp: expect.arrayContaining(['tasks', 'platform']),
        },
      });
    }
  });
});
