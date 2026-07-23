import { describe, expect, it } from 'vitest';
import { buildScopedDeterministicMetrics } from './context';

describe('buildScopedDeterministicMetrics', () => {
  it('keeps only subject-scoped counts and the latest metric value', () => {
    const result = buildScopedDeterministicMetrics({
      attendance: [
        { date: '2026-07-01', notes: '', status: 'present' },
        { date: '2026-07-08', notes: 'Late', status: 'late' },
      ],
      dailyChecks: [
        {
          approval_status: 'APPROVED',
          is_completed: true,
          post_id: 'post-1',
        },
        {
          approval_status: 'PENDING',
          is_completed: false,
          post_id: 'post-2',
        },
      ],
      indicators: [
        {
          created_at: '2026-07-01T00:00:00Z',
          indicator_id: 'metric-1',
          value: 4,
        },
        {
          created_at: '2026-07-20T00:00:00Z',
          indicator_id: 'metric-1',
          value: 8,
        },
      ],
      metrics: [
        {
          factor: 1,
          id: 'metric-1',
          is_weighted: false,
          name: 'Progress',
          unit: 'points',
        },
      ],
      sessions: [
        {
          ends_at: '2026-07-10T10:00:00Z',
          starts_at: '2026-07-10T09:00:00Z',
          status: 'completed',
          title: 'Review',
        },
      ],
    });

    expect(result.daily_reports).toEqual({
      approved: 1,
      completed: 1,
      total: 2,
    });
    expect(result.metrics).toEqual([
      {
        factor: 1,
        is_weighted: false,
        name: 'Progress',
        unit: 'points',
        value: 8,
      },
    ]);
    expect(result.attendance).toHaveLength(2);
    expect(result.sessions).toHaveLength(1);
  });
});
