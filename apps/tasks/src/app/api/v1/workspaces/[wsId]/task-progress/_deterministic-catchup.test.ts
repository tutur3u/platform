import { describe, expect, it } from 'vitest';
import { buildDeterministicCatchup } from './_deterministic-catchup';
import { buildTaskProgressInsights } from './_insights';

const now = new Date('2026-07-15T12:00:00.000Z'); // Wednesday

function insightsFor(daily: Array<{ date: string; value: number }>) {
  return buildTaskProgressInsights(daily, now);
}

describe('buildDeterministicCatchup', () => {
  it('produces a schema-valid catch-up with activity', () => {
    const daily = [
      { date: '2026-07-13', value: 5 },
      { date: '2026-07-14', value: 8 },
      { date: '2026-07-15', value: 3 },
    ];
    const intelligence = insightsFor(daily);
    const result = buildDeterministicCatchup({
      daily,
      insights: intelligence.insights,
      period: 'weekly',
      periods: intelligence.periods,
      unitLabel: 'tasks',
    });

    expect(result.executiveSummary.length).toBeGreaterThan(0);
    expect(result.executiveSummary.length).toBeLessThanOrEqual(600);
    expect(result.highlights.length).toBeGreaterThan(0);
    expect(result.highlights.length).toBeLessThanOrEqual(4);
    expect(result.nextActions.length).toBeGreaterThan(0);
    expect(result.nextActions.length).toBeLessThanOrEqual(4);
    expect(result.watchouts.length).toBeLessThanOrEqual(3);
    // Every string is non-empty and within the catchup schema bounds (180).
    for (const line of [
      ...result.highlights,
      ...result.watchouts,
      ...result.nextActions,
    ]) {
      expect(line.length).toBeGreaterThan(0);
      expect(line.length).toBeLessThanOrEqual(180);
    }
  });

  it('handles an empty dataset with a starter message', () => {
    const intelligence = insightsFor([]);
    const result = buildDeterministicCatchup({
      daily: [],
      insights: intelligence.insights,
      period: 'weekly',
      periods: intelligence.periods,
      unitLabel: 'tasks',
    });
    expect(result.executiveSummary.toLowerCase()).toContain('no progress');
    expect(result.nextActions.length).toBeGreaterThan(0);
  });

  it('mentions a decline when this period is below the previous', () => {
    // Previous week (Jul 6–12) has activity, current week (13–15) is empty.
    const daily = [
      { date: '2026-07-06', value: 10 },
      { date: '2026-07-08', value: 6 },
    ];
    const intelligence = insightsFor(daily);
    const result = buildDeterministicCatchup({
      daily,
      insights: intelligence.insights,
      period: 'weekly',
      periods: intelligence.periods,
      unitLabel: 'words',
    });
    const text = [result.executiveSummary, ...result.watchouts].join(' ');
    expect(text.toLowerCase()).toMatch(/no progress|haven't logged/);
  });
});
