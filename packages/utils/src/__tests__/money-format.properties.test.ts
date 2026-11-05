import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  getCurrencyConfig,
  getCurrencyLocale,
  isSupportedCurrency,
  resolveSupportedCurrency,
  SUPPORTED_CURRENCIES,
} from '../currencies';
import {
  formatBytes,
  formatCompactNumber,
  formatCurrency,
  formatDuration,
} from '../format';
import {
  getAmountStep,
  getCurrencyFractionDigits,
  getMinorUnitFactor,
  majorToMinor,
  minorToMajor,
  normalizeAmount,
} from '../money';

const properties = { seed: 20261031, numRuns: 250 };

const currency = fc.constantFrom('USD', 'EUR', 'VND', 'JPY', 'BHD', 'KWD');
const supportedCode = fc.constantFrom(
  ...SUPPORTED_CURRENCIES.map((c) => c.code)
);
const minor = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 });
const major = fc.double({
  min: -1_000_000,
  max: 1_000_000,
  noNaN: true,
  noDefaultInfinity: true,
});
const byteCount = fc.integer({ min: 1, max: 1023 * 1024 ** 4 });

const parseDuration = (text: string) => {
  const unitSeconds = { hour: 3600, minute: 60, second: 1 } as const;
  return [...text.matchAll(/(\d+) (hour|minute|second)s?/g)].reduce(
    (total, [, amount, unit]) =>
      total + Number(amount) * unitSeconds[unit as keyof typeof unitSeconds],
    0
  );
};

describe('money minor-unit conversion properties', () => {
  it('majorToMinor inverts minorToMajor for every integer minor amount', () => {
    fc.assert(
      fc.property(minor, currency, (amount, code) => {
        expect(majorToMinor(minorToMajor(amount, code), code)).toBe(amount);
      }),
      properties
    );
  });

  it('majorToMinor always returns a safe integer for finite input', () => {
    fc.assert(
      fc.property(major, currency, (amount, code) => {
        expect(Number.isSafeInteger(majorToMinor(amount, code))).toBe(true);
      }),
      properties
    );
  });

  it('majorToMinor is monotonic non-decreasing in the major amount', () => {
    fc.assert(
      fc.property(major, major, currency, (left, right, code) => {
        const [low, high] = left <= right ? [left, right] : [right, left];
        expect(majorToMinor(low, code)).toBeLessThanOrEqual(
          majorToMinor(high, code)
        );
      }),
      properties
    );
  });

  it('majorToMinor stays within half a minor unit of the scaled major amount', () => {
    fc.assert(
      fc.property(major, currency, (amount, code) => {
        const scaled = amount * getMinorUnitFactor(code);
        expect(
          Math.abs(majorToMinor(amount, code) - scaled)
        ).toBeLessThanOrEqual(0.5001);
      }),
      properties
    );
  });

  it('normalizeAmount is idempotent up to the sign of zero', () => {
    fc.assert(
      fc.property(major, currency, (amount, code) => {
        const once = normalizeAmount(amount, code);
        expect(normalizeAmount(once, code) + 0).toBe(once + 0);
      }),
      properties
    );
  });

  it('normalizeAmount lands within half a minor unit of the input and carries at most the currency fraction digits', () => {
    fc.assert(
      fc.property(major, currency, (amount, code) => {
        const normalized = normalizeAmount(amount, code);
        const digits = getCurrencyFractionDigits(code);
        expect(Math.abs(normalized - amount)).toBeLessThanOrEqual(
          0.5 / 10 ** digits + 1e-9
        );
        expect(Number(normalized.toFixed(digits)) + 0).toBe(normalized + 0);
      }),
      properties
    );
  });

  it('getAmountStep multiplied by the minor-unit factor is exactly one', () => {
    fc.assert(
      fc.property(currency, (code) => {
        expect(
          Math.round(Number(getAmountStep(code)) * getMinorUnitFactor(code))
        ).toBe(1);
        expect(getMinorUnitFactor(code)).toBe(
          10 ** getCurrencyFractionDigits(code)
        );
      }),
      properties
    );
  });

  it('majorToMinor and minorToMajor map every non-finite input to zero', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(Number.NaN, Infinity, -Infinity),
        currency,
        (value, code) => {
          expect(majorToMinor(value, code)).toBe(0);
          expect(minorToMajor(value, code)).toBe(0);
          expect(normalizeAmount(value, code)).toBe(0);
        }
      ),
      properties
    );
  });

  it.todo(
    'majorToMinor and normalizeAmount never return negative zero for negative amounts smaller than half a minor unit'
  );
});

