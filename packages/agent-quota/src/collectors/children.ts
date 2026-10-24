import { DatabaseSync } from 'node:sqlite';
import {
  completedFailureClass,
  executionFailureKind,
  safeReceipt,
} from '../failure-receipt';
import { HookError } from '../hook-ledger';
import type {
  ChildFailure,
  ChildRun,
  ChildSnapshot,
  ChildTask,
  ChildThread,
  ChildTransfer,
} from '../reconcile-children';
import { t3StateDatabase } from './paths';

const scope = `WITH RECURSIVE descendants(thread_id) AS (
 SELECT thread_id FROM orchestration_v2_projection_threads WHERE thread_id = ?
 UNION
 SELECT t.thread_id FROM orchestration_v2_projection_threads t JOIN descendants d ON json_extract(t.payload_json,'$.lineage.parentThreadId') = d.thread_id
 UNION
 SELECT s.child_thread_id FROM orchestration_v2_projection_subagents s JOIN descendants d ON s.thread_id=d.thread_id WHERE s.child_thread_id IS NOT NULL
) `;
const receiptPrefixes = [
  "LIKE 'usage limit reached%'",
  "LIKE 'you''ve hit your limit%'",
  "LIKE 'you''ve hit your session limit%'",
  "LIKE 'you''ve hit your usage limit%'",
  "LIKE 'you have reached your usage limit%'",
  "LIKE 'rate limit reached%'",
  "LIKE 'claude api rate limit reached%'",
  "LIKE 'quota exceeded%'",
  "LIKE '%quota exceeded%'",
  "LIKE '%provider overload%'",
  "LIKE 'you have exceeded your quota%'",
  "LIKE 'selected model is at capacity%'",
  "LIKE 'we''re at capacity%'",
  "LIKE 'we are at capacity%'",
  "LIKE 'the service is at capacity%'",
  "LIKE 'the model is at capacity%'",
  "LIKE 'the provider is at capacity%'",
  "LIKE 'overload%'",
  "LIKE 'resource exhausted%'",
  "LIKE 'temporarily unavailable%'",
  "LIKE 'capacity error%'",
  "LIKE 'capacity exceeded%'",
  "LIKE 'capacity exhausted%'",
  "LIKE 'context allowance%'",
  "LIKE 'context window%'",
  "LIKE 'context limit%'",
  "LIKE 'prompt too long%'",
  "LIKE 'provider failed to start%'",
  "LIKE 'failed to start provider%'",
  "LIKE 'provider startup failed%'",
];
const terminalPrefixPredicate = (expression: string) =>
  `(${receiptPrefixes.map((prefix) => `${expression} ${prefix}`).join(' OR ')})`;
const ACTIVE_WRITER_NODE_SCAN_LIMIT = 1001;
export const CHECKPOINT_READ_BUDGET_MS = 250;
export interface CheckpointThreadSnapshot {
  threads: Pick<ChildThread, 'id' | 'activeWriterNodes'>[];
  runs: Pick<ChildRun, 'threadId' | 'status'>[];
}

export const CHECKPOINT_THREAD_QUERY = `SELECT t.thread_id AS id,
  (SELECT COUNT(*) FROM (
    SELECT 1
    FROM orchestration_v2_projection_nodes n
    JOIN orchestration_v2_projection_runs active_run
      ON active_run.run_id=n.run_id AND active_run.thread_id=n.thread_id
    WHERE n.thread_id=t.thread_id
      AND n.status IN ('running','pending','waiting')
      AND active_run.status IN ('running','starting','preparing','waiting')
    LIMIT ${ACTIVE_WRITER_NODE_SCAN_LIMIT}
  )) AS activeWriterNodes
 FROM orchestration_v2_projection_threads t
 WHERE t.thread_id=?
 LIMIT 1`;

