import { describe, expect, it } from 'vitest';
import { buildRunUpdate, publicRemoteRun, readRemoteRun } from './run-state';

describe('external chat remote run state', () => {
  it('selects only the requested run from a status collection', () => {
    expect(
      readRemoteRun(
        {
          runs: [
            { runId: 'other', state: 'completed' },
            { runId: 'requested', state: 'running' },
          ],
        },
        'requested'
      )
    ).toEqual({ runId: 'requested', state: 'running' });
    expect(readRemoteRun({ runs: [] }, 'missing')).toBeNull();
  });

  it('normalizes approved state while discarding malformed values', () => {
    const update = buildRunUpdate(
      {
        cursor: 'not-an-object',
        diagnostics: { token: 'not-approved' },
        digestResults: 'not-an-array',
        finishedAt: 'not-a-date',
        highWater: { messages: '9' },
        sourceCounts: { messages: 9 },
        startedAt: '2026-08-04T00:00:01.000Z',
        state: 'unknown',
      },
      'running',
      null
    );

    expect(update).toEqual(
      expect.objectContaining({
        high_water_mark: { messages: '9' },
        source_counts: { messages: 9 },
        started_at: '2026-08-04T00:00:01.000Z',
        state: 'running',
      })
    );
    expect(update).not.toHaveProperty('cursor');
    expect(update).not.toHaveProperty('diagnostics');
    expect(update).not.toHaveProperty('digest_results');
    expect(update).not.toHaveProperty('finished_at');
  });

  it('clears terminal fields when a failed run resumes', () => {
    const update = buildRunUpdate(
      { errorCode: 'delivery_failed', state: 'running' },
      'failed',
      '2026-08-04T00:00:01.000Z',
      'resume'
    );

    expect(update).toEqual(
      expect.objectContaining({
        error_code: null,
        finished_at: null,
        state: 'running',
      })
    );
    expect(update).not.toHaveProperty('started_at');
  });

  it('returns only masked operator fields', () => {
    expect(
      publicRemoteRun('run-1', 'backfill', {
        diagnostics: { authorization: 'hidden' },
        source_counts: { messages: 3 },
        state: 'completed',
        target_counts: { messages: 3 },
      })
    ).toEqual({
      cursor: {},
      digestResults: [],
      errorCode: null,
      finishedAt: null,
      highWater: {},
      operation: 'backfill',
      runId: 'run-1',
      sourceCounts: { messages: 3 },
      startedAt: null,
      state: 'completed',
      targetCounts: { messages: 3 },
    });
  });
});
