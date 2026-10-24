import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import {
  convertWeight,
  getDayWindow,
  resolveUserTimezone,
  summarizeWeights,
  toDateKey,
} from './habit-helpers';
import { trackerFixture } from './habit-test-utils';
import { executeListHabitTrackers, executeLogHabitEntry } from './habits';

const api = vi.hoisted(() => ({
  listTrackers: vi.fn(),
  createEntry: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaceHabitTrackers: api.listTrackers,
  createWorkspaceHabitTrackerEntry: api.createEntry,
  createWorkspaceHabitTracker: vi.fn(),
  listWorkspaceHabitTrackerEntries: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/client', () => ({
  withForwardedInternalApiAuth: (_headers: unknown, options: unknown) =>
    options,
}));

const waterId = '00000000-0000-4000-8000-000000000002';
const water = trackerFixture({
  id: waterId,
  name: 'Water',
  use_case: 'counter',
  tracking_mode: 'event_log',
  aggregation_strategy: 'sum',
  target_value: 8,
  primary_metric_key: 'glasses',
  input_schema: [{ key: 'glasses', label: 'Glasses', type: 'number' }],
  composer_config: { unit: 'glasses' },
});
const context = (overrides: Partial<MiraToolContext> = {}) =>
  ({
    userId: 'user-1',
    wsId: 'ws-1',
    timezone: 'Asia/Ho_Chi_Minh',
    requestHeaders: new Headers(),
    ...overrides,
  }) as unknown as MiraToolContext;

beforeEach(() => {
  vi.clearAllMocks();
  api.listTrackers.mockResolvedValue({
    trackers: [
      {
        tracker: water,
        current_member: {
          current_period_total: 5,
          latest_value: 2,
          latest_entry_date: '2026-10-25',
          streak: { current_streak: 3 },
        },
      },
      {
        tracker: trackerFixture({ id: 'archived', archived_at: '2026-10-01' }),
      },
    ],
  });
  api.createEntry.mockImplementation(
    async (_ws: string, _id: string, input: Record<string, unknown>) => ({
      id: 'entry-1',
      entry_date: input.entry_date,
      primary_value: 2,
      values: input.values,
    })
  );
});

describe('habit helpers', () => {
  it('converts kg and lb', () => {
    expect(convertWeight(100, 'lb', 'kg')).toBeCloseTo(45.359237);
    expect(convertWeight(45.359237, 'kg', 'lb')).toBeCloseTo(100);
    expect(convertWeight(70, 'kg', 'kg')).toBe(70);
  });

  it('uses Ho Chi Minh City day boundaries', () => {
    const { start, end } = getDayWindow('2026-10-25', 'Asia/Ho_Chi_Minh');
    expect(start.toISOString()).toBe('2026-10-24T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T17:00:00.000Z');
    expect(toDateKey('2026-10-24T16:59:59Z', 'Asia/Ho_Chi_Minh')).toBe(
      '2026-10-24'
    );
    expect(toDateKey('2026-10-24T17:00:00Z', 'Asia/Ho_Chi_Minh')).toBe(
      '2026-10-25'
    );
  });

  it('falls back to UTC and flags an assumed timezone', () => {
    expect(resolveUserTimezone({ timezone: 'Not/AZone' })).toEqual({
      timezone: 'UTC',
      timezoneAssumed: true,
    });
    expect(resolveUserTimezone({})).toMatchObject({ timezoneAssumed: true });
  });

  it('summarizes weights by time order, not input order', () => {
    expect(summarizeWeights([])).toBeNull();
    expect(
      summarizeWeights([
        { date: '2026-10-03', occurredAt: '2026-10-03T00:00:00Z', value: 80 },
        { date: '2026-10-01', occurredAt: '2026-10-01T00:00:00Z', value: 82.5 },
        { date: '2026-10-02', occurredAt: '2026-10-02T00:00:00Z', value: 79 },
      ])
    ).toEqual({
      count: 3,
      latest: { value: 80, date: '2026-10-03' },
      earliest: { value: 82.5, date: '2026-10-01' },
      change: -2.5,
      min: 79,
      max: 82.5,
    });
  });
});

