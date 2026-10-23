import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { checkpointDecision } from '../src/checkpoint-ready';
import {
  CHECKPOINT_READ_BUDGET_MS,
  CHECKPOINT_RUNS_QUERY,
  CHECKPOINT_THREAD_QUERY,
  collectCheckpointThread,
  collectChildren,
  collectPoolReceipts,
} from '../src/collectors/children';
import { reconcileChildren } from '../src/reconcile-children';

it('projects descendant metadata and structured errors without reading message content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-children-'));
  const path = join(dir, 'state.sqlite');
  try {
    const db = new DatabaseSync(path);
    db.exec(`
 CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT,payload_json TEXT);
 CREATE TABLE orchestration_v2_projection_subagents(subagent_id TEXT,thread_id TEXT,child_thread_id TEXT,status TEXT,origin TEXT,provider_instance_id TEXT,payload_json TEXT);
 CREATE TABLE orchestration_v2_projection_runs(run_id TEXT,thread_id TEXT,ordinal INTEGER,status TEXT,completed_at TEXT,provider_instance_id TEXT,payload_json TEXT);
 CREATE TABLE orchestration_v2_projection_runtime_requests(thread_id TEXT,status TEXT,kind TEXT);
 CREATE TABLE orchestration_v2_projection_nodes(node_id TEXT,thread_id TEXT,run_id TEXT,status TEXT);
 CREATE TABLE orchestration_v2_projection_messages(message_id TEXT,payload_json TEXT);
 CREATE TABLE orchestration_v2_projection_turn_items(thread_id TEXT,run_id TEXT,node_id TEXT,type TEXT,status TEXT,updated_at TEXT,payload_json TEXT);
 CREATE TABLE orchestration_v2_projection_context_transfers(source_thread_id TEXT,target_thread_id TEXT,type TEXT,payload_json TEXT);
 `);
    const thread = db.prepare(
      'INSERT INTO orchestration_v2_projection_threads VALUES (?,?)'
    );
    thread.run('root', '{}');
    thread.run(
      'child',
      JSON.stringify({
        lineage: { parentThreadId: 'root' },
        snoozedUntil: '2026-10-23T04:20:00Z',
      })
    );
    db.prepare(
      'INSERT INTO orchestration_v2_projection_subagents VALUES (?,?,?,?,?,?,?)'
    ).run(
      'task',
      'root',
      'child',
      'completed',
      'app_owned',
      'claude_dd',
      JSON.stringify({
        completionDelivery: {
          state: 'delivered',
          observedByRunId: 'original-parent',
        },
      })
    );
    const run = db.prepare(
      'INSERT INTO orchestration_v2_projection_runs VALUES (?,?,?,?,?,?,?)'
    );
    run.run(
      'run2',
      'child',
      2,
      'completed',
      '2026-10-23T03:00:00Z',
      'claude_dd',
      JSON.stringify({
        startedAt: '2026-10-23T02:00:00Z',
        delegatedTaskId: 'task',
        rootNodeId: 'node2',
        modelSelection: { model: 'opus' },
      })
    );
    run.run(
      'run4',
      'child',
      4,
      'failed',
      '2026-10-23T03:37:00Z',
      'claude_dd',
      JSON.stringify({
        startedAt: '2026-10-23T03:30:00Z',
        rootNodeId: 'node4',
        modelSelection: { model: 'opus' },
        userMessageId: 'followup',
      })
    );
    run.run(
      'run5',
      'child',
      5,
      'queued',
      null,
      'claude_dd',
      JSON.stringify({ modelSelection: { model: 'opus' }, queueHeld: false })
    );
    const node = db.prepare(
      'INSERT INTO orchestration_v2_projection_nodes VALUES (?,?,?,?)'
    );
    node.run('stale2', 'child', 'run2', 'running');
    node.run('stale4', 'child', 'run4', 'pending');
    node.run('queued5', 'child', 'run5', 'waiting');
    db.prepare(
      'INSERT INTO orchestration_v2_projection_messages VALUES (?,?)'
    ).run(
      'followup',
      JSON.stringify({ content: 'PRIVATE USER CONTENT MUST NOT BE PROJECTED' })
    );
    db.prepare(
      'INSERT INTO orchestration_v2_projection_turn_items VALUES (?,?,?,?,?,?,?)'
    ).run(
      'child',
      'run4',
      'node4',
      'error',
      'failed',
      '2026-10-23T03:37:00Z',
      JSON.stringify({
        failure: {
          class: 'usage_limit',
          message: "You've hit your session limit · resets 11:20am",
          resetAt: null,
        },
      })
    );
    db.close();
    const queryStarted = performance.now();
    const snapshot = collectChildren('root', path);
    expect(performance.now() - queryStarted).toBeLessThan(1000);
    expect(
      snapshot.threads.find((item) => item.id === 'child')?.activeWriterNodes
    ).toBe(0);
    expect(checkpointDecision('child', snapshot, [], []).reasons).not.toContain(
      'writer-not-drained'
    );
    const activeDb = new DatabaseSync(path);
    activeDb
      .prepare(
        'INSERT INTO orchestration_v2_projection_runs VALUES (?,?,?,?,?,?,?)'
      )
      .run(
        'active-writer',
        'child',
        6,
        'running',
        null,
        'claude_dd',
        JSON.stringify({ rootNodeId: 'active-node' })
      );
    activeDb
      .prepare('INSERT INTO orchestration_v2_projection_nodes VALUES (?,?,?,?)')
      .run('active-node', 'child', 'active-writer', 'running');
    expect(
      collectChildren('root', path).threads.find((item) => item.id === 'child')
        ?.activeWriterNodes
    ).toBe(1);
    activeDb
      .prepare(
        "UPDATE orchestration_v2_projection_runs SET status='completed' WHERE run_id='active-writer'"
      )
      .run();
    activeDb.close();
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE USER CONTENT');
    const result = reconcileChildren(
      snapshot,
      'root',
      new Date('2026-10-23T03:38:00Z'),
      'Asia/Ho_Chi_Minh'
    );
    expect(result.entries[0]).toMatchObject({
      originalTaskStatus: 'completed',
      latestTurnStatus: 'failed',
      delivery: 'missing-event',
      resetAt: '2026-10-23T04:20:00.000Z',
      disposition: 'auto-resume-already-queued-do-not-duplicate',
    });
    const completed = new DatabaseSync(path);
    completed
      .prepare(
        'INSERT INTO orchestration_v2_projection_runs VALUES (?,?,?,?,?,?,?)'
      )
      .run(
        'run6',
        'child',
        6,
        'completed',
        '2026-10-23T03:57:12Z',
        'antigravity',
        JSON.stringify({
          startedAt: '2026-10-23T03:57:00Z',
          rootNodeId: 'node6',
          modelSelection: { model: 'gemini-4-argon-high' },
        })
      );
    completed
      .prepare(
        'INSERT INTO orchestration_v2_projection_turn_items VALUES (?,?,?,?,?,?,?)'
      )
      .run(
        'child',
        'run6',
        'assistant6',
        'assistant_message',
        'completed',
        '2026-10-23T03:57:12Z',
        JSON.stringify({
          text: 'Usage Limit Reached. reset in 6 days, 23 hours',
        })
      );
    completed
      .prepare('INSERT INTO orchestration_v2_projection_threads VALUES (?,?)')
      .run('unrelated-root', '{}');
    const otherRun = completed.prepare(
      'INSERT INTO orchestration_v2_projection_runs VALUES (?,?,?,?,?,?,?)'
    );
    const otherItem = completed.prepare(
      'INSERT INTO orchestration_v2_projection_turn_items VALUES (?,?,?,?,?,?,?)'
    );
    for (const [id, provider, at] of [
      ['other', 'antigravity', '2026-10-23T03:58:00Z'],
      ['old', 'antigravity', '2026-01-01T00:00:00Z'],
      ['foreign', 'unknown-provider', '2026-10-23T03:58:00Z'],
    ] as const) {
      otherRun.run(
        id,
        'unrelated-root',
        1,
        'completed',
        at,
        provider,
        JSON.stringify({
          rootNodeId: id,
          modelSelection: { model: 'gemini-4-argon-high' },
        })
      );
      otherItem.run(
        'unrelated-root',
        id,
        id,
        'assistant_message',
        'completed',
        at,
        JSON.stringify({ text: 'Rate limit reached. resets in 7 days' })
      );
    }
    otherRun.run(
      'claude-usage-class',
      'unrelated-root',
      4,
      'failed',
      '2026-10-23T03:59:45Z',
      'claude_dd',
      JSON.stringify({ rootNodeId: 'claude-usage-class' })
    );
    otherItem.run(
      'unrelated-root',
      'claude-usage-class',
      'claude-usage-node',
      'error',
      'failed',
      '2026-10-23T03:59:45Z',
      JSON.stringify({
        failure: {
          class: 'usage_limit',
          message: 'Claude API rate limit reached. Try again later.',
        },
      })
    );
    otherRun.run(
      'noisy',
      'unrelated-root',
      2,
      'completed',
      '2026-10-23T03:59:00Z',
      'antigravity',
      JSON.stringify({ rootNodeId: 'noisy' })
    );
    otherItem.run(
      'unrelated-root',
      'noisy',
      'noisy-first',
      'assistant_message',
      'completed',
      '2026-10-23T03:58:30Z',
      JSON.stringify({ text: 'This message mentions a limit in prose.' })
    );
    otherItem.run(
      'unrelated-root',
      'noisy',
      'noisy-final',
      'assistant_message',
      'completed',
      '2026-10-23T03:59:00Z',
      JSON.stringify({ text: 'The requested work completed successfully.' })
    );
    otherRun.run(
      'error-capacity',
      'unrelated-root',
      3,
      'failed',
      '2026-10-23T03:59:30Z',
      'antigravity',
      JSON.stringify({ rootNodeId: 'error-capacity' })
    );
    otherItem.run(
      'unrelated-root',
      'error-capacity',
      'error-capacity-node',
      'error',
      'failed',
      '2026-10-23T03:59:30Z',
      JSON.stringify({
        failure: {
          class: 'capacity',
          message: 'Selected model is at capacity',
        },
      })
    );
    for (const [id, message] of [
      ['quota-wording', 'The requested quota exceeded the provider allowance.'],
      [
        'provider-overload-wording',
        'Provider overload while processing request.',
      ],
    ] as const) {
      otherRun.run(
        id,
        'unrelated-root',
        5,
        'failed',
        '2026-10-23T03:59:40Z',
        'antigravity',
        JSON.stringify({ rootNodeId: id })
      );
      otherItem.run(
        'unrelated-root',
        id,
        `${id}-node`,
        'error',
        'failed',
        '2026-10-23T03:59:40Z',
        JSON.stringify({
          failure: {
            class: id === 'quota-wording' ? 'usage_limit' : 'capacity',
            message,
          },
        })
      );
    }
    completed.close();
    const global = collectPoolReceipts(
      ['antigravity'],
      new Date('2026-10-23T04:00:00Z'),
      path
    );
    expect(global.failures.map((f) => f.runId)).toEqual(
      expect.arrayContaining(['run6', 'other'])
    );
    expect(global.failures.map((f) => f.runId)).toContain('error-capacity');
    expect(global.failures.map((f) => f.runId)).toEqual(
      expect.arrayContaining(['quota-wording', 'provider-overload-wording'])
    );
    const allProviders = collectPoolReceipts(
      ['antigravity', 'claude_dd'],
      new Date('2026-10-23T04:00:00Z'),
      path
    );
    expect(allProviders.failures).toContainEqual(
      expect.objectContaining({
        runId: 'claude-usage-class',
        classification: 'usage_limit',
        message: 'Claude API rate limit reached. Try again later.',
      })
    );
    expect(global.failures.map((f) => f.runId)).not.toContain('noisy');
    expect(global.failures.map((f) => f.runId)).not.toContain('old');
    expect(global.failures.map((f) => f.runId)).not.toContain('foreign');
    expect(
      collectChildren('root', path).failures.map((f) => f.runId)
    ).not.toContain('other');
    const limit = reconcileChildren(
      collectChildren('root', path),
      'root',
      new Date('2026-10-23T04:00:00Z')
    ).entries.find((entry) => entry.runId === 'run6');
    expect(limit).toMatchObject({
      runStatus: 'completed',
      failureClass: 'usage-limit',
      resetAt: '2026-10-30T02:57:12.000Z',
    });
    expect(() => collectChildren('absent', path)).toThrow(
      'parent-thread-not-found'
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('reads checkpoint state directly for one thread within its latency budget', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-checkpoint-read-'));
  const path = join(dir, 'state.sqlite');
  try {
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT,payload_json TEXT);
      CREATE TABLE orchestration_v2_projection_runs(run_id TEXT,thread_id TEXT,status TEXT);
      CREATE TABLE orchestration_v2_projection_nodes(node_id TEXT,thread_id TEXT,run_id TEXT,status TEXT);
      CREATE INDEX projection_threads_thread_id ON orchestration_v2_projection_threads(thread_id);
      CREATE INDEX projection_runs_thread_id_status ON orchestration_v2_projection_runs(thread_id,status);
      CREATE INDEX projection_nodes_thread_id_run_id_status ON orchestration_v2_projection_nodes(thread_id,run_id,status);
      INSERT INTO orchestration_v2_projection_threads VALUES ('owner', '{}'), ('other', '{}');
      INSERT INTO orchestration_v2_projection_runs VALUES
        ('done', 'owner', 'completed'),
        ('active', 'owner', 'running'),
        ('queued', 'owner', 'queued'),
        ('other-run', 'other', 'running');
      INSERT INTO orchestration_v2_projection_nodes VALUES
        ('stale-node', 'owner', 'done', 'running'),
        ('active-node', 'owner', 'active', 'running'),
        ('foreign-node', 'other', 'other-run', 'running');
    `);
    const indexedPlans = [
      db
        .prepare(`EXPLAIN QUERY PLAN ${CHECKPOINT_THREAD_QUERY}`)
        .all('owner')
        .map((row) => String((row as { detail: string }).detail)),
      db
        .prepare(`EXPLAIN QUERY PLAN ${CHECKPOINT_RUNS_QUERY}`)
        .all('owner')
        .map((row) => String((row as { detail: string }).detail)),
    ];
    expect(indexedPlans).toHaveLength(2);
    for (const plan of indexedPlans)
      expect(
        plan.some((detail) => /SEARCH .+ USING .+INDEX/.test(detail))
      ).toBe(true);
    db.exec(`
      BEGIN;
      WITH RECURSIVE seq(n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 50000
      ) INSERT INTO orchestration_v2_projection_threads
        SELECT 'bulk-' || n, '{}' FROM seq;
      WITH RECURSIVE seq(n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 50000
      ) INSERT INTO orchestration_v2_projection_runs
        SELECT 'bulk-run-' || n, 'bulk-' || n, 'completed' FROM seq;
      WITH RECURSIVE seq(n) AS (
        SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 50000
      ) INSERT INTO orchestration_v2_projection_nodes
        SELECT 'bulk-node-' || n, 'bulk-' || n, 'bulk-run-' || n, 'running' FROM seq;
      COMMIT;
    `);
    db.close();
    const startedAt = performance.now();
    const snapshot = collectCheckpointThread('owner', path);
    const elapsed = performance.now() - startedAt;
    expect(elapsed).toBeLessThan(CHECKPOINT_READ_BUDGET_MS);
    expect(snapshot.threads).toEqual([{ id: 'owner', activeWriterNodes: 1 }]);
    expect(snapshot.runs.map((run) => run.status).sort()).toEqual([
      'queued',
      'running',
    ]);
    expect(snapshot.runs.every((run) => run.threadId === 'owner')).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
