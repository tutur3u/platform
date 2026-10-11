import type { LettinSavedNotebook } from '@tuturuuu/internal-api/lettin';
import { LettinError, type Store } from './context';
export async function notebookSaved(
  db: Store,
  actorId: string,
  worldId: string
) {
  return {
    saved: !!(await db
      .prepare('SELECT 1 FROM reader_bookmarks WHERE user_id=? AND world_id=?')
      .bind(actorId, worldId)
      .first()),
  };
}
export async function savedNotebooks(
  db: Store,
  actorId: string
): Promise<LettinSavedNotebook[]> {
  const rows = await db
    .prepare(`SELECT b.world_id,b.created_at,
    CASE WHEN w.published IS NOT NULL THEN json_object(
      'title',json_extract(w.published,'$.title'),
      'description',json_extract(w.published,'$.description'),
      'image',json_extract(w.published,'$.image'),
      'credit',json_extract(w.published,'$.credit')) ELSE NULL END AS notebook
    FROM reader_bookmarks b JOIN worlds w ON w.id=b.world_id
    WHERE b.user_id=? ORDER BY b.created_at DESC,b.world_id LIMIT 500`)
    .bind(actorId)
    .all<{ world_id: string; created_at: string; notebook: string | null }>();
  return rows.results.map((row) => ({
    worldId: row.world_id,
    savedAt: row.created_at,
    notebook: row.notebook ? JSON.parse(row.notebook) : null,
  }));
}
export async function setNotebookSaved(
  db: Store,
  actorId: string,
  worldId: string,
  saved: boolean
) {
  if (!saved) {
    await db
      .prepare('DELETE FROM reader_bookmarks WHERE user_id=? AND world_id=?')
      .bind(actorId, worldId)
      .run();
    return { saved: false };
  }
  // Publication and the actor's quota are checked in the same insert.
  const inserted = await db
    .prepare(`INSERT INTO reader_bookmarks(user_id,world_id)
    SELECT ?,id FROM worlds WHERE id=? AND published IS NOT NULL
    AND (SELECT count(*) FROM reader_bookmarks WHERE user_id=?)<500
    ON CONFLICT(user_id,world_id) DO NOTHING RETURNING world_id`)
    .bind(actorId, worldId, actorId)
    .first();
  if (inserted || (await notebookSaved(db, actorId, worldId)).saved)
    return { saved: true };
  const published = await db
    .prepare('SELECT 1 FROM worlds WHERE id=? AND published IS NOT NULL')
    .bind(worldId)
    .first();
  if (!published) throw new LettinError(404);
  throw new LettinError(429, 'Saved notebook limit reached');
}
