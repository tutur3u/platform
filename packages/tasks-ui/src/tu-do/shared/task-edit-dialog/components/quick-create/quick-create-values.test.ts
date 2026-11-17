import { describe, expect, it } from 'vitest';
import { formatQuickCreateDate } from './quick-create-values';

describe('formatQuickCreateDate', () => {
  // 23:30 UTC on Nov 20 is already Nov 21 in Ho Chi Minh City (UTC+7).
  const instant = new Date(Date.UTC(2026, 10, 20, 23, 30));

  it('formats in the calendar timezone preference', () => {
    expect(formatQuickCreateDate(instant, 'en-US', 'Asia/Ho_Chi_Minh')).toBe(
      'Sat, Nov 21'
    );
    expect(formatQuickCreateDate(instant, 'en-US', 'UTC')).toBe('Fri, Nov 20');
  });

  it('falls back to the local timezone when the zone is unknown', () => {
    expect(formatQuickCreateDate(instant, 'en-US', 'Not/A_Zone')).toBe(
      formatQuickCreateDate(instant, 'en-US')
    );
  });
});