export const CHECKPOINT_RUNS_QUERY = `SELECT thread_id AS threadId,status
 FROM orchestration_v2_projection_runs
 WHERE thread_id=?
   AND status IN ('queued','running','starting','preparing','waiting')`;

export function collectChildren(
  parentId: string,
  databasePath = t3StateDatabase(),
  poolScan?: { instanceIds: string[]; now: Date }
): ChildSnapshot {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=1000');
    db.exec('BEGIN');
    const since = new Date(
      (poolScan?.now ?? new Date()).getTime() - 30 * 86400_000
    ).toISOString();
    const recentRunRecords = poolScan
      ? (db
          .prepare(`SELECT DISTINCT r.run_id AS runId,r.thread_id AS threadId FROM orchestration_v2_projection_runs r
      WHERE provider_instance_id IN (SELECT value FROM json_each(?))
      AND julianday(completed_at) >= julianday(?) AND julianday(completed_at) <= julianday(?)
      AND r.status IN ('failed','completed')
      AND (EXISTS(SELECT 1 FROM orchestration_v2_projection_turn_items receipt WHERE receipt.run_id=r.run_id
        AND receipt.type='error' AND receipt.status='failed'
        AND (lower(json_extract(receipt.payload_json,'$.failure.class')) IN ('usage_limit','context_allowance','context-allowance','context_allowance_failure','provider_start','provider-start','provider_start_failure')
          OR (json_type(receipt.payload_json,'$.failure.message')='text'
          AND ${terminalPrefixPredicate("lower(trim(replace(json_extract(receipt.payload_json,'$.failure.message'),'’',char(39))))")})))
        OR (r.status='completed' AND EXISTS(SELECT 1 FROM orchestration_v2_projection_turn_items receipt WHERE receipt.run_id=r.run_id
          AND receipt.type='assistant_message'
          AND NOT EXISTS(SELECT 1 FROM orchestration_v2_projection_turn_items newer WHERE newer.run_id=receipt.run_id AND newer.type='assistant_message' AND newer.updated_at>receipt.updated_at)
          AND ${terminalPrefixPredicate("lower(trim(replace(json_extract(receipt.payload_json,'$.text'),'’',char(39))))")})))
      LIMIT 5001`)
          .all(
            JSON.stringify(poolScan.instanceIds),
            since,
            poolScan.now.toISOString()
          ) as { runId: string; threadId: string }[])
      : undefined;
    if (recentRunRecords && recentRunRecords.length > 5000)
      throw new HookError('descendant-snapshot-too-large');
    const queryScope = poolScan
      ? `WITH recent_runs AS (
      SELECT json_extract(value,'$.runId') AS run_id,json_extract(value,'$.threadId') AS thread_id FROM json_each(?)
    ), descendants(thread_id) AS (SELECT DISTINCT thread_id FROM recent_runs) `
      : scope;
    const bindings = poolScan ? [JSON.stringify(recentRunRecords)] : [parentId];
    const rows = <T>(sql: string): T[] => {
      if (poolScan) {
        if (sql.includes('FROM orchestration_v2_projection_runs r'))
          sql += ' WHERE r.run_id IN (SELECT run_id FROM recent_runs)';
        if (sql.includes('FROM orchestration_v2_projection_turn_items i'))
          sql += ' AND i.run_id IN (SELECT run_id FROM recent_runs)';
      }
      const result = db
        .prepare(`${queryScope}${sql} LIMIT 5001`)
        .all(...bindings) as T[];
      if (result.length > 5000)
        throw new HookError('descendant-snapshot-too-large');
      return result;
    };
    const threads = poolScan
      ? []
      : rows<ChildThread>(`SELECT t.thread_id AS id, json_extract(t.payload_json,'$.lineage.parentThreadId') AS parentId,
   json_extract(t.payload_json,'$.snoozedUntil') AS snoozedUntil,
   EXISTS(SELECT 1 FROM orchestration_v2_projection_runtime_requests q WHERE q.thread_id=t.thread_id AND q.status='pending' AND q.kind='user_input') AS pendingQuestion,
   EXISTS(SELECT 1 FROM orchestration_v2_projection_runtime_requests q WHERE q.thread_id=t.thread_id AND q.status='pending' AND q.kind IN ('command','file-read','file-change','mcp-elicitation','permission')) AS pendingApproval,
   (SELECT COUNT(*) FROM (
     SELECT 1 FROM orchestration_v2_projection_nodes n
     JOIN orchestration_v2_projection_runs active_run ON active_run.run_id=n.run_id AND active_run.thread_id=n.thread_id
     WHERE n.thread_id=t.thread_id AND n.status IN ('running','pending','waiting')
       AND active_run.status IN ('running','starting','preparing','waiting')
     LIMIT ${ACTIVE_WRITER_NODE_SCAN_LIMIT}
   )) AS activeWriterNodes
   FROM orchestration_v2_projection_threads t JOIN descendants d ON d.thread_id=t.thread_id`);
    if (!poolScan && !threads.some((thread) => thread.id === parentId))
      throw new HookError('parent-thread-not-found');
    const runs =
      rows<ChildRun>(`SELECT r.run_id AS id,r.thread_id AS threadId,r.ordinal,r.status,r.completed_at AS completedAt,
   json_extract(r.payload_json,'$.startedAt') AS startedAt,r.provider_instance_id AS instanceId,
   json_extract(r.payload_json,'$.modelSelection.model') AS model,json_extract(r.payload_json,'$.delegatedTaskId') AS taskId,
   json_extract(r.payload_json,'$.rootNodeId') AS rootNodeId,COALESCE(json_extract(r.payload_json,'$.queueHeld'),0) AS queueHeld,
   (SELECT CASE WHEN m.message_id GLOB 'limit-resume:*' AND json_extract(m.payload_json,'$.createdBy')='user' AND json_extract(m.payload_json,'$.creationSource')='server' THEN m.message_id END FROM orchestration_v2_projection_messages m WHERE m.message_id=json_extract(r.payload_json,'$.userMessageId')) AS limitResumeMessageId,
   COALESCE((SELECT json_extract(m.payload_json,'$.notification.source.kind')='monitor' FROM orchestration_v2_projection_messages m WHERE m.message_id=json_extract(r.payload_json,'$.userMessageId')),0) AS monitor
   FROM orchestration_v2_projection_runs r JOIN descendants d ON d.thread_id=r.thread_id`);
    const tasks = poolScan
      ? []
      : rows<ChildTask>(`SELECT s.subagent_id AS id,s.thread_id AS parentId,s.child_thread_id AS childId,s.status,s.origin,s.provider_instance_id AS instanceId,
   json_extract(s.payload_json,'$.completionDelivery.state') AS deliveryState,json_extract(s.payload_json,'$.completionDelivery.observedByRunId') AS observedByRunId
   FROM orchestration_v2_projection_subagents s JOIN descendants d ON d.thread_id=s.thread_id`);
    const failures =
      rows<ChildFailure>(`SELECT i.run_id AS runId,i.node_id AS nodeId,
   substr(json_extract(i.payload_json,'$.failure.message'),1,4096) AS message,json_extract(i.payload_json,'$.failure.class') AS classification,
   json_extract(i.payload_json,'$.failure.resetAt') AS resetAt,i.updated_at AS observedAt
   FROM orchestration_v2_projection_turn_items i JOIN descendants d ON d.thread_id=i.thread_id
   WHERE i.type='error' AND i.status='failed' AND json_type(i.payload_json,'$.failure.message')='text'
   AND EXISTS(SELECT 1 FROM orchestration_v2_projection_runs terminal WHERE terminal.run_id=i.run_id AND terminal.status='failed')
   AND (lower(json_extract(i.payload_json,'$.failure.class')) IN ('usage_limit','context_allowance','context-allowance','context_allowance_failure','provider_start','provider-start','provider_start_failure') OR ${terminalPrefixPredicate("lower(trim(replace(json_extract(i.payload_json,'$.failure.message'),'’',char(39))))")})`);
    const completedReceipts = rows<ChildFailure>(`SELECT i.run_id AS runId,
      json_extract(r.payload_json,'$.rootNodeId') AS nodeId,
      substr(json_extract(i.payload_json,'$.text'),1,4096) AS message,
      NULL AS classification,NULL AS resetAt,i.updated_at AS observedAt
      FROM orchestration_v2_projection_turn_items i
      JOIN descendants d ON d.thread_id=i.thread_id
      JOIN orchestration_v2_projection_runs r ON r.run_id=i.run_id
      JOIN (SELECT j.run_id,MAX(j.updated_at) AS finalAt FROM orchestration_v2_projection_turn_items j JOIN descendants dj ON dj.thread_id=j.thread_id WHERE j.type='assistant_message' GROUP BY j.run_id) final ON final.run_id=i.run_id AND final.finalAt=i.updated_at
      WHERE r.status='completed' AND i.type='assistant_message'
      AND NOT EXISTS(SELECT 1 FROM orchestration_v2_projection_turn_items newer WHERE newer.run_id=i.run_id AND newer.type='assistant_message' AND newer.updated_at>i.updated_at)
      AND ${terminalPrefixPredicate("lower(trim(replace(json_extract(i.payload_json,'$.text'),'’',char(39))))")}`);
    for (const receipt of completedReceipts) {
      const kind = completedFailureClass(receipt.message);
      if (
        kind === 'usage-limit' ||
        kind === 'capacity' ||
        executionFailureKind(receipt.message)
      )
        failures.push({
          ...receipt,
          message: safeReceipt(receipt.message, kind ?? 'other').text,
        });
    }
    const transfers = poolScan
      ? []
      : rows<ChildTransfer>(`SELECT c.source_thread_id AS sourceId,c.target_thread_id AS parentId,json_extract(c.payload_json,'$.sourcePoint.runId') AS runId,
   json_extract(c.payload_json,'$.consumedAt') AS consumedAt
   FROM orchestration_v2_projection_context_transfers c JOIN descendants d ON d.thread_id=c.source_thread_id WHERE c.type='subagent_result'`);
    return {
      threads: threads.map((thread) => ({
        ...thread,
        pendingQuestion: Boolean(thread.pendingQuestion),
        pendingApproval: Boolean(thread.pendingApproval),
      })),
      runs: runs.map((run) => ({
        ...run,
        queueHeld: Boolean(run.queueHeld),
        monitor: Boolean(run.monitor),
      })),
      tasks,
      failures,
      transfers,
    };
  } finally {
    db.close();
  }
}

export function collectCheckpointThread(
  threadId: string,
  databasePath = t3StateDatabase()
): CheckpointThreadSnapshot {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec('PRAGMA busy_timeout=1000');
    db.exec('BEGIN');
    const threads = db
      .prepare(CHECKPOINT_THREAD_QUERY)
      .all(threadId) as CheckpointThreadSnapshot['threads'];
    if (!threads.length) throw new HookError('checkpoint-thread-unavailable');
    const runs = db
      .prepare(CHECKPOINT_RUNS_QUERY)
      .all(threadId) as CheckpointThreadSnapshot['runs'];
    db.exec('COMMIT');
    return { threads, runs };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The read transaction may already have ended.
    }
    throw error;
  } finally {
    db.close();
  }
}

// Shared quota facts cross orchestrator trees; the same projection reader bounds time and catalog IDs.
export function collectPoolReceipts(
  instanceIds: string[],
  now: Date,
  databasePath = t3StateDatabase()
) {
  if (!instanceIds.length) throw new HookError('receipt-catalog-unavailable');
  return collectChildren('', databasePath, { instanceIds, now });
}
