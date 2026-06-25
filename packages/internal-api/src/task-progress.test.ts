import { describe, expect, it, vi } from 'vitest';
import {
  createTaskLeaderboard,
  createTaskProgressEntry,
  createTaskProgressGoal,
  createTaskProgressMetric,
  getTaskProgressStats,
  importTaskProgressEntries,
  isTaskProgressSchemaUnavailable,
  listTaskLeaderboards,
  listTaskProgressEntries,
  listTaskProgressGoals,
  listTaskProgressMetrics,
} from './task-progress';

describe('task progress internal API helpers', () => {
  it('uses stable task-progress paths for list and mutation helpers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, schemaAvailable: true }),
    });
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as typeof fetch,
    };

    await listTaskProgressMetrics('ws 1', options);
    await createTaskProgressMetric(
      'ws 1',
      { name: 'Words', unit_label: 'words', unit_kind: 'words' },
      options
    );
    await listTaskProgressEntries('ws 1', { metric_id: 'metric-1' }, options);
    await createTaskProgressEntry(
      'ws 1',
      { metric_id: 'metric-1', value: 500 },
      options
    );
    await listTaskProgressGoals('ws 1', { status: 'active' }, options);
    await createTaskProgressGoal(
      'ws 1',
      {
        metric_id: 'metric-1',
        name: 'Draft',
        period_start: '2026-06-25',
        target_value: 1000,
      },
      options
    );
    await getTaskProgressStats('ws 1', { metric_id: 'metric-1' }, options);
    await listTaskLeaderboards('ws 1', { status: 'active' }, options);
    await createTaskLeaderboard(
      'ws 1',
      {
        metric_id: 'metric-1',
        name: 'Sprint',
        period_start: '2026-06-25',
      },
      options
    );
    await importTaskProgressEntries(
      'ws 1',
      { entries: [{ metric_id: 'metric-1', value: 10 }], commit: false },
      options
    );

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://internal.example.com/api/v1/workspaces/ws%201/task-progress/metrics',
      'https://internal.example.com/api/v1/workspaces/ws%201/task-progress/metrics',
      'https://internal.example.com/api/v1/workspaces/ws%201/task-progress/entries?metric_id=metric-1',
      'https://internal.example.com/api/v1/workspaces/ws%201/task-progress/entries',
      'https://internal.example.com/api/v1/workspaces/ws%201/task-progress/goals?status=active',
      'https://internal.example.com/api/v1/workspaces/ws%201/task-progress/goals',
      'https://internal.example.com/api/v1/workspaces/ws%201/task-progress/stats?metric_id=metric-1',
      'https://internal.example.com/api/v1/workspaces/ws%201/task-progress/leaderboards?status=active',
      'https://internal.example.com/api/v1/workspaces/ws%201/task-progress/leaderboards',
      'https://internal.example.com/api/v1/workspaces/ws%201/task-progress/import',
    ]);
  });

  it('identifies rollout-safe schema unavailable responses', () => {
    expect(
      isTaskProgressSchemaUnavailable({
        ok: false,
        code: 'schema_unavailable',
        schemaAvailable: false,
        message: 'migration pending',
      })
    ).toBe(true);
    expect(isTaskProgressSchemaUnavailable({ ok: true })).toBe(false);
  });
});
