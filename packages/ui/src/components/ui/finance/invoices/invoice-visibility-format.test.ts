import { describe, expect, it } from 'vitest';
import {
  formatInvoicePromotionValue,
  formatInvoiceRecalculationDescription,
} from './invoice-visibility-format';

const t = (key: string) => key;

describe('invoice visibility formatting', () => {
  it('masks promotion values when finance numbers are hidden', () => {
    expect(
      formatInvoicePromotionValue({
        areNumbersHidden: true,
        currency: 'VND',
        useRatio: false,
        value: 50000,
      })
    ).toBe('•••••');

    expect(
      formatInvoicePromotionValue({
        areNumbersHidden: true,
        currency: 'VND',
        referralPercent: 15,
        useRatio: true,
        value: 10,
      })
    ).toBe('•••••');
  });

  it('formats promotion values when finance numbers are visible', () => {
    expect(
      formatInvoicePromotionValue({
        areNumbersHidden: false,
        currency: 'VND',
        useRatio: false,
        value: 50000,
      })
    ).toMatch(/50.000/);

    expect(
      formatInvoicePromotionValue({
        areNumbersHidden: false,
        currency: 'VND',
        useRatio: true,
        value: 10,
      })
    ).toBe('10%');

    expect(
      formatInvoicePromotionValue({
        areNumbersHidden: false,
        currency: 'VND',
        referralPercent: 15,
        useRatio: true,
        value: 10,
      })
    ).toBe('15%');
  });

  it('masks recalculation totals and rounding when finance numbers are hidden', () => {
    expect(
      formatInvoiceRecalculationDescription({
        areNumbersHidden: true,
        calculatedTotal: 123456,
        currency: 'VND',
        frontendTotal: 120000,
        roundingApplied: 3456,
        t,
      })
    ).toBe(
      'ws-invoices.server_calculated: ••••• | ws-invoices.frontend_calculated: ••••• | ws-invoices.rounding: •••••'
    );
  });

  it('formats recalculation totals and rounding when finance numbers are visible', () => {
    const description = formatInvoiceRecalculationDescription({
      areNumbersHidden: false,
      calculatedTotal: 123456,
      currency: 'VND',
      frontendTotal: 120000,
      roundingApplied: 3456,
      t,
    });

    expect(description).toContain('123.456');
    expect(description).toContain('120.000');
    expect(description).toContain('3.456');
  });
});
