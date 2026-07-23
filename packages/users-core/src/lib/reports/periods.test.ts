import { describe, expect, it } from 'vitest';
import {
  assertValidReportTimezone,
  getCalendarReportPeriod,
  getNextReportPeriodStart,
  reportLocalTimeToUtc,
} from './periods';

describe('calendar report periods', () => {
  it('uses Monday through Sunday for weekly periods', () => {
    expect(
      getCalendarReportPeriod({
        cadence: 'weekly',
        reference: new Date('2026-07-23T12:00:00Z'),
        timezone: 'Asia/Ho_Chi_Minh',
      })
    ).toMatchObject({ start: '2026-07-20', end: '2026-07-26' });
  });

  it('handles leap-year monthly boundaries', () => {
    expect(
      getCalendarReportPeriod({
        cadence: 'monthly',
        reference: new Date('2024-02-10T12:00:00Z'),
        timezone: 'UTC',
      })
    ).toMatchObject({ start: '2024-02-01', end: '2024-02-29' });
  });

  it('handles quarters and years', () => {
    expect(
      getCalendarReportPeriod({
        cadence: 'quarterly',
        reference: new Date('2026-12-10T12:00:00Z'),
        timezone: 'UTC',
      })
    ).toMatchObject({
      start: '2026-10-01',
      end: '2026-12-31',
      label: 'Q4 2026',
    });
    expect(
      getCalendarReportPeriod({
        cadence: 'yearly',
        reference: new Date('2026-01-01T12:00:00Z'),
        timezone: 'UTC',
      })
    ).toMatchObject({ start: '2026-01-01', end: '2026-12-31' });
  });

  it('resolves the previous completed calendar period at a timezone boundary', () => {
    expect(
      getCalendarReportPeriod({
        cadence: 'monthly',
        completed: true,
        reference: new Date('2026-08-01T00:30:00+07:00'),
        timezone: 'Asia/Ho_Chi_Minh',
      })
    ).toMatchObject({ start: '2026-07-01', end: '2026-07-31' });
  });

  it('calculates the next period start and rejects invalid timezones', () => {
    expect(getNextReportPeriodStart({ end: '2026-12-31' })).toBe('2027-01-01');
    expect(() => assertValidReportTimezone('Not/A_Timezone')).toThrow(
      'Invalid report timezone'
    );
  });

  it('converts a local delivery time to UTC across timezone offsets', () => {
    expect(
      reportLocalTimeToUtc({
        date: '2026-08-01',
        time: '09:00',
        timezone: 'Asia/Ho_Chi_Minh',
      }).toISOString()
    ).toBe('2026-08-01T02:00:00.000Z');
  });
});
