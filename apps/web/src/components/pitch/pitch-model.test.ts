import { describe, expect, it } from 'vitest';
import { slideFromHash, subscriptionEstimate } from './pitch-model';

describe('pitch share links and proposed billing illustration', () => {
  it('opens named slides and safely falls back for unknown fragments', () => {
    expect(slideFromHash('#pricing')).toBe(6);
    expect(slideFromHash('#unknown')).toBe(0);
    expect(slideFromHash('')).toBe(0);
  });
  it('shows the annual charge, not the monthly equivalent, for annual billing', () => {
    expect(subscriptionEstimate(10, false)).toEqual({ plus: 90, pro: 190 });
    expect(subscriptionEstimate(10, true)).toEqual({ plus: 900, pro: 1900 });
  });
  it('bounds invalid or fractional seat inputs', () => {
    expect(subscriptionEstimate(-5, false)).toEqual({ plus: 9, pro: 19 });
    expect(subscriptionEstimate(Number.NaN, false)).toEqual({
      plus: 9,
      pro: 19,
    });
    expect(subscriptionEstimate(105, false)).toEqual({ plus: 900, pro: 1900 });
    expect(subscriptionEstimate(2.9, false)).toEqual({ plus: 18, pro: 38 });
  });
});
