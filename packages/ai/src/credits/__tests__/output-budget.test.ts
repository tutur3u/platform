import { describe, expect, it, vi } from 'vitest';
import { capMaxOutputTokensByCredits } from '../cap-output-tokens';
import { AI_REQUEST_MAX_OUTPUT_TOKENS } from '../constants';

function database(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  return {
    schema: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue(query) }),
  } as unknown as Parameters<typeof capMaxOutputTokensByCredits>[0];
}
describe('provider output spending ceiling', () => {
  it('uses the most expensive output tier before authorizing tokens', async () => {
    const db = database({
      output_price_per_token: 0.0001,
      output_tiers: [{ cost: '0.0001' }, { cost: '0.001' }],
    });
    expect(
      await capMaxOutputTokensByCredits(
        db,
        'google/gemini-2.5-flash',
        1000,
        1000
      )
    ).toBe(100);
  });
  it('caps large purchased balances without granting unbounded output', async () => {
    const db = database({ output_price_per_token: 0.0000001 });
    expect(
      await capMaxOutputTokensByCredits(
        db,
        'google/gemini-2.5-flash',
        null,
        1_000_000
      )
    ).toBe(AI_REQUEST_MAX_OUTPUT_TOKENS);
  });
  it.each([
    null,
    { output_price_per_token: 0 },
    { output_price_per_token: 0.001, output_tiers: [{ cost: 'invalid' }] },
  ])('denies missing or malformed prices', async (data) => {
    expect(
      await capMaxOutputTokensByCredits(
        database(data),
        'google/gemini-2.5-flash',
        1000,
        1000
      )
    ).toBeNull();
  });
});
