import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  buildSummary,
  listRecoveryThreads,
  readActionReceipts,
  readLocal,
  writeSummary,
} from './recovery-producer.mjs';
import { readRecoverySummary } from './recovery-summary.mjs';

const now = new Date('2026-11-25T06:00:00Z');

test('writes private, valid counts and preserves unread host slots without PII', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-producer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const rows = await listRecoveryThreads(async (tool) => {
    assert.equal(tool, 't3_thread_list');
    return {
      threads: [
        {
          threadId: 'private-id',
          title: 'private-title',
          status: 'failed',
          settled: false,
          providerInstanceId: 'private-provider',
        },
        {
          threadId: 'private-settled-id',
          status: 'interrupted',
          settled: true,
        },
      ],
      nextCursor: null,
    };
  });
  const file = path.join(dir, 'summary.json');
  writeSummary(
    file,
    buildSummary([{ rows }, { rows: null }, { rows: [] }], {}, now)
  );
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /private-/);
  const summary = readRecoverySummary(file, now);
  assert.equal(summary.total, 1);
  assert.equal(summary.coverage.hostsRead, 2);
  assert.equal(summary.coverage.hostsExpected, 3);
  assert.equal(summary.coverage.partial, true);
  assert.deepEqual(
    summary.coverage.hosts.find((host) => !host.ok),
    {
      id: 'host-2',
      readAt: null,
      ok: false,
    }
  );
  assert.equal(
    readRecoverySummary(file, new Date(now.getTime() + 7_200_001)).stale,
    true
  );
});

test('termination after fsync preserves the previous summary', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-kill-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'summary.json');
  fs.writeFileSync(file, 'previous');
  const child = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    `
    import { writeSummary } from ${JSON.stringify(new URL('./recovery-producer.mjs', import.meta.url).href)};
    writeSummary(process.argv[1], {}, () => process.kill(process.pid, 'SIGKILL'));
  `,
    file,
  ]);
  assert.equal(child.signal, 'SIGKILL');
  assert.equal(fs.readFileSync(file, 'utf8'), 'previous');
});

test('missing, stale and free-form sweep entries supply no action counts', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-actions-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'sweep.log');
  assert.deepEqual(readActionReceipts(file, now), {});
  fs.writeFileSync(
    file,
    [
      '2026-11-25 10:00 ICT | moved_client_desks_to_claudeAgent=10',
      '2026-11-25 12:05 ICT | moved client desk private-title',
      '2026-11-25 12:20 ICT | settled_superseded_children=2',
      '',
    ].join('\n')
  );
  assert.deepEqual(readActionReceipts(file, now), {
    settled_superseded_children: 2,
  });
  assert.throws(() => buildSummary([{ rows: null }], {}, now));
});

test('local recovery counts only the latest unsettled failures', (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE orchestration_v2_projection_threads (
      thread_id TEXT, archived_at TEXT, deleted_at TEXT, payload_json TEXT
    );
    CREATE TABLE orchestration_v2_projection_runs (
      run_id TEXT, thread_id TEXT, ordinal INTEGER, status TEXT, provider TEXT
    );
    INSERT INTO orchestration_v2_projection_threads VALUES
      ('active', NULL, NULL, '{"limitRecovery":{"runId":"r1","resetAt":"2026-11-25T05:00:00Z"}}'),
      ('settled', NULL, NULL, '{"settledOverride":"settled"}'),
      ('recovered', NULL, NULL, '{}');
    INSERT INTO orchestration_v2_projection_runs VALUES
      ('r1', 'active', 1, 'failed', 'claude_dd'),
      ('r2', 'settled', 1, 'interrupted', 'codex'),
      ('r3', 'recovered', 1, 'failed', 'codex'),
      ('r4', 'recovered', 2, 'completed', 'codex');
  `);
  const summary = buildSummary([{ rows: readLocal(db) }], {}, now);
  assert.equal(summary.total_unsettled_failed_or_interrupted, 1);
  assert.deepEqual(summary.by_reason, { limit_reset_passed_still_failed: 1 });
  assert.deepEqual(summary.by_provider_family, { claude: 1 });
});
