import { describe, expect, it } from 'vitest';
import {
  formatMailThreadDate,
  formatMailThreadDateTitle,
} from './mail-thread-date';

const now = new Date(2026, 9, 28, 15, 0);
// ICU 72+ separates the day period with U+202F; compare the visible text.
const spaces = (value: string) => value.replace(/[\u202f\u00a0]/g, ' ');

describe('formatMailThreadDate', () => {
  it('shows only the time for mail from today', () => {
    expect(
      spaces(
        formatMailThreadDate(
          new Date(2026, 9, 28, 9, 5).toISOString(),
          'en-US',
          now
        )
      )
    ).toBe('9:05 AM');
  });

  it('shows the day for earlier mail this year and adds the year otherwise', () => {
    expect(
      formatMailThreadDate(
        new Date(2026, 9, 27, 23, 0).toISOString(),
        'en-US',
        now
      )
    ).toBe('Oct 27');
    expect(
      formatMailThreadDate(new Date(2025, 0, 3).toISOString(), 'en-US', now)
    ).toBe('Jan 3, 2025');
  });

  it('ignores missing or invalid dates', () => {
    expect(formatMailThreadDate(null, 'en-US', now)).toBe('');
    expect(formatMailThreadDate('not a date', 'en-US', now)).toBe('');
    expect(formatMailThreadDateTitle('not a date', 'en-US')).toBeUndefined();
  });
});
