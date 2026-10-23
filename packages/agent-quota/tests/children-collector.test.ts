import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { collectChildren } from '../src/collectors/children';
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
 CREATE TABLE orchestration_v2_projection_nodes(thread_id TEXT,status TEXT);
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
    const snapshot = collectChildren('root', path);
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
    expect(() => collectChildren('absent', path)).toThrow(
      'parent-thread-not-found'
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
