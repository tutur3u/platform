import { expect, it } from 'vitest';
import { searchMiraTools } from './mira-tool-discovery';

it('discovers health and day-planning tools in English and Vietnamese', () => {
  expect(searchMiraTools({ query: 'plan my day' }).selectedTools).toContain(
    'get_day_overview'
  );
  expect(
    searchMiraTools({ query: 'kế hoạch hôm nay' }).selectedTools
  ).toContain('get_day_overview');
  expect(
    searchMiraTools({ query: 'log my body weight' }).selectedTools[0]
  ).toBe('log_body_weight');
  expect(searchMiraTools({ query: 'ghi cân nặng' }).selectedTools).toContain(
    'log_body_weight'
  );
  const habits = searchMiraTools({ query: 'habit streak' });
  expect(habits.selectedTools).toContain('list_habit_trackers');
  expect(habits.guidance.some(({ domain }) => domain === 'health')).toBe(true);
});
