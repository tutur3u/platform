import type { Store } from './context';

// Claim old unreferenced objects atomically. Saves only accept unclaimed media,
// so a concurrent edit either retains the object or receives a revision conflict.
export async function cleanupMedia(
  db: Store,
  bucket: R2Bucket,
  worldId: string
) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .prepare(`UPDATE media SET deleting=1 WHERE id IN (
    SELECT m.id FROM media m WHERE m.world_id=? AND (m.deleting=1 OR (m.created_at<?
    AND NOT EXISTS(SELECT 1 FROM worlds w WHERE w.id=m.world_id AND
      (json_extract(w.draft,'$.image')='/api/v1/lettin/media/'||m.id OR json_extract(w.published,'$.image')='/api/v1/lettin/media/'||m.id))
    AND NOT EXISTS(SELECT 1 FROM entries e WHERE e.world_id=m.world_id AND
      (json_extract(e.draft,'$.image')='/api/v1/lettin/media/'||m.id OR json_extract(e.published,'$.image')='/api/v1/lettin/media/'||m.id))))
    ORDER BY m.created_at LIMIT 10) RETURNING id,object_path`)
    .bind(worldId, cutoff)
    .all<{ id: string; object_path: string }>();
  for (const row of rows.results) {
    await bucket.delete(row.object_path);
    await db
      .prepare('DELETE FROM media WHERE id=? AND deleting=1')
      .bind(row.id)
      .run();
  }
}

export function validArtwork(image: string, worldId: string) {
  const prefix = '/api/v1/lettin/media/';
  return {
    sql: '(?=1 OR EXISTS(SELECT 1 FROM media WHERE id=? AND world_id=? AND deleting=0))',
    values: [
      Number(!image.startsWith(prefix)),
      image.slice(prefix.length),
      worldId,
    ],
  };
}
