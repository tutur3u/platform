import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

function messages(locale: 'en' | 'vi') {
  return JSON.parse(
    readFileSync(`${process.cwd()}/messages/${locale}.json`, 'utf8')
  ) as {
    common: { days_of_week: Record<string, string> };
  };
}

describe('group schedule translations', () => {
  it.each(['en', 'vi'] as const)(
    'provides every weekday label in the common namespace for %s',
    (locale) => {
      const weekdayMessages = messages(locale).common.days_of_week;

      for (const weekday of WEEKDAYS) {
        expect(weekdayMessages[weekday], weekday).toBeTruthy();
      }
    }
  );
});
