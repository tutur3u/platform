import { describe, expect, it } from 'vitest';
import { SLIDE_IDS, slideFromHash, subscriptionEstimate } from './pitch-model';

const prices = {
  plus: { monthly: 9, annual: 90 },
  pro: { monthly: 19, annual: 190 },
};

describe('pitch share links and catalog billing illustration', () => {
  it('opens named slides and safely falls back for unknown fragments', () => {
    expect(slideFromHash('#pricing')).toBe(SLIDE_IDS.indexOf('calculator'));
    expect(slideFromHash('#ownership')).toBe(SLIDE_IDS.indexOf('ecosystem'));
    expect(slideFromHash('#unknown')).toBe(0);
    expect(slideFromHash('')).toBe(0);
  });
  it('shows the annual charge, not the monthly equivalent, for annual billing', () => {
    expect(subscriptionEstimate(10, false, prices)).toEqual({
      plus: 90,
      pro: 190,
    });
    expect(subscriptionEstimate(10, true, prices)).toEqual({
      plus: 900,
      pro: 1900,
    });
  });
  it('bounds invalid or fractional seat inputs', () => {
    expect(subscriptionEstimate(-5, false, prices)).toEqual({
      plus: 9,
      pro: 19,
    });
    expect(subscriptionEstimate(Number.NaN, false, prices)).toEqual({
      plus: 9,
      pro: 19,
    });
    expect(subscriptionEstimate(105, false, prices)).toEqual({
      plus: 900,
      pro: 1900,
    });
    expect(subscriptionEstimate(2.9, false, prices)).toEqual({
      plus: 18,
      pro: 38,
    });
  });
});