describe('currency catalogue properties', () => {
  it('resolveSupportedCurrency returns a supported code for any input and fallback', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
        fc.string(),
        (value, fallback) => {
          expect(
            SUPPORTED_CURRENCIES.some(
              (c) => c.code === resolveSupportedCurrency(value, fallback)
            )
          ).toBe(true);
        }
      ),
      properties
    );
  });

  it('resolveSupportedCurrency is idempotent and ignores case and surrounding whitespace for supported codes', () => {
    fc.assert(
      fc.property(
        supportedCode,
        fc.constantFrom('', ' ', '\t', '  '),
        fc.boolean(),
        (code, padding, lower) => {
          const input = `${padding}${lower ? code.toLowerCase() : code}${padding}`;
          const resolved = resolveSupportedCurrency(input);
          expect(resolved).toBe(code);
          expect(resolveSupportedCurrency(resolved)).toBe(resolved);
        }
      ),
      properties
    );
  });

  it('isSupportedCurrency accepts padded or lower-cased catalogue codes and rejects anything that is not a three-letter code', () => {
    fc.assert(
      fc.property(
        supportedCode,
        fc.constantFrom('', ' ', '  '),
        fc.boolean(),
        (code, padding, lower) => {
          const input = `${padding}${lower ? code.toLowerCase() : code}${padding}`;
          expect(isSupportedCurrency(input)).toBe(true);
          expect(isSupportedCurrency(`${code}X`)).toBe(false);
        }
      ),
      properties
    );
    fc.assert(
      fc.property(
        fc.string().filter((value) => !/^[A-Za-z]{3}$/.test(value.trim())),
        (value) => {
          expect(isSupportedCurrency(value)).toBe(false);
        }
      ),
      properties
    );
  });

  it('getCurrencyLocale returns en-US for anything that is not a supported code and a well-formed locale tag for supported codes', () => {
    fc.assert(
      fc.property(
        fc.string().filter((value) => !/^[A-Za-z]{3}$/.test(value.trim())),
        (value) => {
          expect(getCurrencyLocale(value)).toBe('en-US');
        }
      ),
      properties
    );
    fc.assert(
      fc.property(supportedCode, (code) => {
        const locale = getCurrencyLocale(code);
        expect(Intl.getCanonicalLocales(locale)).toHaveLength(1);
        expect(locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      }),
      properties
    );
  });

  it('every configured locale is accepted by Intl.NumberFormat with its own currency', () => {
    fc.assert(
      fc.property(supportedCode, (code) => {
        const config = getCurrencyConfig(code);
        expect(() =>
          new Intl.NumberFormat(config?.locale, {
            style: 'currency',
            currency: code,
          }).format(1)
        ).not.toThrow();
      }),
      properties
    );
  });
});

