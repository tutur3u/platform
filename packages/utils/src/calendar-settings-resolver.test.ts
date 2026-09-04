import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectLocaleFirstDay,
  detectLocaleTimeFormat,
  detectSystemTimezone,
  firstDayToNumber,
  numberToFirstDay,
  resolveCalendarSettings,
  resolveFirstDayOfWeek,
  resolveTimeFormat,
  resolveTimezone,
} from './calendar-settings-resolver';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('calendar settings resolver', () => {
  it.each([
    ['vi-VN', 'monday'],
    ['en-US', 'sunday'],
    ['en-CA', 'sunday'],
    ['ar-SA', 'saturday'],
    ['he-IL', 'saturday'],
    ['fr-FR', 'monday'],
    ['unsupported-tag', 'monday'],
  ] as const)('derives the first day for %s', (locale, expected) => {
    expect(detectLocaleFirstDay(locale)).toBe(expected);
  });

  it.each([
    {
      label: 'user value',
      user: { first_day_of_week: 'saturday' },
      workspace: { first_day_of_week: 'sunday' },
      locale: 'vi-VN',
      expected: 'saturday',
    },
    {
      label: 'workspace fallback',
      user: { first_day_of_week: 'auto' },
      workspace: { first_day_of_week: 'sunday' },
      locale: 'vi-VN',
      expected: 'sunday',
    },
    {
      label: 'locale fallback for empty values',
      user: { first_day_of_week: '' },
      workspace: { first_day_of_week: null },
      locale: 'ar-SA',
      expected: 'saturday',
    },
    {
      label: 'locale fallback for null settings',
      user: null,
      workspace: null,
      locale: 'en-US',
      expected: 'sunday',
    },
  ])(
    'resolves first-day precedence from $label',
    ({ user, workspace, locale, expected }) => {
      expect(resolveFirstDayOfWeek(user, workspace, locale)).toBe(expected);
    }
  );

  it('resolves timezone precedence and fixed system fallback', () => {
    const originalDateTimeFormat = Intl.DateTimeFormat;
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(((
      ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
    ) => {
      if (args.length > 0) return new originalDateTimeFormat(...args);
      return {
        resolvedOptions: () => ({ timeZone: 'Pacific/Auckland' }),
      } as Intl.DateTimeFormat;
    }) as typeof Intl.DateTimeFormat);

    expect(
      resolveTimezone(
        { timezone: 'Asia/Ho_Chi_Minh' },
        { timezone: 'Europe/London' }
      )
    ).toBe('Asia/Ho_Chi_Minh');
    expect(
      resolveTimezone({ timezone: 'auto' }, { timezone: 'Europe/London' })
    ).toBe('Europe/London');
    expect(resolveTimezone({ timezone: '' }, { timezone: null })).toBe(
      'Pacific/Auckland'
    );
    expect(detectSystemTimezone()).toBe('Pacific/Auckland');
  });

  it('falls back to UTC when system timezone detection throws', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Intl unavailable');
    });

    expect(detectSystemTimezone()).toBe('UTC');
  });

  it.each([
    ['en-US', '1', '12h'],
    ['vi-VN', '13', '24h'],
  ] as const)(
    'detects the %s time format from fixed Intl parts',
    (locale, hour, expected) => {
      vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
        (() =>
          ({
            formatToParts: () => [{ type: 'hour', value: hour }],
          }) as Intl.DateTimeFormat) as typeof Intl.DateTimeFormat
      );

      expect(detectLocaleTimeFormat(locale)).toBe(expected);
    }
  );

  it('uses locale-specific time-format fallbacks when Intl rejects a tag', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new RangeError('Unsupported locale');
    });

    expect(detectLocaleTimeFormat('en-invalid')).toBe('12h');
    expect(detectLocaleTimeFormat('xx-invalid')).toBe('24h');
  });

  it('prefers an explicit user time format over locale detection', () => {
    expect(resolveTimeFormat({ time_format: '24h' }, 'en-US')).toBe('24h');
    expect(resolveTimeFormat({ time_format: 'auto' }, 'en-US')).toBe(
      detectLocaleTimeFormat('en-US')
    );
  });

  it('resolves the complete settings object without changing precedence', () => {
    expect(
      resolveCalendarSettings(
        {
          timezone: 'Asia/Ho_Chi_Minh',
          first_day_of_week: 'auto',
          time_format: '24h',
        },
        {
          timezone: 'Europe/London',
          first_day_of_week: 'sunday',
        },
        'vi-VN'
      )
    ).toEqual({
      timezone: 'Asia/Ho_Chi_Minh',
      firstDayOfWeek: 'sunday',
      timeFormat: '24h',
    });
  });

  it.each([
    ['sunday', 0],
    ['monday', 1],
    ['saturday', 6],
  ] as const)('converts %s to %i and back', (day, number) => {
    expect(firstDayToNumber(day)).toBe(number);
    expect(numberToFirstDay(number)).toBe(day);
  });

  it('resolves auto and unsupported conversion values deterministically', () => {
    expect(firstDayToNumber('auto', 'en-US')).toBe(0);
    expect(numberToFirstDay(3)).toBe('monday');
  });
});
