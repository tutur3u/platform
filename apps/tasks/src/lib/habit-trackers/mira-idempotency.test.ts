// @vitest-environment node
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeLogBodyWeight } from '../../../../../packages/ai/src/tools/executors/body-weight';
import { trackerFixture } from '../../../../../packages/ai/src/tools/executors/habit-test-utils';
import { executeLogHabitEntry } from '../../../../../packages/ai/src/tools/executors/habits';
import type { MiraToolContext } from '../../../../../packages/ai/src/tools/mira-tool-types';
import { createHabitTrackerEntry } from './writes';

const api = vi.hoisted(() => ({ listTrackers: vi.fn(), createEntry: vi.fn() }));
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

// Run the real Tasks sanitizer and request hash; only the database transport
// models receipt conflicts and mutable daily rows (covered by pgTAP separately).
function receiptDatabase() {
  const tracker = trackerFixture();
  const receipts = new Map<string, { hash: string; entryId: string }>();
  const entries = new Map<string, Record<string, unknown>>();
  const rpc = vi.fn(async (_fn: string, args: Record<string, unknown>) => {
    const key = String(args.p_idempotency_key);
    const hash = String(args.p_request_hash);
    const receipt = receipts.get(key);
    if (receipt && receipt.hash !== hash)
      return { data: null, error: { code: 'P0409' } };
    if (receipt)
      return {
        data: [{ entry_id: receipt.entryId, replayed: true }],
        error: null,
      };
    const entryId = 'daily-entry';
    receipts.set(key, { hash, entryId });
    entries.set(entryId, {
      id: entryId,
      ws_id: tracker.ws_id,
      tracker_id: tracker.id,
      user_id: 'user-1',
      entry_kind: 'daily_summary',
      entry_date: args.p_entry_date,
      occurred_at: args.p_occurred_at,
      values: args.p_values,
      primary_value: args.p_primary_value,
      note: args.p_note,
      tags: args.p_tags,
      created_at: '2026-10-25T08:00:00Z',
      updated_at: '2026-10-25T08:00:00Z',
    });
    return { data: [{ entry_id: entryId, replayed: false }], error: null };
  });
  const client = {
    rpc,
    from(table: string) {
      let entryId = '';
      const result = () => ({
        data:
          table === 'workspace_habit_trackers' ? tracker : entries.get(entryId),
        error: null,
      });
      const builder = {
        select: () => builder,
        is: () => builder,
        eq(column: string, value: string) {
          if (column === 'id') entryId = value;
          return builder;
        },
        maybeSingle: async () => result(),
        single: async () => result(),
      };
      return builder;
    },
  } as unknown as TypedSupabaseClient;
  return { client, tracker, receipts, rpc };
}

const context = (client: TypedSupabaseClient): MiraToolContext =>
  ({
    userId: 'user-1',
    wsId: 'team-ws',
    chatId: 'chat-1',
    timezone: 'UTC',
    requestHeaders: new Headers(),
    workspaceContext: { wsId: 'team-ws', personal: true },
    supabase: client,
  }) as unknown as MiraToolContext;

let database: ReturnType<typeof receiptDatabase>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T08:00:00Z'));
  database = receiptDatabase();
  api.listTrackers.mockResolvedValue({
    trackers: [{ tracker: database.tracker }],
  });
  api.createEntry.mockImplementation(
    (
      wsId: string,
      trackerId: string,
      input: Parameters<typeof createHabitTrackerEntry>[4]
    ) =>
      createHabitTrackerEntry(database.client, wsId, trackerId, 'user-1', input)
  );
});
afterEach(() => vi.useRealTimers());

describe('Mira calls through the Tasks receipt writer', () => {
  it('replays an implicit-time weight after the clock advances', async () => {
    const ctx = context(database.client);
    expect(await executeLogBodyWeight({ value: 70 }, ctx)).toMatchObject({
      success: true,
    });
    vi.setSystemTime(new Date('2026-10-25T09:00:00Z'));
    expect(await executeLogBodyWeight({ value: 70 }, ctx)).toMatchObject({
      success: true,
      alreadyLogged: true,
      entry: { value: 70 },
    });
    expect(database.receipts.size).toBe(1);
    expect(database.rpc.mock.calls[0]?.[1].p_request_hash).toBe(
      database.rpc.mock.calls[1]?.[1].p_request_hash
    );
  });

  it('replays an implicit-time habit tool call after the clock advances', async () => {
    const ctx = context(database.client);
    const args = { trackerId: database.tracker.id, values: { weight: 70 } };
    expect(
      await executeLogHabitEntry(args, ctx, { toolCallId: 'call-1' })
    ).toMatchObject({ success: true });
    vi.setSystemTime(new Date('2026-10-25T09:00:00Z'));
    expect(
      await executeLogHabitEntry(args, ctx, { toolCallId: 'call-1' })
    ).toMatchObject({
      success: true,
      alreadyLogged: true,
    });
    expect(database.receipts.size).toBe(1);
  });

  it('separates explicit weight times and normalizes equivalent instants', async () => {
    const ctx = context(database.client);
    await executeLogBodyWeight(
      { value: 70, occurredAt: '2026-10-25T08:00:00Z' },
      ctx
    );
    const second = await executeLogBodyWeight(
      { value: 70, occurredAt: '2026-10-25T09:00:00Z' },
      ctx
    );
    expect(second).toMatchObject({ success: true });
    expect(second).not.toHaveProperty('alreadyLogged');
    expect(
      await executeLogBodyWeight(
        { value: 70, occurredAt: '2026-10-25T16:00:00+07:00' },
        ctx
      )
    ).toMatchObject({
      success: true,
      alreadyLogged: true,
    });
    expect(database.receipts.size).toBe(2);
  });

  it('reports the current stored weight when an older receipt replays', async () => {
    const ctx = context(database.client);
    const first = { value: 70, occurredAt: '2026-10-25T08:00:00Z' };
    await executeLogBodyWeight(first, ctx);
    await executeLogBodyWeight(
      { value: 71, occurredAt: '2026-10-25T09:00:00Z' },
      ctx
    );
    expect(await executeLogBodyWeight(first, ctx)).toMatchObject({
      success: true,
      alreadyLogged: true,
      entry: { value: 71 },
    });
    expect(database.receipts.size).toBe(2);
  });
});
