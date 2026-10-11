import type { LettinSavedCreator } from '@tuturuuu/internal-api/lettin';
import { LettinError, type Store } from './context';
export async function creatorSaved(
  db: Store,
  actorId: string,
  creatorId: string
) {
  return {
    saved: !!(await db
      .prepare(
        'SELECT 1 FROM creator_bookmarks WHERE user_id=? AND creator_id=?'
      )
      .bind(actorId, creatorId)
      .first()),
  };
}
export async function savedCreators(
  db: Store,
  actorId: string
): Promise<LettinSavedCreator[]> {
  const rows = await db
    .prepare(`SELECT b.creator_id,b.created_at,
    (SELECT json_extract(w.published,'$.title') FROM worlds w
      WHERE w.owner_id=b.creator_id AND w.published IS NOT NULL
      ORDER BY w.published_at DESC,w.id LIMIT 1) AS notebook_title
    FROM creator_bookmarks b WHERE b.user_id=?
    ORDER BY b.created_at DESC,b.creator_id LIMIT 500`)
    .bind(actorId)
    .all<{
      creator_id: string;
      created_at: string;
      notebook_title: string | null;
    }>();
  return rows.results.map((row) => ({
    creatorId: row.creator_id,
    savedAt: row.created_at,
    notebookTitle: row.notebook_title,
  }));
}
export async function setCreatorSaved(
  db: Store,
  actorId: string,
  creatorId: string,
  saved: boolean
) {
  if (!saved) {
    await db
      .prepare('DELETE FROM creator_bookmarks WHERE user_id=? AND creator_id=?')
      .bind(actorId, creatorId)
      .run();
    return { saved: false };
  }
  // Publication and actor quota are fenced in the same insert; no identity copy.
  const inserted = await db
    .prepare(`INSERT INTO creator_bookmarks(user_id,creator_id)
    SELECT ?,? WHERE EXISTS(SELECT 1 FROM worlds WHERE owner_id=? AND published IS NOT NULL)
    AND (SELECT count(*) FROM creator_bookmarks WHERE user_id=?)<500
    ON CONFLICT(user_id,creator_id) DO NOTHING RETURNING creator_id`)
    .bind(actorId, creatorId, creatorId, actorId)
    .first();
  if (inserted || (await creatorSaved(db, actorId, creatorId)).saved)
    return { saved: true };
  if (
    !(await db
      .prepare(
        'SELECT 1 FROM worlds WHERE owner_id=? AND published IS NOT NULL'
      )
      .bind(creatorId)
      .first())
  )
    throw new LettinError(404);
  throw new LettinError(429, 'Saved creator limit reached');
}
