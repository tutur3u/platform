import { signMeetFinalizeToken } from '@tuturuuu/realtime/meet/finalization-token';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  generate: vi.fn(),
  settle: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => mocks.db,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({}));
vi.mock('@tuturuuu/meet-core/parley/repository', () => ({
  isParleySession: async () => false,
}));
vi.mock('./artifact-billing', () => ({
  generateBilledMeetArtifact: mocks.generate,
  settleMeetRun: mocks.settle,
}));

import { AiStudioError } from '@tuturuuu/ai/studio/errors';
import { finalizeMeetAi } from './finalize';
import { finishMeetAiSession } from './finish-session';

const SECRET = 'finalize-test-secret';
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ws = id(1);
const meeting = id(2);
const sessionId = id(3);
const host = id(10);
const ada = id(11);
const ben = id(12);
const SECRET_TEXT = 'BEN-PRIVATE-SPEECH';

type Row = Record<string, unknown>;
function chunk(sequence: number, accountId: string | null, text: string): Row {
  return {
    id: id(100 + sequence),
    session_id: sessionId,
    sequence,
    start_seconds: sequence * 10,
    duration_seconds: 10,
    status: 'completed',
    transcript: text,
    attempt_started_at: null,
    created_at: '2026-10-30T00:00:00Z',
    usage: accountId
      ? {
          segments: [
            {
              speaker: { accountId, displayName: 'X', kind: 'microphone' },
              kind: 'microphone',
              startSeconds: sequence * 10,
              transcript: text,
            },
          ],
        }
      : {},
  };
}
type Fail = (table: string, patch: Row) => boolean;
function fakeDb(
  tables: Record<string, Row[]>,
  log: string[] = [],
  failWhen: () => Fail | null = () => null
) {
  const rpc = vi.fn(async () => ({ error: null, data: 'n' }));
  const from = (table: string) => {
    let op: 'select' | 'update' = 'select';
    let patch: Row = {};
    const filters: Array<(row: Row) => boolean> = [];
    // The claim is atomic: it is evaluated synchronously when awaited.
    const run = () => {
      const rows = (tables[table] ?? []).filter((row) =>
        filters.every((test) => test(row))
      );
      if (op === 'update' && failWhen()?.(table, patch)) {
        log.push(`${table}.update-failed:${Object.keys(patch).sort().join(',')}`);
        return { rows: [] as Row[], error: { message: 'storage down' } };
      }
      if (op === 'update') {
        log.push(`${table}.update:${Object.keys(patch).sort().join(',')}`);
        for (const row of rows) Object.assign(row, patch);
      } else log.push(`${table}.select`);
      return { rows, error: null as { message: string } | null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (value: Row) => {
        op = 'update';
        patch = value;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[column]));
        return chain;
      },
      order: () => chain,
      range: () => chain,
      maybeSingle: async () => {
        const out = run();
        return { data: out.rows[0] ?? null, error: out.error };
      },
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
      then: (resolve: (value: unknown) => void) =>
        resolve((({ rows, error }) => ({ data: rows, error }))(run())),
    };
    return chain;
  };
  return { from, rpc };
}
let failing: Fail | null = null;
function setup(overrides: { chunks?: Row[]; session?: Row } = {}) {
  failing = null;
  const log: string[] = [];
  const tables = {
    workspace_meetings: [
      {
        id: meeting,
        ws_id: ws,
        creator_id: host,
        time: '2026-10-30T00:00:00Z',
      },
    ],
    workspace_members: [
      { ws_id: ws, user_id: host },
      { ws_id: ws, user_id: ada },
    ],
    meet_ai_sessions: [
      {
        id: sessionId,
        meeting_id: meeting,
        user_id: host,
        notes: null,
        notes_status: 'pending',
        notes_started_at: null,
        notes_unpriced_attempts: 0,
        ended_at: null,
        ...overrides.session,
      },
    ],
    meet_ai_chunks: overrides.chunks ?? [
      chunk(0, ada, 'ADA-SPEECH'),
      chunk(1, ben, SECRET_TEXT),
      chunk(2, null, 'UNATTRIBUTED-SPEECH'),
    ],
  };
  const db = fakeDb(tables, log, () => failing);
  mocks.db = db;
  return { tables, db, log };
}
const bearer = (consented = [ada, host], readers = [ada]) =>
  signMeetFinalizeToken(
    {
      sessionId,
      meetingId: meeting,
      wsId: ws,
      consentedAccountIds: consented,
      readerAccountIds: readers,
      queuedAt: 0,
      attempts: 1,
      nextAttemptAt: 0,
      status: 'pending',
    },
    SECRET,
    Date.now()
  );
const call = (token: string | null = bearer()) =>
  finalizeMeetAi(
    new Request('https://meet.example/api/meet-ai/finalize', {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: '{}',
    })
  );

beforeEach(() => {
  mocks.settle.mockReset();
  mocks.settle.mockResolvedValue(undefined);
  vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', SECRET);
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-key');
  mocks.generate.mockReset();
  mocks.generate.mockImplementation(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      notes: {
        summary: 'SUMMARY-BODY',
        decisions: [],
        actionItems: [],
        openQuestions: [],
      },
      usage: { available: true },
      costUsd: 0.001,
    };
  });
});

