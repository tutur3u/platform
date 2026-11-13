import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  cap: vi.fn(),
  price: vi.fn(),
}));
vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.check,
}));
vi.mock('@tuturuuu/ai/credits/cap-output-tokens', () => ({
  capMaxOutputTokensByCredits: mocks.cap,
  readOutputPricePerToken: mocks.price,
}));

import { performCreditPreflight } from './route-credits';

const preflightArgs = {
  wsId: 'ws',
  model: 'model',
  userId: 'user',
  sbAdmin: {} as Parameters<typeof performCreditPreflight>[0]['sbAdmin'],
};

describe('chat provider budget boundary', () => {
  beforeEach(() => {
    mocks.check.mockReset();
    mocks.cap.mockReset();
    mocks.price.mockReset();
    mocks.price.mockResolvedValue(0.00002);
  });

  it('rejects an unverifiable output cap even when credits remain', async () => {
    mocks.check.mockResolvedValue({
      allowed: true,
      remainingCredits: 1000,
      maxOutputTokens: null,
    });
    mocks.cap.mockResolvedValue(null);
    const result = await performCreditPreflight(preflightArgs);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(503);
    expect(mocks.cap).toHaveBeenCalledWith(
      preflightArgs.sbAdmin,
      'model',
      null,
      1000,
      1,
      0.00002
    );
  });

  it('loads price metadata alongside the allowance without using price as admission', async () => {
    let releasePrice: ((price: number) => void) | undefined;
    mocks.price.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          releasePrice = resolve;
        })
    );
    mocks.check.mockResolvedValue({
      allowed: false,
      remainingCredits: 0,
      errorMessage: 'AI credits insufficient',
      errorCode: 'INSUFFICIENT_CREDITS',
    });

    const pending = performCreditPreflight(preflightArgs);
    await vi.waitFor(() => {
      expect(mocks.check).toHaveBeenCalled();
      expect(releasePrice).toEqual(expect.any(Function));
    });
    expect(mocks.cap).not.toHaveBeenCalled();
    releasePrice?.(0.5);
    const result = await pending;

    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(403);
    expect(mocks.cap).not.toHaveBeenCalled();
  });

  it('keeps an allowance denial when the price read fails', async () => {
    mocks.price.mockRejectedValue(new Error('price metadata unavailable'));
    mocks.check.mockResolvedValue({
      allowed: false,
      remainingCredits: 0,
      errorMessage: 'AI credits insufficient',
      errorCode: 'INSUFFICIENT_CREDITS',
    });

    const result = await performCreditPreflight(preflightArgs);
    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error.status).toBe(403);
    expect(mocks.cap).not.toHaveBeenCalled();
  });
});
