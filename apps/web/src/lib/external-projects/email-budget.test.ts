import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_PROJECT_EMAIL_MONTHLY_BUDGET_VND,
  EXTERNAL_PROJECT_EMAIL_UNIT_PRICE_VND,
  startOfBillingMonth,
  summariseBudget,
  wouldExceedBudget,
} from './email-budget';

describe('external project email budget', () => {
  it('prices the allowance at the published unit rate', () => {
    expect(EXTERNAL_PROJECT_EMAIL_UNIT_PRICE_VND).toBe(25);
    expect(EXTERNAL_PROJECT_EMAIL_MONTHLY_BUDGET_VND).toBe(20_000);
    // 20,000₫ at 25₫ each is exactly 800 emails a month.
    expect(
      EXTERNAL_PROJECT_EMAIL_MONTHLY_BUDGET_VND /
        EXTERNAL_PROJECT_EMAIL_UNIT_PRICE_VND
    ).toBe(800);
  });

  it('summarises spend and remaining headroom', () => {
    expect(summariseBudget(0)).toEqual({
      budgetVnd: 20_000,
      remainingVnd: 20_000,
      sent: 0,
      spentVnd: 0,
      unitPriceVnd: 25,
    });

    expect(summariseBudget(100)).toMatchObject({
      remainingVnd: 17_500,
      spentVnd: 2_500,
    });
  });

  it('never reports negative headroom once the cap is passed', () => {
    expect(summariseBudget(1_000).remainingVnd).toBe(0);
  });

  it('allows the final email that lands exactly on the cap', () => {
    const budget = summariseBudget(799);

    expect(wouldExceedBudget(budget, 1)).toBe(false);
    expect(budget.spentVnd + 25).toBe(
      EXTERNAL_PROJECT_EMAIL_MONTHLY_BUDGET_VND
    );
  });

  it('refuses the email that would cross the cap', () => {
    expect(wouldExceedBudget(summariseBudget(800), 1)).toBe(true);
  });

  it('accounts for a whole batch, not just one send', () => {
    const budget = summariseBudget(795);

    expect(wouldExceedBudget(budget, 5)).toBe(false);
    expect(wouldExceedBudget(budget, 6)).toBe(true);
  });

  it('bills by UTC calendar month so the window cannot drift with the caller', () => {
    expect(
      startOfBillingMonth(new Date('2026-07-26T15:30:00+07:00')).toISOString()
    ).toBe('2026-07-01T00:00:00.000Z');
    expect(
      startOfBillingMonth(new Date('2026-01-01T00:00:00.000Z')).toISOString()
    ).toBe('2026-01-01T00:00:00.000Z');
  });
});
