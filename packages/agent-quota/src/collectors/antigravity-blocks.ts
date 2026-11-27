import { DatabaseSync } from 'node:sqlite';
import { blockUntil, createBlock } from '../block-ledger';
import { t3StateDatabase } from './paths';

export function collectAntigravityBlocks(
  instanceIds: string[],
  now: Date,
  databasePath = t3StateDatabase()
) {
  if (!instanceIds.length) return [];
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = db
      .prepare(`
      SELECT r.provider_instance_id AS pool,
        json_extract(r.payload_json, '$.modelSelection.model') AS model,
        substr(json_extract(i.payload_json, '$.failure.message'), 1, 4096) AS message,
        json_extract(i.payload_json, '$.failure.resetAt') AS resetAt,
        i.updated_at AS observedAt
      FROM orchestration_v2_projection_turn_items i
      JOIN orchestration_v2_projection_runs r ON r.run_id = i.run_id
      WHERE i.type = 'error' AND i.status = 'failed' AND r.status = 'failed'
        AND i.node_id IS json_extract(r.payload_json, '$.rootNodeId')
        AND r.provider_instance_id IN (SELECT value FROM json_each(?))
        AND i.updated_at BETWEEN ? AND ?
        AND (
          lower(trim(json_extract(i.payload_json, '$.failure.message'))) LIKE 'individual quota reached%'
          OR lower(trim(json_extract(i.payload_json, '$.failure.message'))) LIKE 'third-party quota reached%'
        )
      LIMIT 501
    `)
      .all(
        JSON.stringify(instanceIds),
        new Date(now.getTime() - 30 * 86_400_000).toISOString(),
        now.toISOString()
      );
    if (rows.length > 500) throw new Error('antigravity-receipts-over-limit');
    return rows.flatMap(({ pool, model, message, resetAt, observedAt }) => {
      if (
        typeof pool !== 'string' ||
        typeof model !== 'string' ||
        /[*?]/.test(model) ||
        typeof message !== 'string' ||
        typeof observedAt !== 'string'
      )
        return [];
      try {
        const block = createBlock({
          pool,
          modelScope: model,
          reason: 'Antigravity quota reached',
          evidence: message,
          observedAt,
          resetAt: typeof resetAt === 'string' ? resetAt : undefined,
        });
        return blockUntil(block) > now.getTime() ? [block] : [];
      } catch {
        return [];
      }
    });
  } finally {
    db.close();
  }
}
