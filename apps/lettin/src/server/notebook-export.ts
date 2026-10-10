import type {
  LettinDraft,
  LettinNotebookExport,
} from '@tuturuuu/internal-api/lettin';
import { type Actor, LettinError, type Store, worldRole } from './context';
import { lettinDraftSchema, withinLettinDepth } from './schema';
import { publishedReferences } from './wiki-references';
export const exportByteLimit = 10 * 1024 * 1024;
export async function exportNotebook(
  db: Store,
  actor: Actor,
  worldId: string,
  scope: 'published' | 'draft',
  privateConsent: boolean
): Promise<LettinNotebookExport> {
  const role = await worldRole(db, actor, worldId);
  if (scope === 'draft' && (role !== 'owner' || !privateConsent))
    throw new LettinError(403);
  // Scope is an internal enum, never interpolated from unchecked query text.
  const column = scope === 'draft' ? 'draft' : 'published';
  const world = await db
    .prepare(`SELECT ${column} AS document FROM worlds WHERE id=? AND ws_id=?`)
    .bind(worldId, actor.wsId)
    .first<{ document: string | null }>();
  if (!world?.document) throw new LettinError(404);
  const stats = await db
    .prepare(
      `SELECT count(*) AS count,coalesce(sum(length(CAST(${column} AS BLOB))),0) AS bytes FROM entries WHERE world_id=? AND ws_id=? AND ${column} IS NOT NULL`
    )
    .bind(worldId, actor.wsId)
    .first<{ count: number; bytes: number }>();
  if (
    !stats ||
    stats.count > 1000 ||
    stats.bytes + new TextEncoder().encode(world.document).byteLength >
      exportByteLimit
  )
    throw new LettinError(413);
  const rows = await db
    .prepare(
      `SELECT id,${column} AS document FROM entries WHERE world_id=? AND ws_id=? AND ${column} IS NOT NULL ORDER BY id LIMIT 1001`
    )
    .bind(worldId, actor.wsId)
    .all<{ id: string; document: string }>();
  if (rows.results.length > 1000) throw new LettinError(413);
  const ids = new Set(rows.results.map((row) => row.id));
  const project = (value: string): LettinDraft => {
    let data: unknown;
    try {
      data = JSON.parse(value);
    } catch {
      throw new LettinError(422);
    }
    if (!withinLettinDepth(data))
      throw new LettinError(422, 'Invalid saved document depth');
    const parsed = lettinDraftSchema.safeParse(data);
    if (!parsed.success) throw new LettinError(422, 'Invalid saved document');
    if (scope === 'published') delete parsed.data.workProgress;
    return publishedReferences(parsed.data, ids);
  };
  const result: LettinNotebookExport = {
    format: 'lettin-notebook',
    version: 1,
    scope,
    exportedAt: new Date().toISOString(),
    world: { id: worldId, document: project(world.document) },
    entries: rows.results.map((row) => ({
      id: row.id,
      document: project(row.document),
    })),
  };
  if (
    new TextEncoder().encode(JSON.stringify(result)).byteLength >
    exportByteLimit
  )
    throw new LettinError(413);
  // Recheck creator/collaborator revocation after reading all rows.
  const currentRole = await worldRole(db, actor, worldId);
  if (scope === 'draft' && currentRole !== 'owner') throw new LettinError(403);
  if (scope === 'published') {
    const stillPublic = await db
      .prepare(`SELECT 1 FROM worlds w WHERE w.id=? AND w.ws_id=? AND w.published IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM json_each(?) exported WHERE NOT EXISTS(
        SELECT 1 FROM entries e WHERE e.id=exported.value AND e.world_id=w.id AND e.ws_id=w.ws_id AND e.published IS NOT NULL))`)
      .bind(worldId, actor.wsId, JSON.stringify([...ids]))
      .first();
    if (!stillPublic) throw new LettinError(409, 'Publication changed');
  }
  return result;
}
