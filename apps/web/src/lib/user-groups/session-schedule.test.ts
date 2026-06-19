import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { findDetachedSessionSeriesRepairCandidate } from './session-schedule';
import type { SeriesRow, SessionRow } from './session-schedule-data';

const groupId = '00000000-0000-0000-0000-000000000101';
const otherGroupId = '00000000-0000-0000-0000-000000000102';

function series(overrides: Partial<SeriesRow> = {}): SeriesRow {
  return {
    days_of_week: [1, 3, 5],
    description: null,
    description_json: null,
    end_time: '16:00:00',
    end_timezone: 'Asia/Ho_Chi_Minh',
    group_id: groupId,
    id: '00000000-0000-4000-8000-000000000301',
    interval_weeks: 1,
    source: 'admin',
    start_date: '2026-06-22',
    start_time: '14:00:00',
    start_timezone: 'Asia/Ho_Chi_Minh',
    title: 'Test group',
    until_date: null,
    ws_id: '00000000-0000-0000-0000-000000000001',
    ...overrides,
  };
}

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    description: null,
    description_json: null,
    end_timezone: 'Asia/Ho_Chi_Minh',
    ends_at: '2026-06-26T09:00:00.000Z',
    group_id: groupId,
    id: '00000000-0000-0000-0000-000000000201',
    recurrence_instance_date: null,
    series_id: null,
    source: null,
    start_timezone: 'Asia/Ho_Chi_Minh',
    starts_at: '2026-06-26T07:00:00.000Z',
    status: 'scheduled',
    title: 'Test group',
    ws_id: '00000000-0000-0000-0000-000000000001',
    ...overrides,
  };
}

describe('findDetachedSessionSeriesRepairCandidate', () => {
  it('reattaches exact detached sessions without moving them', () => {
    const match = findDetachedSessionSeriesRepairCandidate({
      row: row(),
      seriesRows: [series()],
    });

    expect(match?.mode).toBe('exact');
    expect(match?.date).toBe('2026-06-26');
    expect(match?.occurrence.startsAt).toBe('2026-06-26T07:00:00.000Z');
    expect(match?.occurrence.endsAt).toBe('2026-06-26T09:00:00.000Z');
  });

  it('snaps wrong-time detached sessions back to the recurring timeblock', () => {
    const match = findDetachedSessionSeriesRepairCandidate({
      row: row({
        ends_at: '2026-06-26T10:30:00.000Z',
        starts_at: '2026-06-26T08:30:00.000Z',
      }),
      seriesRows: [series()],
    });

    expect(match?.mode).toBe('snap');
    expect(match?.date).toBe('2026-06-26');
    expect(match?.occurrence.startsAt).toBe('2026-06-26T07:00:00.000Z');
    expect(match?.occurrence.endsAt).toBe('2026-06-26T09:00:00.000Z');
  });

  it('keeps exact mode strict for wrong-time sessions', () => {
    const match = findDetachedSessionSeriesRepairCandidate({
      mode: 'exact',
      row: row({
        ends_at: '2026-06-26T10:30:00.000Z',
        starts_at: '2026-06-26T08:30:00.000Z',
      }),
      seriesRows: [series()],
    });

    expect(match).toBeNull();
  });

  it('keeps snap mode strict for sessions outside the recurring weekdays', () => {
    const match = findDetachedSessionSeriesRepairCandidate({
      mode: 'snap',
      row: row({
        ends_at: '2026-06-25T09:00:00.000Z',
        starts_at: '2026-06-25T07:00:00.000Z',
      }),
      seriesRows: [series()],
    });

    expect(match).toBeNull();
  });

  it('adds a missing weekday back to a matching weekly pattern', () => {
    const match = findDetachedSessionSeriesRepairCandidate({
      row: row({
        ends_at: '2026-06-24T09:00:00.000Z',
        starts_at: '2026-06-24T07:00:00.000Z',
      }),
      seriesRows: [series({ days_of_week: [1, 5] })],
    });

    expect(match?.mode).toBe('weekly');
    expect(match?.date).toBe('2026-06-24');
    expect(match?.occurrence.startsAt).toBe('2026-06-24T07:00:00.000Z');
    expect(match?.occurrence.endsAt).toBe('2026-06-24T09:00:00.000Z');
  });

  it('rejects sessions from another group', () => {
    const match = findDetachedSessionSeriesRepairCandidate({
      row: row({ group_id: otherGroupId }),
      seriesRows: [series()],
    });

    expect(match).toBeNull();
  });

  it('rejects ambiguous snap candidates', () => {
    expect(() =>
      findDetachedSessionSeriesRepairCandidate({
        row: row({
          ends_at: '2026-06-26T10:30:00.000Z',
          starts_at: '2026-06-26T08:30:00.000Z',
        }),
        seriesRows: [
          series(),
          series({
            end_time: '20:00:00',
            id: '00000000-0000-4000-8000-000000000302',
            start_time: '18:00:00',
          }),
        ],
      })
    ).toThrow('ambiguous_series_reconciliation');
  });

  it('rejects ambiguous weekly pattern repair candidates', () => {
    expect(() =>
      findDetachedSessionSeriesRepairCandidate({
        row: row({
          ends_at: '2026-06-24T09:00:00.000Z',
          starts_at: '2026-06-24T07:00:00.000Z',
        }),
        seriesRows: [
          series({ days_of_week: [1, 5] }),
          series({
            days_of_week: [1, 5],
            id: '00000000-0000-4000-8000-000000000302',
          }),
        ],
      })
    ).toThrow('ambiguous_series_reconciliation');
  });
});
