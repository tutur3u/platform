import { DatabaseSync } from 'node:sqlite';
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
export function collectChildren(
  parentId: string,
  databasePath = t3StateDatabase()
): ChildSnapshot {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    db.exec('BEGIN');
    const rows = <T>(sql: string): T[] => {
      const result = db
        .prepare(`${scope}${sql} LIMIT 5001`)
        .all(parentId) as T[];
      if (result.length > 5000)
        throw new HookError('descendant-snapshot-too-large');
      return result;
    };
    const threads =
      rows<ChildThread>(`SELECT t.thread_id AS id, json_extract(t.payload_json,'$.lineage.parentThreadId') AS parentId,
   json_extract(t.payload_json,'$.snoozedUntil') AS snoozedUntil,
   EXISTS(SELECT 1 FROM orchestration_v2_projection_runtime_requests q WHERE q.thread_id=t.thread_id AND q.status='pending' AND q.kind='user_input') AS pendingQuestion,
   EXISTS(SELECT 1 FROM orchestration_v2_projection_runtime_requests q WHERE q.thread_id=t.thread_id AND q.status='pending' AND q.kind IN ('command','file-read','file-change','mcp-elicitation','permission')) AS pendingApproval,
   (SELECT COUNT(*) FROM orchestration_v2_projection_nodes n WHERE n.thread_id=t.thread_id AND n.status IN ('running','pending','waiting')) AS activeWriterNodes
   FROM orchestration_v2_projection_threads t JOIN descendants d ON d.thread_id=t.thread_id`);
    if (!threads.some((thread) => thread.id === parentId))
      throw new HookError('parent-thread-not-found');
    const runs =
      rows<ChildRun>(`SELECT r.run_id AS id,r.thread_id AS threadId,r.ordinal,r.status,r.completed_at AS completedAt,
   json_extract(r.payload_json,'$.startedAt') AS startedAt,r.provider_instance_id AS instanceId,
   json_extract(r.payload_json,'$.modelSelection.model') AS model,json_extract(r.payload_json,'$.delegatedTaskId') AS taskId,
   json_extract(r.payload_json,'$.rootNodeId') AS rootNodeId,COALESCE(json_extract(r.payload_json,'$.queueHeld'),0) AS queueHeld,
   (SELECT CASE WHEN m.message_id GLOB 'limit-resume:*' AND json_extract(m.payload_json,'$.createdBy')='user' AND json_extract(m.payload_json,'$.creationSource')='server' THEN m.message_id END FROM orchestration_v2_projection_messages m WHERE m.message_id=json_extract(r.payload_json,'$.userMessageId')) AS limitResumeMessageId,
   COALESCE((SELECT json_extract(m.payload_json,'$.notification.source.kind')='monitor' FROM orchestration_v2_projection_messages m WHERE m.message_id=json_extract(r.payload_json,'$.userMessageId')),0) AS monitor
   FROM orchestration_v2_projection_runs r JOIN descendants d ON d.thread_id=r.thread_id`);
    const tasks =
      rows<ChildTask>(`SELECT s.subagent_id AS id,s.thread_id AS parentId,s.child_thread_id AS childId,s.status,s.origin,s.provider_instance_id AS instanceId,
   json_extract(s.payload_json,'$.completionDelivery.state') AS deliveryState,json_extract(s.payload_json,'$.completionDelivery.observedByRunId') AS observedByRunId
   FROM orchestration_v2_projection_subagents s JOIN descendants d ON d.thread_id=s.thread_id`);
    const failures =
      rows<ChildFailure>(`SELECT i.run_id AS runId,i.node_id AS nodeId,
   substr(json_extract(i.payload_json,'$.failure.message'),1,4096) AS message,json_extract(i.payload_json,'$.failure.class') AS classification,
   json_extract(i.payload_json,'$.failure.resetAt') AS resetAt,i.updated_at AS observedAt
   FROM orchestration_v2_projection_turn_items i JOIN descendants d ON d.thread_id=i.thread_id
   WHERE i.type='error' AND i.status='failed' AND json_type(i.payload_json,'$.failure.message')='text'`);
    const transfers =
      rows<ChildTransfer>(`SELECT c.source_thread_id AS sourceId,c.target_thread_id AS parentId,json_extract(c.payload_json,'$.sourcePoint.runId') AS runId,
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
