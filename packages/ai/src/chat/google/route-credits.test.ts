import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ check: vi.fn(), cap: vi.fn() }));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.check,
}));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: mocks.cap,
}));

import { performCreditPreflight } from './route-credits';

describe('chat provider budget boundary', () => {
  it('rejects an unverifiable output cap even when credits remain', async () => {
    mocks.check.mockResolvedValue({
      allowed: true,
      remainingCredits: 1000,
      maxOutputTokens: null,
    });
    mocks.cap.mockResolvedValue(null);
    const result = await performCreditPreflight({
      wsId: 'ws',
      model: 'model',
      userId: 'user',
      sbAdmin: {} as Parameters<typeof performCreditPreflight>[0]['sbAdmin'],
    });
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(503);
  });
});
