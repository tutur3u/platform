import { describe, expect, it } from 'vitest';
import { calendarTimezoneSchema } from './settings-validation';

describe('calendar timezone preference validation', () => {
  it.each([
    'auto',
    'UTC',
    'Etc/UTC',
    'Asia/Ho_Chi_Minh',
    'America/New_York',
    'Europe/Berlin',
    'Etc/GMT+7',
  ])('preserves supported preference %s', (timezone) => {
    expect(calendarTimezoneSchema.parse(timezone)).toBe(timezone);
  });
  it.each(['', 'Mars/Unknown', '+07:00', ' UTC ', 'Asia/Ho_Chi_Minh/Invalid'])(
    'rejects unsupported preference %s',
    (timezone) => {
      expect(calendarTimezoneSchema.safeParse(timezone).success).toBe(false);
    }
  );
});