describe('finalizeMeetAi', () => {
  it('rejects a missing, tampered or foreign token before touching data', async () => {
    const { db } = setup();
    await expect(call(null)).rejects.toMatchObject({ status: 401 });
    await expect(call(`${bearer()}x`)).rejects.toMatchObject({ status: 401 });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('two concurrent ends produce one generation and one bill', async () => {
    const { tables, db } = setup();
    const results = await Promise.all([call(), call(), call()]);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.generated).length).toBe(1);
    expect(
      results.every((r) => ['completed', 'pending'].includes(r.status))
    ).toBe(true);
    expect(tables.meet_ai_sessions[0]).toMatchObject({
      notes_status: 'completed',
    });
    // A later end is a no-op: no generation, no second notification round.
    const notified = db.rpc.mock.calls.length;
    expect(await call()).toEqual({ status: 'completed', generated: false });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(db.rpc.mock.calls.length).toBe(notified);
  });

  it('flushes before generating: waits for in-flight audio, then claims and generates', async () => {
    const inflight = chunk(0, ada, 'ADA-SPEECH');
    Object.assign(inflight, {
      status: 'processing',
      attempt_started_at: new Date().toISOString(),
    });
    const { tables, log } = setup({ chunks: [inflight] });
    expect(await call()).toEqual({ status: 'pending' });
    expect(mocks.generate).not.toHaveBeenCalled();
    // Ending is fenced first, and the lease was never taken while audio ran.
    expect(log).toContain('meet_ai_sessions.update:ended_at');
    expect(log).not.toContain(
      'meet_ai_sessions.update:notes_started_at,notes_status'
    );
    expect(tables.meet_ai_sessions[0]).toMatchObject({
      notes_status: 'pending',
    });

    Object.assign(inflight, { status: 'completed', attempt_started_at: null });
    log.length = 0;
    expect(await call()).toEqual({ status: 'completed', generated: true });
    const ended = log.indexOf('meet_ai_sessions.update:ended_at');
    const read = log.indexOf('meet_ai_chunks.select');
    const claim = log.indexOf(
      'meet_ai_sessions.update:notes_started_at,notes_status'
    );
    expect(ended).toBeGreaterThanOrEqual(0);
    expect(ended).toBeLessThan(read);
    expect(read).toBeLessThan(claim);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });

  it('never sends a non-consented or unattributed chunk to the model', async () => {
    setup();
    await call();
    const input = JSON.stringify(mocks.generate.mock.calls[0]?.[0]);
    expect(input).toContain('ADA-SPEECH');
    expect(input).not.toContain(SECRET_TEXT);
    expect(input).not.toContain('UNATTRIBUTED-SPEECH');
  });

  it('bills nothing when no consented speech was saved', async () => {
    const { tables } = setup({ chunks: [chunk(0, ben, SECRET_TEXT)] });
    expect(await call()).toEqual({ status: 'completed', generated: true });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(tables.meet_ai_sessions[0]).toMatchObject({
      notes_status: 'completed',
      notes_cost_usd: 0,
    });
  });

  it('bounds retries: provider failures stop after the cap and then abandon', async () => {
    const { tables } = setup();
    mocks.generate.mockRejectedValue(
      Object.assign(new Error('provider down'), { status: 502 })
    );
    for (let attempt = 0; attempt < 3; attempt++)
      await expect(call()).rejects.toThrow('provider down');
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    expect(tables.meet_ai_sessions[0]).toMatchObject({
      notes_status: 'failed',
      notes_unpriced_attempts: 3,
    });
    expect(await call()).toEqual({ status: 'abandoned' });
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    // A provider failure that was durably recorded as uncharged rotates the
    // identity, so a legitimate retry is not blocked by the failed run.
    expect(mocks.generate.mock.calls.map((c) => c[1].attemptId)).toEqual([
      `${sessionId}:g0`,
      `${sessionId}:g1`,
      `${sessionId}:g2`,
    ]);
  });

  it('notifies with a link only, to the host and member readers', async () => {
    const { db } = setup();
    await call();
    const params = db.rpc.mock.calls.map(
      (callArgs) =>
        (callArgs as unknown as [string, Record<string, unknown>])[1]
    );
    expect(params.map((p) => p.p_user_id).sort()).toEqual([ada, host].sort());
    const text = JSON.stringify(params);
    expect(text).toContain(`/${ws}/meetings/${meeting}`);
    for (const forbidden of ['SUMMARY-BODY', 'ADA-SPEECH', SECRET_TEXT])
      expect(text).not.toContain(forbidden);
  });

  it('abandons a session that is not the host session or an unknown one', async () => {
    setup({ session: { user_id: ada } });
    expect(await call()).toEqual({ status: 'abandoned' });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  describe('billing identity and recovery', () => {
    function ledgerGenerate() {
      const keys = new Set<string>();
      const executed: string[] = [];
      mocks.generate.mockImplementation(
        async (_input, actor, _admission, hooks) => {
          // Stands in for the AI Studio ledger: one run per idempotency key.
          if (keys.has(actor.attemptId))
            throw new AiStudioError('This request is already running or completed.', {
              code: 'invalid_request_error',
              status: 409,
            });
          keys.add(actor.attemptId);
          executed.push(actor.attemptId);
          const measured = {
            notes: {
              summary: 'SUMMARY-BODY',
              decisions: [],
              actionItems: [],
              openQuestions: [],
            },
            usage: { available: true, inputTokens: 1, outputTokens: 1 },
            costUsd: 0.001,
          };
          await hooks?.onGenerated?.({
            measured,
            settlement: {
              runId: `run-${executed.length}`,
              actualCredits: 1,
              providerCostUsd: 0.001,
              inputTokens: 1,
              outputTokens: 1,
              latencyMs: 1,
              metadata: {
                app: 'meet',
                source: 'meet_artifact',
                meetingId: meeting,
                operation: 'meeting_notes',
              },
            },
          });
          return measured;
        }
      );
      return executed;
    }

    it('charged but not saved: the retry recovers the output with no second run or charge', async () => {
      const executed = ledgerGenerate();
      const { tables, db } = setup();
      failing = (table, patch) =>
        table === 'meet_ai_sessions' && patch.notes_status === 'completed';
      await expect(call()).rejects.toMatchObject({ status: 500 });
      expect(executed).toHaveLength(1);
      expect(tables.meet_ai_sessions[0]).toMatchObject({
        notes_status: 'failed',
        // The identity is not rotated after output existed.
        notes_unpriced_attempts: 0,
      });
      expect(JSON.stringify(tables.meet_ai_sessions[0]?.notes_usage)).toContain(
        'run-1'
      );
      expect(db.rpc).not.toHaveBeenCalled();

      failing = null;
      expect(await call()).toEqual({ status: 'completed', generated: true });
      expect(executed).toHaveLength(1);
      expect(mocks.generate).toHaveBeenCalledTimes(1);
      // The stored run is settled again (idempotent in the ledger), not rerun.
      expect(mocks.settle).toHaveBeenCalledTimes(1);
      expect(mocks.settle.mock.calls[0]?.[0]).toMatchObject({ runId: 'run-1' });
      expect(tables.meet_ai_sessions[0]).toMatchObject({
        notes_status: 'completed',
        notes: expect.objectContaining({ summary: 'SUMMARY-BODY' }),
      });
      expect(
        JSON.stringify(tables.meet_ai_sessions[0]?.notes_usage)
      ).not.toContain('checkpoint');
      expect(db.rpc).toHaveBeenCalled();
      // And a later end is still a no-op.
      expect(await call()).toEqual({ status: 'completed', generated: false });
      expect(mocks.generate).toHaveBeenCalledTimes(1);
    });

    it('unknown billed state: output could not be kept, so automatic regeneration is fenced', async () => {
      const executed = ledgerGenerate();
      const { tables, db } = setup();
      failing = (table, patch) =>
        table === 'meet_ai_sessions' && 'notes_usage' in patch;
      expect(await call()).toEqual({ status: 'abandoned' });
      failing = null;
      expect(await call()).toEqual({ status: 'abandoned' });
      expect(await call()).toEqual({ status: 'abandoned' });
      // One provider run in total, under one stable identity.
      expect(executed).toEqual([`${sessionId}:g0`]);
      expect(
        new Set(mocks.generate.mock.calls.map((c) => c[1].attemptId)).size
      ).toBe(1);
      expect(mocks.settle).not.toHaveBeenCalled();
      expect(db.rpc).not.toHaveBeenCalled();
      expect(tables.meet_ai_sessions[0]).toMatchObject({
        notes_unpriced_attempts: 0,
      });
      expect(tables.meet_ai_sessions[0]?.notes_status).not.toBe('completed');
    });

    it('the host can reconcile by hand with a fresh identity', async () => {
      const executed = ledgerGenerate();
      const { tables } = setup();
      failing = (table, patch) =>
        table === 'meet_ai_sessions' && 'notes_usage' in patch;
      await call();
      failing = null;
      const outcome = await finishMeetAiSession({
        db: mocks.db as never,
        session: tables.meet_ai_sessions[0] as never,
        userId: host,
        meetingId: meeting,
        meetingStartedAt: null,
        expectedChunks: 3,
      });
      expect(outcome).toBe('generated');
      expect(executed).toHaveLength(2);
      expect(executed[1]).not.toBe(executed[0]);
    });

    it('a stale processing lease does not rotate an unattended identity', async () => {
      const executed = ledgerGenerate();
      const { tables } = setup({
        session: {
          notes_status: 'processing',
          notes_started_at: '2020-01-01T00:00:00Z',
        },
      });
      expect(await call()).toEqual({ status: 'completed', generated: true });
      expect(executed).toEqual([`${sessionId}:g0`]);
      expect(tables.meet_ai_sessions[0]).toMatchObject({
        notes_unpriced_attempts: 0,
      });
    });
  });
});
