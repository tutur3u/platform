import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { createHabitTracker, createHabitTrackerEntry } from './writes';

type Result = { data: unknown; error: { code?: string } | null };

const trackerRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'tracker-1',
  ws_id: 'ws-1',
  name: 'Water',
  color: 'CYAN',
  icon: 'Droplets',
  tracking_mode: 'event_log',
  target_period: 'daily',
  target_operator: 'gte',
  target_value: 8,
  primary_metric_key: 'glasses',
  aggregation_strategy: 'sum',
  input_schema: [{ key: 'glasses', label: 'Glasses', type: 'number' }],
  quick_add_values: [],
  freeze_allowance: 0,
  recovery_window_periods: 0,
  start_date: '2026-10-01',
  is_active: true,
  archived_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
});
const entryRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  ws_id: 'ws-1',
  tracker_id: 'tracker-1',
  user_id: 'user-1',
  entry_kind: 'event_log',
  entry_date: '2026-10-25',
  occurred_at: '2026-10-25T02:00:00Z',
  values: { glasses: 1 },
  primary_value: 1,
  tags: [],
  created_at: '2026-10-25T02:00:00Z',
  updated_at: '2026-10-25T02:00:00Z',
  ...overrides,
});

/**
 * Builder stub: `maybeSingle` results are consumed in order per table, and
 * insert/update calls resolve `single` with the given write result.
 */
function supabaseMock(options: {
  lookups: Record<string, Result[]>;
  write?: Result;
  rpc?: Result;
}) {
  const rpc = vi.fn(
    async (_fn: string, _args: Record<string, unknown>) =>
      options.rpc ?? { data: null, error: null }
  );
  const insert = vi.fn();
  const update = vi.fn();
  const filters: Array<[string, string, unknown]> = [];
  const from = (table: string) => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    builder.select = chain;
    builder.is = chain;
    builder.eq = (column: string, value: unknown) => {
      filters.push([table, column, value]);
      return builder;
    };
    builder.filter = (column: string, _operator: string, value: unknown) => {
      filters.push([table, column, value]);
      return builder;
    };
    builder.maybeSingle = async () =>
      options.lookups[table]?.shift() ?? { data: null, error: null };
    builder.insert = (payload: unknown) => {
      insert(table, payload);
      return builder;
    };
    builder.update = (payload: unknown) => {
      update(table, payload);
      return builder;
    };
    builder.single = async () => options.write ?? { data: null, error: null };
    return builder;
  };
  return {
    supabase: { from, rpc } as unknown as TypedSupabaseClient,
    rpc,
    insert,
    update,
    filters,
  };
}

const trackerInput = {
  name: 'Body Weight',
  color: 'INDIGO' as const,
  icon: 'SlidersHorizontal',
  tracking_mode: 'daily_summary' as const,
  target_period: 'daily' as const,
  target_operator: 'gte' as const,
  target_value: 70,
  primary_metric_key: 'weight',
  aggregation_strategy: 'max' as const,
  input_schema: [{ key: 'weight', label: 'Weight', type: 'number' as const }],
  use_case: 'body_weight' as const,
  creation_key: 'mira:body_weight',
};

describe('createHabitTracker', () => {
  it('returns the active tracker that already holds the creation key', async () => {
    const mock = supabaseMock({
      lookups: {
        workspace_habit_trackers: [
          { data: trackerRow({ id: 'existing' }), error: null },
        ],
      },
    });
    const result = await createHabitTracker(
      mock.supabase,
      'ws-1',
      'user-1',
      trackerInput
    );
    expect(result).toMatchObject({
      created: false,
      tracker: { id: 'existing' },
    });
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.filters).toContainEqual([
      'workspace_habit_trackers',
      'created_by',
      'user-1',
    ]);
  });

  it('returns the race winner when the unique index rejects a second create', async () => {
    const mock = supabaseMock({
      lookups: {
        workspace_habit_trackers: [
          { data: null, error: null },
          { data: trackerRow({ id: 'winner' }), error: null },
        ],
      },
      write: { data: null, error: { code: '23505' } },
    });
    const result = await createHabitTracker(
      mock.supabase,
      'ws-1',
      'user-1',
      trackerInput
    );
    expect(result).toMatchObject({ created: false, tracker: { id: 'winner' } });
    expect(mock.insert).toHaveBeenCalledWith(
      'workspace_habit_trackers',
      expect.objectContaining({ creation_key: 'mira:body_weight' })
    );
  });

  it('creates without a key before the migration reaches the database', async () => {
    const mock = supabaseMock({
      lookups: {
        workspace_habit_trackers: [{ data: null, error: { code: '42703' } }],
      },
      write: { data: trackerRow({ id: 'new' }), error: null },
    });
    const result = await createHabitTracker(
      mock.supabase,
      'ws-1',
      'user-1',
      trackerInput
    );
    expect(result).toMatchObject({ created: true, tracker: { id: 'new' } });
    expect(mock.insert.mock.calls[0]?.[1]).not.toHaveProperty('creation_key');
  });
});

