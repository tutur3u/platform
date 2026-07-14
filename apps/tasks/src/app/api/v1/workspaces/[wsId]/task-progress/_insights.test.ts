import { describe, expect, it } from 'vitest';
import { buildTaskProgressInsights } from './_insights';

describe('buildTaskProgressInsights', () => {
  it('derives pace, consistency, and working-pattern signals', () => {
    const result = buildTaskProgressInsights(
      [
        { date: '2026-06-29', value: 2 },
        { date: '2026-07-06', value: 3 },
        { date: '2026-07-13', value: 4 },
        { date: '2026-07-14', value: 6 },
        { date: '2026-07-15', value: 2 },
      ],
      new Date('2026-07-15T12:00:00.000Z')
    );

    expect(result.periods.thisWeek).toBe(12);
    expect(result.periods.previousWeek).toBe(3);
    expect(result.insights.projectedWeek).toBe(28);
    expect(result.insights.bestDay).toEqual({
      date: '2026-07-14',
      value: 6,
    });
    expect(result.insights.strongestWeekday?.weekday).toBe(1);
    expect(result.insights.momentumStatus).toBe('accelerating');
    expect(result.insights.recommendation).toBe('raise_goal');
  });

  it('returns a gentle starting signal when no activity exists', () => {
    const result = buildTaskProgressInsights(
      [],
      new Date('2026-07-15T12:00:00.000Z')
    );

    expect(result.insights.momentumStatus).toBe('starting');
    expect(result.insights.recommendation).toBe('start_small');
    expect(result.insights.strongestWeekday).toBeNull();
  });
});
