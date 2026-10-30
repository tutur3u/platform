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
import { MeetAiError } from './access';
import { finalizeMeetAi } from './finalize';
import { finishMeetAiSession } from './finish-session';
import { BILLING_UNRECONCILED, markSettledUncharged } from './notes-billing';

import {
  ada,
  ben,
  bearer,
  buildTables,
  chunk,
  type Fail,
  fakeDb,
  host,
  id,
  meeting,
  type Row,
  SECRET,
  SECRET_TEXT,
  sessionId,
  ws,
} from './finalize.fixtures';

let failing: Fail | null = null;
function setup(overrides: { chunks?: Row[]; session?: Row } = {}) {
  failing = null;
  const log: string[] = [];
  const tables = buildTables(overrides);
  const db = fakeDb(tables, log, () => failing);
  mocks.db = db;
  return { tables, db, log };
}
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
    // artifact-billing tags a failure only after the ledger settled it as failed.
    mocks.generate.mockImplementation(async () => {
      throw markSettledUncharged(
        Object.assign(new Error('provider down'), { status: 502 })
      );
    });
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
            throw new AiStudioError(
              'This request is already running or completed.',
              {
                code: 'invalid_request_error',
                status: 409,
              }
            );
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

    it('a lost failure-settlement acknowledgement keeps the identity: one provider run, then fenced', async () => {
      const keys = new Set<string>();
      const executed: string[] = [];
      mocks.generate.mockImplementation(async (_input, actor) => {
        if (keys.has(actor.attemptId))
          throw new AiStudioError(
            'This request is already running or completed.',
            {
              code: 'invalid_request_error',
              status: 409,
            }
          );
        keys.add(actor.attemptId);
        executed.push(actor.attemptId);
        // The provider failed, and recording that failure then failed too.
        throw new MeetAiError(
          503,
          'AI usage settlement unavailable',
          BILLING_UNRECONCILED
        );
      });
      const { tables } = setup();
      expect(await call()).toEqual({ status: 'abandoned' });
      expect(await call()).toEqual({ status: 'abandoned' });
      expect(await call()).toEqual({ status: 'abandoned' });
      expect(executed).toEqual([`${sessionId}:g0`]);
      expect(tables.meet_ai_sessions[0]).toMatchObject({
        notes_unpriced_attempts: 0,
      });
    });

    it('an ambiguous provider exception that was not settled does not rotate the identity', async () => {
      const keys = new Set<string>();
      const executed: string[] = [];
      mocks.generate.mockImplementation(async (_input, actor) => {
        if (keys.has(actor.attemptId))
          throw new AiStudioError(
            'This request is already running or completed.',
            {
              code: 'invalid_request_error',
              status: 409,
            }
          );
        keys.add(actor.attemptId);
        executed.push(actor.attemptId);
        // For example a timeout after generation, never tagged as settled.
        throw new Error('provider timeout');
      });
      const { tables } = setup();
      await expect(call()).rejects.toThrow('provider timeout');
      expect(tables.meet_ai_sessions[0]).toMatchObject({
        notes_status: 'failed',
        notes_unpriced_attempts: 0,
      });
      expect(await call()).toEqual({ status: 'abandoned' });
      expect(await call()).toEqual({ status: 'abandoned' });
      expect(executed).toEqual([`${sessionId}:g0`]);
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
