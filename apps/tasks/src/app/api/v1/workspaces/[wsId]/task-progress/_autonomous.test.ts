import type { TaskProgressMetric } from '@tuturuuu/tasks-api';
import { describe, expect, it } from 'vitest';
import {
  focusSessionRowsToEntries,
  isAutonomousTaskMetric,
  taskCompletionRowsToEntries,
} from './_autonomous';

function metric(unitKind: TaskProgressMetric['unit_kind']): TaskProgressMetric {
  return {
    aggregation: 'sum',
    archived_at: null,
    created_at: '2026-07-14T00:00:00.000Z',
    created_by: 'user-1',
    description: null,
    id: `metric-${unitKind}`,
    is_default: unitKind === 'tasks',
    name: unitKind,
    unit_kind: unitKind,
    unit_label: unitKind,
    updated_at: '2026-07-14T00:00:00.000Z',
    ws_id: 'workspace-1',
  };
}

describe('autonomous task progress entries', () => {
  it('recognizes metrics backed by canonical task activity', () => {
    expect(isAutonomousTaskMetric(metric('tasks'))).toBe(true);
    expect(isAutonomousTaskMetric(metric('points'))).toBe(true);
    expect(isAutonomousTaskMetric(metric('minutes'))).toBe(true);
    expect(isAutonomousTaskMetric(metric('focus_sessions'))).toBe(true);
    expect(isAutonomousTaskMetric(metric('custom'))).toBe(false);
  });

  it('maps completion history to task and estimation totals', () => {
    const rows = [
      {
        changed_at: '2026-07-14T08:30:00.000Z',
        changed_by: 'user-1',
        id: 'history-1',
        metadata: { board_id: 'board-1' },
        task: {
          board_id: 'board-1',
          estimation_points: 3,
          list_id: 'list-1',
        },
        task_id: 'task-1',
      },
    ];

    expect(taskCompletionRowsToEntries(rows, metric('tasks'))[0]).toMatchObject(
      {
        created_by: 'user-1',
        effectiveValue: 1,
        entry_date: '2026-07-14',
        source_type: 'task_completion',
        task_id: 'task-1',
      }
    );
    expect(
      taskCompletionRowsToEntries(rows, metric('points'))[0]?.effectiveValue
    ).toBe(3);
  });

  it('maps completed focus sessions to minutes and session counts', () => {
    const rows = [
      {
        created_at: '2026-07-14T09:00:00.000Z',
        date: '2026-07-14',
        duration_seconds: 5_490,
        id: 'session-1',
        tags: ['deep-work'],
        task_id: 'task-1',
        user_id: 'user-1',
      },
    ];

    expect(focusSessionRowsToEntries(rows, metric('minutes'))[0]).toMatchObject(
      {
        effectiveValue: 91.5,
        source_type: 'time_tracking',
        tags: ['automatic', 'focus', 'deep-work'],
      }
    );
    expect(
      focusSessionRowsToEntries(rows, metric('focus_sessions'))[0]
        ?.effectiveValue
    ).toBe(1);
  });

  it('ignores point completions and sessions without measurable value', () => {
    expect(
      taskCompletionRowsToEntries(
        [
          {
            changed_at: '2026-07-14T08:30:00.000Z',
            id: 'history-1',
            task: { estimation_points: 0 },
          },
        ],
        metric('points')
      )
    ).toEqual([]);
    expect(
      focusSessionRowsToEntries(
        [{ date: '2026-07-14', duration_seconds: 0, id: 'session-1' }],
        metric('minutes')
      )
    ).toEqual([]);
  });
});
