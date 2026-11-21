import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { readTodayOutcomes } from './today-outcomes.mjs';

test('uses the ICT day and only an explicit completed automatic continuation', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE orchestration_v2_projection_runs (
        run_id TEXT, thread_id TEXT, ordinal INTEGER, status TEXT,
        completed_at TEXT, payload_json TEXT
      );
      CREATE TABLE orchestration_v2_projection_turn_items (
        run_id TEXT, thread_id TEXT, ordinal INTEGER, type TEXT, status TEXT,
        payload_json TEXT
      );
    `);
    const add = db.prepare(
      'INSERT INTO orchestration_v2_projection_runs VALUES (?, ?, ?, ?, ?, ?)'
    );
    const item = db.prepare(
      "INSERT INTO orchestration_v2_projection_turn_items VALUES (?, ?, ?, 'error', 'failed', ?)"
    );
    const fail = (
      id,
      failureClass,
      completedAt = '2026-11-21T00:00:00.000Z'
    ) => {
      add.run(id, id, 1, 'failed', completedAt, '{}');
      if (failureClass)
        item.run(
          id,
          id,
          1,
          JSON.stringify({ failure: { class: failureClass } })
        );
    };
    fail('quota', 'usage_limit');
    fail('manual', 'usage_limit');
    fail('real', 'provider_error');
    fail('missing', null);
    fail('yesterday', 'transport_error', '2026-11-20T16:30:00.000Z');
    add.run(
      'wrong-thread',
      'manual',
      2,
      'completed',
      '2026-11-21T00:30:00.000Z',
      JSON.stringify({ usageLimitContinuationOfRunId: 'quota' })
    );
    add.run(
      'unrelated',
      'manual',
      3,
      'completed',
      '2026-11-21T01:00:00.000Z',
      '{}'
    );
    add.run(
      'manual-continue',
      'manual',
      4,
      'completed',
      '2026-11-21T01:30:00.000Z',
      JSON.stringify({
        usageLimitContinuationOfRunId: 'manual',
        manualContinuationOfRunId: 'manual',
      })
    );
    add.run(
      'auto-continue',
      'quota',
      2,
      'completed',
      '2026-11-21T02:00:00.000Z',
      JSON.stringify({ usageLimitContinuationOfRunId: 'quota' })
    );

    assert.deepEqual(readTodayOutcomes(db, new Date('2026-11-21T11:33:00Z')), {
      kind: 'complete',
      observedAt: '2026-11-21T11:33:00.000Z',
      dayStart: '2026-11-20T17:00:00.000Z',
      real: 1,
      quotaRecovered: 1,
      quotaUnrecovered: 1,
      unclassified: 1,
    });
  } finally {
    db.close();
  }
});