describe('createHabitTrackerEntry', () => {
  const tracker = { data: trackerRow(), error: null };

  const keyed = {
    entry_date: '2026-10-25',
    values: { glasses: 1 },
    idempotency_key: 'mira:entry-0001',
  };
  const rpcArgs = (mock: ReturnType<typeof supabaseMock>, call = 0) =>
    (
      mock.rpc.mock.calls[call] as unknown as [string, Record<string, unknown>]
    )[1];

  it('accepts a keyed operation through the atomic receipt function', async () => {
    const mock = supabaseMock({
      lookups: { workspace_habit_trackers: [tracker] },
      rpc: { data: [{ entry_id: 'created', replayed: false }], error: null },
      write: { data: entryRow({ id: 'created' }), error: null },
    });
    const result = await createHabitTrackerEntry(
      mock.supabase,
      'ws-1',
      'tracker-1',
      'user-1',
      keyed
    );
    expect(result).toMatchObject({ replayed: false, entry: { id: 'created' } });
    expect(mock.rpc.mock.calls[0]?.[0]).toBe(
      'record_habit_tracker_entry_with_receipt'
    );
    expect(rpcArgs(mock)).toMatchObject({
      p_ws_id: 'ws-1',
      p_tracker_id: 'tracker-1',
      p_user_id: 'user-1',
      p_idempotency_key: 'mira:entry-0001',
      p_entry_kind: 'event_log',
    });
    expect(rpcArgs(mock).p_request_hash).toMatch(/^[0-9a-f]{64}$/);
    // The entry is written only inside the function's transaction.
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('replays a repeated operation key without writing', async () => {
    const mock = supabaseMock({
      lookups: { workspace_habit_trackers: [tracker] },
      rpc: { data: [{ entry_id: 'stored', replayed: true }], error: null },
      write: { data: entryRow({ id: 'stored' }), error: null },
    });
    const result = await createHabitTrackerEntry(
      mock.supabase,
      'ws-1',
      'tracker-1',
      'user-1',
      keyed
    );
    expect(result).toMatchObject({ replayed: true, entry: { id: 'stored' } });
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });

  it('binds the receipt to the request body, not the retry time', async () => {
    const run = async (input: typeof keyed & { occurred_at?: string }) => {
      const mock = supabaseMock({
        lookups: { workspace_habit_trackers: [{ ...tracker }] },
        rpc: { data: [{ entry_id: 'e', replayed: false }], error: null },
        write: { data: entryRow({ id: 'e' }), error: null },
      });
      await createHabitTrackerEntry(
        mock.supabase,
        'ws-1',
        'tracker-1',
        'user-1',
        input
      );
      return rpcArgs(mock).p_request_hash;
    };
    const first = await run(keyed);
    expect(await run(keyed)).toBe(first);
    expect(await run({ ...keyed, values: { glasses: 2 } })).not.toBe(first);
    const timed = { ...keyed, occurred_at: '2026-10-25T08:00:00Z' };
    const timedHash = await run(timed);
    expect(await run(timed)).toBe(timedHash);
    expect(timedHash).not.toBe(first);
    expect(
      await run({ ...timed, occurred_at: '2026-10-25T09:00:00Z' })
    ).not.toBe(timedHash);
  });

  it('rejects a key reused for a different request', async () => {
    const mock = supabaseMock({
      lookups: { workspace_habit_trackers: [tracker] },
      rpc: { data: null, error: { code: 'P0409' } },
    });
    await expect(
      createHabitTrackerEntry(
        mock.supabase,
        'ws-1',
        'tracker-1',
        'user-1',
        keyed
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('does not resurrect an accepted entry the user has since deleted', async () => {
    const mock = supabaseMock({
      lookups: { workspace_habit_trackers: [tracker] },
      rpc: { data: [{ entry_id: null, replayed: true }], error: null },
    });
    await expect(
      createHabitTrackerEntry(
        mock.supabase,
        'ws-1',
        'tracker-1',
        'user-1',
        keyed
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(mock.insert).not.toHaveBeenCalled();
  });

  it('falls back to an unkeyed write before the migration is deployed', async () => {
    const mock = supabaseMock({
      lookups: { workspace_habit_trackers: [tracker] },
      rpc: { data: null, error: { code: 'PGRST202' } },
      write: { data: entryRow(), error: null },
    });
    const result = await createHabitTrackerEntry(
      mock.supabase,
      'ws-1',
      'tracker-1',
      'user-1',
      keyed
    );
    expect(result.replayed).toBe(false);
    expect(mock.insert).toHaveBeenCalledTimes(1);
    expect(mock.insert.mock.calls[0]?.[1]).not.toHaveProperty(
      'idempotency_key'
    );
  });

  it('keeps unkeyed entries unchanged', async () => {
    const mock = supabaseMock({
      lookups: { workspace_habit_trackers: [tracker] },
      write: { data: entryRow(), error: null },
    });
    const result = await createHabitTrackerEntry(
      mock.supabase,
      'ws-1',
      'tracker-1',
      'user-1',
      { entry_date: '2026-10-25', values: { glasses: 1 } }
    );
    expect(result.replayed).toBe(false);
    expect(mock.insert.mock.calls[0]?.[1]).not.toHaveProperty(
      'idempotency_key'
    );
  });

  it('rejects malformed operation keys', async () => {
    const mock = supabaseMock({
      lookups: { workspace_habit_trackers: [tracker] },
    });
    await expect(
      createHabitTrackerEntry(mock.supabase, 'ws-1', 'tracker-1', 'user-1', {
        entry_date: '2026-10-25',
        values: { glasses: 1 },
        idempotency_key: 'bad key!',
      })
    ).rejects.toThrow();
    expect(mock.insert).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
