import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MiraToolContext } from '../mira-tool-types';
import {
  buildOperationKey,
  convertWeight,
  getDayWindow,
  normalizeEntryValues,
  resolveRequestLocale,
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
vi.mock('@tuturuuu/internal-api/habit-trackers', () => ({
  listWorkspaceHabitTrackers: api.listTrackers,
  createWorkspaceHabitTrackerEntryWithStatus: api.createEntry,
  createWorkspaceHabitTrackerWithStatus: vi.fn(),
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
  const stored = new Map<string, Record<string, unknown>>();
  api.createEntry.mockImplementation(
    async (_ws: string, _id: string, input: Record<string, unknown>) => {
      const key = String(input.idempotency_key ?? `unkeyed-${stored.size}`);
      const existing = stored.get(key);
      if (existing) return { entry: existing, replayed: true };
      const entry = {
        id: `entry-${stored.size + 1}`,
        entry_date: input.entry_date,
        primary_value: 2,
        values: input.values,
      };
      stored.set(key, entry);
      return { entry, replayed: false };
    }
  );
});

describe('habit helpers', () => {
  it('resolves the user language from the request', () => {
    expect(resolveRequestLocale(undefined)).toBe('en');
    expect(
      resolveRequestLocale(new Headers({ cookie: 'NEXT_LOCALE=vi' }))
    ).toBe('vi');
    expect(
      resolveRequestLocale(
        new Headers({ 'accept-language': 'vi-VN,vi;q=0.9,en;q=0.8' })
      )
    ).toBe('vi');
    expect(
      resolveRequestLocale(
        new Headers({
          cookie: 'NEXT_LOCALE=en',
          'accept-language': 'vi-VN',
        })
      )
    ).toBe('en');
    expect(
      resolveRequestLocale(new Headers({ 'accept-language': 'ja-JP' }))
    ).toBe('en');
  });

  it('derives stable operation keys from normalized input', async () => {
    const a = await buildOperationKey('habit', [
      normalizeEntryValues({ b: 2, a: 1 }),
    ]);
    const b = await buildOperationKey('habit', [
      normalizeEntryValues({ a: 1, b: 2 }),
    ]);
    expect(a).toBe(b);
    expect(a).toMatch(/^mira:habit:[0-9a-f]{48}$/);
    expect(await buildOperationKey('habit', [{ a: 2 }])).not.toBe(a);
  });

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

  it('stores one entry when the same tool call is retried', async () => {
    const ctx = context({ chatId: 'chat-1' });
    const args = { trackerId: waterId, values: { glasses: 1 } };
    const first = await executeLogHabitEntry(args, ctx, { toolCallId: 'c-1' });
    const retry = await executeLogHabitEntry(args, ctx, { toolCallId: 'c-1' });
    expect(first).toMatchObject({ entry: { id: 'entry-1' } });
    expect(first).not.toHaveProperty('alreadyLogged');
    expect(retry).toMatchObject({
      alreadyLogged: true,
      entry: { id: 'entry-1' },
    });
    const keys = api.createEntry.mock.calls.map(
      (call) => (call[2] as { idempotency_key?: string }).idempotency_key
    );
    expect(keys[0]).toMatch(/^mira:habit:[0-9a-f]{48}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it('keeps separate tool calls as separate counter entries', async () => {
    const ctx = context({ chatId: 'chat-1' });
    const args = { trackerId: waterId, values: { glasses: 1 } };
    await executeLogHabitEntry(args, ctx, { toolCallId: 'c-1' });
    const second = await executeLogHabitEntry(args, ctx, {
      toolCallId: 'c-2',
    });
    expect(second).toMatchObject({ entry: { id: 'entry-2' } });
    await executeLogHabitEntry(args, ctx);
    expect(api.createEntry.mock.calls[2]?.[2]).not.toHaveProperty(
      'idempotency_key'
    );
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