describe('number formatting properties', () => {
  it('formatCurrency never renders NaN or Infinity for a finite amount in any supported currency', () => {
    fc.assert(
      fc.property(major, supportedCode, (amount, code) => {
        const text = formatCurrency(amount, code);
        expect(text).not.toMatch(/NaN|Infinity|∞/);
        expect(text.length).toBeGreaterThan(0);
      }),
      properties
    );
  });

  it('formatCurrency with signDisplay never omits the sign of a non-zero amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        supportedCode,
        (amount, code) => {
          const digits = getCurrencyFractionDigits(code);
          const value = amount / 10 ** Math.min(digits, 2);
          const negative = formatCurrency(-value, code, 'en-US', {
            signDisplay: 'always',
          });
          const positive = formatCurrency(value, code, 'en-US', {
            signDisplay: 'always',
          });
          expect(negative).toMatch(/[-−]/);
          expect(positive).toContain('+');
        }
      ),
      properties
    );
  });

  it('formatCompactNumber matches locale grouping for any value below the threshold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -999, max: 999 }),
        fc.integer({ min: 1000, max: 5000 }),
        (value, threshold) => {
          expect(formatCompactNumber(value, { threshold })).toBe(
            value.toLocaleString('en')
          );
        }
      ),
      properties
    );
  });

  it('formatCompactNumber is odd-symmetric for values at or above the threshold', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1000, max: 10 ** 12 }), (value) => {
        expect(formatCompactNumber(-value)).toBe(
          `-${formatCompactNumber(value)}`
        );
      }),
      properties
    );
  });

  it('formatCompactNumber never produces a string longer than the plain integer rendering', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 ** 12 }), (value) => {
        expect(formatCompactNumber(value).length).toBeLessThanOrEqual(
          value.toLocaleString('en').length
        );
      }),
      properties
    );
  });

  it('formatDuration round-trips whole seconds below one hour', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3599 }), (seconds) => {
        expect(parseDuration(formatDuration(seconds))).toBe(seconds);
      }),
      properties
    );
  });

  it('formatDuration drops only the sub-minute remainder from one hour upward', () => {
    fc.assert(
      fc.property(fc.integer({ min: 3600, max: 10 ** 7 }), (seconds) => {
        expect(parseDuration(formatDuration(seconds))).toBe(
          seconds - (seconds % 60)
        );
      }),
      properties
    );
  });

  it.todo('formatDuration uses the singular unit for exactly one second');

  it('formatDuration uses singular units exactly when the amount is one from one minute upward', () => {
    fc.assert(
      fc.property(fc.integer({ min: 60, max: 10 ** 7 }), (seconds) => {
        for (const [, amount, unit] of formatDuration(seconds).matchAll(
          /(\d+) (hours?|minutes?|seconds?)/g
        )) {
          expect(unit?.endsWith('s')).toBe(amount !== '1');
        }
      }),
      properties
    );
  });

  it('formatBytes renders a mantissa below 1024 within rounding error of the input for values under 1023 TB', () => {
    const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    fc.assert(
      fc.property(byteCount, (bytes) => {
        const [mantissa, unit] = formatBytes(bytes, { decimals: 6 }).split(' ');
        expect(units).toContain(unit);
        const exponent = units.indexOf(unit as string);
        expect(Number(mantissa)).toBeLessThan(1024);
        expect(
          Math.abs(Number(mantissa) * 1024 ** exponent - bytes)
        ).toBeLessThanOrEqual(0.5e-6 * 1024 ** exponent + 1e-6);
      }),
      properties
    );
  });

  it.todo(
    'formatBytes never rounds a value just below a unit boundary up to a mantissa of 1024'
  );

  it.todo(
    'formatBytes labels values of one pebibyte or more by magnitude and never emits the label Bytest'
  );

  it('formatBytes accurate mode only swaps decimal unit labels for binary ones', () => {
    fc.assert(
      fc.property(
        byteCount,
        fc.integer({ min: 0, max: 3 }),
        (bytes, decimals) => {
          const normal = formatBytes(bytes, { decimals });
          const accurate = formatBytes(bytes, {
            decimals,
            sizeType: 'accurate',
          });
          expect(accurate.split(' ')[0]).toBe(normal.split(' ')[0]);
          expect(accurate.replace(/(K|M|G|T)iB$/, '$1B')).toBe(normal);
        }
      ),
      properties
    );
  });

  it('formatBytes is monotonic within one unit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1024, max: 1024 ** 2 - 1 }),
        fc.integer({ min: 1024, max: 1024 ** 2 - 1 }),
        (left, right) => {
          const [low, high] = left <= right ? [left, right] : [right, left];
          expect(
            Number(formatBytes(low, { decimals: 3 }).split(' ')[0])
          ).toBeLessThanOrEqual(
            Number(formatBytes(high, { decimals: 3 }).split(' ')[0])
          );
        }
      ),
      properties
    );
  });
});
