import {
  resolveFirstDayOfWeek as resolveCanonicalFirstDayOfWeek,
  resolveTimezone as resolveCanonicalTimezone,
} from '@tuturuuu/utils/calendar-settings-resolver';
import { describe, expect, it } from 'vitest';
import {
  resolveFirstDayOfWeek,
  resolveTimezone,
} from '@/lib/calendar-settings-resolver';

describe('workspace calendar preference resolver integration', () => {
  it('keeps the Calendar compatibility path on the canonical resolver', () => {
    expect(resolveTimezone).toBe(resolveCanonicalTimezone);
    expect(resolveFirstDayOfWeek).toBe(resolveCanonicalFirstDayOfWeek);
  });

  it('prefers saved user values and preserves locale fallback', () => {
    expect(
      resolveTimezone(
        { timezone: 'Asia/Ho_Chi_Minh' },
        { timezone: 'Europe/London' }
      )
    ).toBe('Asia/Ho_Chi_Minh');
    expect(
      resolveFirstDayOfWeek(
        { first_day_of_week: 'auto' },
        { first_day_of_week: 'auto' },
        'en-US'
      )
    ).toBe('sunday');
  });
});
