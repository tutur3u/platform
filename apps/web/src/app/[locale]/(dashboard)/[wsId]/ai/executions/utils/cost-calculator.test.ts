import { describe, expect, it } from 'vitest';
import { calculateCost } from './cost-calculator';

describe('calculateCost', () => {
  it('prices tokens per million', () => {
    const cost = calculateCost('gemini-2.5-flash', {
      inputTokens: 1_000_000,
      outputTokens: 2_000_000,
      reasoningTokens: 500_000,
      totalTokens: 3_500_000,
    });
    expect(cost.inputCost).toBeCloseTo(0.3);
    expect(cost.outputCost).toBeCloseTo(5);
    expect(cost.reasoningCost).toBeCloseTo(1.25);
    expect(cost.totalCostUSD).toBeCloseTo(6.55);
  });

  it('treats missing usage as zero', () => {
    const cost = calculateCost(
      'gemini-2.5-pro',
      undefined as unknown as Parameters<typeof calculateCost>[1]
    );
    expect(cost.totalCostUSD).toBe(0);
  });
});
