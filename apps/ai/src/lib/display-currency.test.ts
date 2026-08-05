import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

import {
  DEFAULT_DISPLAY_CURRENCY,
  normalizeDisplayCurrency,
  resolveDisplayCurrency,
} from './display-currency';

function ratesClientReturning(row: { rate: number } | null, error?: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => ({ data: row, error: error ?? null }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

describe('display currency', () => {
  it('accepts only currencies the platform holds rates for', () => {
    expect(normalizeDisplayCurrency('vnd')).toBe('VND');
    expect(normalizeDisplayCurrency(' EUR ')).toBe('EUR');
    // Anything else falls back rather than producing a label with no rate.
    expect(normalizeDisplayCurrency('XYZ')).toBe(DEFAULT_DISPLAY_CURRENCY);
    expect(normalizeDisplayCurrency(undefined)).toBe(DEFAULT_DISPLAY_CURRENCY);
  });

  it('never queries for USD, which is the stored unit', async () => {
    await expect(resolveDisplayCurrency('USD')).resolves.toEqual({
      code: 'USD',
      rate: 1,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('resolves the newest USD-based rate', async () => {
    mocks.createAdminClient.mockResolvedValue(
      ratesClientReturning({ rate: 25_400 })
    );
    await expect(resolveDisplayCurrency('VND')).resolves.toEqual({
      code: 'VND',
      rate: 25_400,
    });
  });

  it('falls back to USD rather than labelling an unconverted number', async () => {
    // Showing a dollar figure with a đồng symbol would be worse than showing
    // dollars, so a missing, zero, or failing rate degrades to USD.
    mocks.createAdminClient.mockResolvedValue(ratesClientReturning(null));
    await expect(resolveDisplayCurrency('VND')).resolves.toEqual({
      code: 'USD',
      rate: 1,
    });

    mocks.createAdminClient.mockResolvedValue(
      ratesClientReturning({ rate: 0 })
    );
    await expect(resolveDisplayCurrency('VND')).resolves.toEqual({
      code: 'USD',
      rate: 1,
    });

    mocks.createAdminClient.mockRejectedValue(new Error('no database'));
    await expect(resolveDisplayCurrency('VND')).resolves.toEqual({
      code: 'USD',
      rate: 1,
    });
  });
});