describe('list_habit_trackers', () => {
  it('lists active trackers with current-period progress', async () => {
    const result = await executeListHabitTrackers({}, context());
    expect(result).toMatchObject({ success: true, count: 1 });
    expect((result as { trackers: unknown[] }).trackers).toEqual([
      expect.objectContaining({
        id: waterId,
        useCase: 'counter',
        trackingMode: 'event_log',
        unit: 'glasses',
        target: { period: 'daily', operator: 'gte', value: 8 },
        currentPeriod: { total: 5, met: false },
        currentStreak: 3,
      }),
    ]);
  });

  it('is unavailable without request headers', async () => {
    expect(
      await executeListHabitTrackers({}, context({ requestHeaders: undefined }))
    ).toMatchObject({ success: false });
    expect(api.listTrackers).not.toHaveBeenCalled();
  });
});

describe('log_habit_entry', () => {
  it("maps value to the tracker's primary metric in the user's day", async () => {
    const result = await executeLogHabitEntry(
      { trackerId: waterId, value: 2, occurredAt: '2026-10-24T23:00:00Z' },
      context()
    );
    expect(api.createEntry).toHaveBeenCalledWith(
      'ws-1',
      waterId,
      {
        entry_date: '2026-10-25',
        occurred_at: '2026-10-24T23:00:00.000Z',
        values: { glasses: 2 },
      },
      expect.anything()
    );
    expect(result).toMatchObject({
      success: true,
      tracker: { id: waterId, name: 'Water' },
    });
  });

  it('passes explicit values through for the satellite to sanitise', async () => {
    await executeLogHabitEntry(
      { trackerId: waterId, values: { glasses: 1 }, note: 'lunch' },
      context()
    );
    expect(api.listTrackers).not.toHaveBeenCalled();
    expect(api.createEntry.mock.calls[0]?.[2]).toMatchObject({
      values: { glasses: 1 },
      note: 'lunch',
    });
  });

  it('rejects an unknown tracker and missing values', async () => {
    expect(
      await executeLogHabitEntry(
        { trackerId: '00000000-0000-4000-8000-0000000000ff', value: 1 },
        context()
      )
    ).toMatchObject({ success: false });
    expect(
      await executeLogHabitEntry({ trackerId: waterId }, context())
    ).toMatchObject({ success: false });
    expect(api.createEntry).not.toHaveBeenCalled();
  });

  it('surfaces satellite errors truthfully', async () => {
    api.createEntry.mockRejectedValueOnce(new Error('Not found'));
    expect(
      await executeLogHabitEntry(
        { trackerId: waterId, values: { glasses: 1 } },
        context()
      )
    ).toEqual({ success: false, error: 'Not found' });
  });
});

describe('habit tool definitions', () => {
  it('validate through JSON schema for the Live canonical bridge', async () => {
    const { asSchema } = await import('ai');
    const { habitToolDefinitions } = await import('../definitions/habits');
    const definitions = habitToolDefinitions as unknown as Record<
      string,
      { inputSchema: Parameters<typeof asSchema>[0] }
    >;
    const validate = (name: string, input: unknown) =>
      asSchema(definitions[name]!.inputSchema).validate?.(input);
    for (const definition of Object.values(definitions))
      expect(await asSchema(definition.inputSchema).jsonSchema).toMatchObject({
        type: 'object',
      });
    expect(
      await validate('log_body_weight', { value: 70, unit: 'kg' })
    ).toMatchObject({ success: true });
    expect(await validate('log_body_weight', { value: -1 })).toMatchObject({
      success: false,
    });
    expect(
      await validate('get_body_weight_history', { days: 366 })
    ).toMatchObject({ success: false });
    expect(
      await validate('log_habit_entry', { trackerId: waterId })
    ).toMatchObject({ success: false });
    expect(
      await validate('get_day_overview', { date: '25/10/2026' })
    ).toMatchObject({ success: false });
  });
});
