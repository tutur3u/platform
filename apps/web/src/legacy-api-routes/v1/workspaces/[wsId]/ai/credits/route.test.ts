import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  let sessionAuthArgs: unknown[] = [];

  return {
    getSessionAuthArgs: () => sessionAuthArgs,
    withSessionAuth: vi.fn((...args: unknown[]) => {
      sessionAuthArgs = args;
      return vi.fn();
    }),
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));
vi.mock('@tuturuuu/payment-core', () => ({
  AiCreditsStatusError: class extends Error {},
  getAiCreditsStatus: vi.fn(),
}));

import './route';

describe('workspace AI credits route authentication', () => {
  it('accepts the Pay satellite app session', () => {
    expect(mocks.getSessionAuthArgs()).toEqual([
      expect.any(Function),
      expect.objectContaining({
        allowAppSessionAuth: expect.objectContaining({
          targetApp: expect.arrayContaining(['pay']),
        }),
      }),
    ]);
  });
});
