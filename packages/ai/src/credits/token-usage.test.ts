import { describe, expect, it } from 'vitest';
import { normalizeAiTokenUsage, toLegacyTokenPricing } from './token-usage';

describe('SDK total output accounting', () => {
  it.each([
    ['Google thinking', 100, 60],
    ['OpenAI reasoning', 100, 40],
    ['Anthropic thinking', 100, 20],
    ['reasoning-only output', 100, 100],
    ['non-reasoning output', 100, 0],
    ['provider without reasoning details', 100, undefined],
  ])('%s keeps reasoning inside output', (_provider, total, reasoning) => {
    const usage = {
      inputTokens: 10,
      outputTokens: total,
      outputTokenDetails: { reasoningTokens: reasoning },
    };
    expect(normalizeAiTokenUsage(usage)).toEqual({
      inputTokens: 10,
      outputTokens: total,
      reasoningTokens: reasoning ?? 0,
    });
    const pricing = toLegacyTokenPricing(usage);
    expect(pricing.outputTokens + pricing.reasoningTokens).toBe(total);
    // Mirrors the additive SQL pricing contract, with equal output/reasoning rates.
    expect(
      pricing.outputTokens * 0.01 + pricing.reasoningTokens * 0.01
    ).toBeCloseTo(total * 0.01);
  });

  it('prefers nested SDK details, including explicit zero, to legacy details', () => {
    expect(
      normalizeAiTokenUsage({
        outputTokens: 10,
        reasoningTokens: 8,
        outputTokenDetails: { reasoningTokens: 0 },
      }).reasoningTokens
    ).toBe(0);
    expect(
      normalizeAiTokenUsage({ outputTokens: 10, reasoningTokens: 8 })
        .reasoningTokens
    ).toBe(8);
  });

  it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'does not invent output from invalid totals (%s)',
    (outputTokens) => {
      expect(
        toLegacyTokenPricing({ outputTokens, reasoningTokens: 100 })
      ).toEqual({ inputTokens: 0, outputTokens: 0, reasoningTokens: 0 });
    }
  );

  it('bounds reasoning to the total and truncates fractional counts', () => {
    expect(
      toLegacyTokenPricing({
        inputTokens: 2.9,
        outputTokens: 10.9,
        reasoningTokens: 99,
      })
    ).toEqual({ inputTokens: 2, outputTokens: 0, reasoningTokens: 10 });
  });
});
