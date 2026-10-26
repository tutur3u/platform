import fc from 'fast-check';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  addMoney,
  formatMoney,
  getFinanceMinorUnitFactor,
  type MinorUnits,
  type Money,
  moneyToMajor,
  parseMoneyFromMajor,
  parseMoneyFromMinor,
} from './finance-money';

// fast-check includes this seed and the shrunk counterexample path on failure.
const properties = { seed: 20261026, numRuns: 250 };
const currency = fc.constantFrom(
  'USD',
  'EUR',
  'VND',
  'JPY',
  'BHD',
  'MGA',
  'CLF'
);
const minor = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });

describe('Finance money boundary', () => {
  it('requires branded money for arithmetic and display', () => {
    expectTypeOf<number>().not.toExtend<MinorUnits>();
    expectTypeOf<number>().not.toExtend<Money>();
    expectTypeOf<{
      minorUnits: number;
      currency: string;
    }>().not.toExtend<Money>();
    expectTypeOf(addMoney).parameter(0).toEqualTypeOf<Money>();
    expectTypeOf(addMoney).parameter(1).toEqualTypeOf<Money>();
    expectTypeOf(formatMoney).parameter(0).toEqualTypeOf<Money>();
  });

  it('preserves minor units through major conversion for every currency precision', () => {
    fc.assert(
      fc.property(minor, currency, (amount, code) => {
        const money = parseMoneyFromMinor(amount, code);
        expect(parseMoneyFromMajor(moneyToMajor(money), code)).toEqual(money);
        expect(Number.isSafeInteger(money.minorUnits)).toBe(true);
        expect(Object.is(money.minorUnits, -0)).toBe(false);
      }),
      properties
    );
  });

  it('preserves totals when a set of amounts is summed in partitions', () => {
    fc.assert(
      fc.property(
        fc.array(minor, { maxLength: 50 }),
        fc.nat(),
        currency,
        (amounts, split, code) => {
          const zero = parseMoneyFromMinor(0, code);
          const sum = (values: number[]) =>
            values
              .map((value) => parseMoneyFromMinor(value, code))
              .reduce(addMoney, zero);
          const index = split % (amounts.length + 1);
          const whole = sum(amounts);
          expect(
            addMoney(sum(amounts.slice(0, index)), sum(amounts.slice(index)))
          ).toEqual(whole);
          expect(whole.minorUnits).toBe(
            amounts.reduce((total, value) => total + value, 0)
          );
          expect(Object.is(whole.minorUnits, -0)).toBe(false);
        }
      ),
      properties
    );
  });

  it('rounds once at the major-unit boundary and stays idempotent', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1_000_000, max: 1_000_000, noNaN: true }),
        currency,
        (amount, code) => {
          const money = parseMoneyFromMajor(amount, code);
          const rounded = moneyToMajor(money);
          expect(parseMoneyFromMajor(rounded, code)).toEqual(money);
          expect(Math.abs(rounded - amount)).toBeLessThanOrEqual(
            0.501 / getFinanceMinorUnitFactor(code)
          );
          expect(Object.is(money.minorUnits, -0)).toBe(false);
          expect(Object.is(rounded, -0)).toBe(false);
        }
      ),
      properties
    );
  });

  it('rejects currency mismatches instead of silently adding their numbers', () => {
    fc.assert(
      fc.property(
        minor,
        minor,
        fc.tuple(currency, currency).filter(([left, right]) => left !== right),
        (left, right, [leftCurrency, rightCurrency]) => {
          expect(() =>
            addMoney(
              parseMoneyFromMinor(left, leftCurrency),
              parseMoneyFromMinor(right, rightCurrency)
            )
          ).toThrow('different currencies');
        }
      ),
      properties
    );
  });

  it('formats the branded minor-unit value with the currency scale exactly once', () => {
    fc.assert(
      fc.property(minor, currency, (amount, code) => {
        const money = parseMoneyFromMinor(amount, code);
        const expected = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: code,
        }).format(amount / getFinanceMinorUnitFactor(code));
        expect(formatMoney(money, 'en-US')).toBe(expected);
      }),
      properties
    );
  });

  it('rejects fractional minor units, unsafe totals, and non-finite API input', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.double({ min: 0.1, max: 0.9, noNaN: true }),
        (whole, fraction) => {
          expect(() => parseMoneyFromMinor(whole + fraction, 'USD')).toThrow();
        }
      ),
      properties
    );
    for (const value of [
      Number.NaN,
      Infinity,
      -Infinity,
      '100',
      null,
      undefined,
    ]) {
      expect(() => parseMoneyFromMinor(value, 'USD')).toThrow();
      expect(() => parseMoneyFromMajor(value, 'USD')).toThrow();
    }
    for (const sign of [-1, 1]) {
      expect(() =>
        addMoney(
          parseMoneyFromMinor(sign * Number.MAX_SAFE_INTEGER, 'USD'),
          parseMoneyFromMinor(sign, 'USD')
        )
      ).toThrow(RangeError);
    }
    expect(parseMoneyFromMinor(-0, ' usd ')).toEqual({
      minorUnits: 0,
      currency: 'USD',
    });
    expect(parseMoneyFromMajor(1.005, 'USD').minorUnits).toBe(101);
  });

  it('preserves the persisted Finance scale when Intl uses another precision', () => {
    expect(moneyToMajor(parseMoneyFromMinor(123, 'MGA'))).toBe(123);
    expect(moneyToMajor(parseMoneyFromMinor(123, 'CLF'))).toBe(1.23);
    expect(moneyToMajor(parseMoneyFromMinor(123, 'BHD'))).toBe(0.123);
    expect(parseMoneyFromMajor(123, 'MGA').minorUnits).toBe(123);
    expect(parseMoneyFromMajor(1.23, 'CLF').minorUnits).toBe(123);
  });
});
