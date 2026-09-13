import { describe, expect, it } from 'vitest';
import { computeAffordableTokens } from '../cap-output-tokens';

describe('computeAffordableTokens', () => {
  it('rejects arithmetic overflow from finite inputs', () => {
    expect(computeAffordableTokens(Number.MAX_VALUE, Number.MIN_VALUE)).toBe(0);
  });
  // 1 credit = $0.0001 USD
  // tokens = (credits * 0.0001 / markup) / pricePerToken

  it('returns 0 when remaining credits are 0', () => {
    expect(computeAffordableTokens(0, 0.0000004, 1.0)).toBe(0);
  });

  it('returns 0 when remaining credits are negative (overdrawn)', () => {
    expect(computeAffordableTokens(-100, 0.0000004, 1.0)).toBe(0);
  });

  it('returns 0 when price per token is 0', () => {
    expect(computeAffordableTokens(1000, 0, 1.0)).toBe(0);
  });

  it('returns 0 when price per token is negative', () => {
    expect(computeAffordableTokens(1000, -0.001, 1.0)).toBe(0);
  });

  it('correctly computes affordable tokens with no markup', () => {
    // 1000 credits * $0.0001 = $0.10 budget
    // price per token = $0.0000004 (gemini-2.5-flash-lite output)
    // affordable = $0.10 / $0.0000004 = 250,000 tokens
    const result = computeAffordableTokens(1000, 0.0000004, 1.0);
    expect(result).toBe(250000);
  });

  it('correctly computes affordable tokens with markup', () => {
    // 1000 credits * $0.0001 / 2.0 markup = $0.05 effective budget
    // affordable = $0.05 / $0.0000004 = 125,000 tokens
    const result = computeAffordableTokens(1000, 0.0000004, 2.0);
    expect(result).toBe(125000);
  });

  it('floors the result to an integer', () => {
    // 10 credits * $0.0001 = $0.001 budget
    // price per token = $0.0000003
    // affordable = $0.001 / $0.0000003 = 3333.33... → floors to 3333
    const result = computeAffordableTokens(10, 0.0000003, 1.0);
    expect(result).toBe(3333);
    expect(Number.isInteger(result)).toBe(true);
  });

  it('handles very small remaining credits (1 credit)', () => {
    // 1 credit * $0.0001 = $0.0001 budget
    // price per token = $0.0000004
    // affordable = $0.0001 / $0.0000004 = 250 tokens
    const result = computeAffordableTokens(1, 0.0000004, 1.0);
    expect(result).toBe(250);
  });

  it('handles very expensive models', () => {
    // 100 credits * $0.0001 = $0.01 budget
    // price per token = $0.00006 (expensive model)
    // affordable = $0.01 / $0.00006 = 166.66... → 166
    const result = computeAffordableTokens(100, 0.00006, 1.0);
    expect(result).toBe(166);
  });

  it('handles large remaining credits', () => {
    // 500,000 credits (PRO tier monthly) * $0.0001 = $50 budget
    // price per token = $0.0000004
    // affordable = $50 / $0.0000004 = 125,000,000 tokens
    const result = computeAffordableTokens(500000, 0.0000004, 1.0);
    expect(result).toBe(125000000);
  });

  it('uses default markup of 1.0 when not specified', () => {
    const withDefault = computeAffordableTokens(1000, 0.0000004);
    const withExplicit = computeAffordableTokens(1000, 0.0000004, 1.0);
    expect(withDefault).toBe(withExplicit);
  });
});

describe('invalid AI budgets', () => {
  it('does not convert malformed prices, balances or discounted markup into spending authority', () => {
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(computeAffordableTokens(value, 1, 1)).toBe(0);
      expect(computeAffordableTokens(1, value, 1)).toBe(0);
      expect(computeAffordableTokens(1, 1, value)).toBe(0);
    }
    expect(computeAffordableTokens(100, 0.01, 0)).toBe(0);
    expect(computeAffordableTokens(100, 0.01, 0.5)).toBe(0);
  });
});
