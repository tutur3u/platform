import {
  type Actor,
  LettinError,
  type Store,
  worldRole,
  writeAccess,
} from './context';
import { cleanupMedia } from './media-cleanup';

export const mediaTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
export async function uploadMedia(
  db: Store,
  bucket: R2Bucket,
  actor: Actor,
  world: string,
  file: File
) {
  await worldRole(db, actor, world);
  if (
    !mediaTypes.has(file.type) ||
    file.size === 0 ||
    file.size > 10 * 1024 * 1024
  )
    throw new LettinError(400, 'Invalid artwork');
  await cleanupMedia(db, bucket, world);
  const id = crypto.randomUUID();
  const objectPath = `${actor.wsId}/${world}/${id}`;
  await bucket.put(objectPath, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type, cacheControl: 'private, no-store' },
  });
  try {
    const access = writeAccess(actor, world);
    const row = await db
      .prepare(
        `INSERT INTO media(id,ws_id,world_id,object_path,created_by) SELECT ?,?,?,?,? WHERE ${access.sql} RETURNING id`
      )
      .bind(id, actor.wsId, world, objectPath, actor.id, ...access.values)
      .first();
    if (!row) throw new LettinError(403);
  } catch (error) {
    await bucket.delete(objectPath);
    throw error;
  }
  return { image: `/api/v1/lettin/media/${id}` };
}
export async function getMedia(
  db: Store,
  bucket: R2Bucket,
  id: string,
  getActor: (wsId: string) => Promise<Actor>
) {
  const row = await db
    .prepare(
      'SELECT ws_id,world_id,object_path FROM media WHERE id=? AND deleting=0'
    )
    .bind(id)
    .first<{ ws_id: string; world_id: string; object_path: string }>();
  if (!row) throw new LettinError(404);
  const image = `/api/v1/lettin/media/${id}`;
  const published = await db
    .prepare(`SELECT 1 FROM worlds w WHERE w.id=? AND w.published IS NOT NULL AND
    (json_extract(w.published,'$.image')=? OR EXISTS(SELECT 1 FROM entries e WHERE e.world_id=w.id AND e.published IS NOT NULL AND json_extract(e.published,'$.image')=?))`)
    .bind(row.world_id, image, image)
    .first();
  if (!published) {
    try {
      await worldRole(db, await getActor(row.ws_id), row.world_id);
    } catch (error) {
      if (error instanceof LettinError && [401, 403].includes(error.status))
        throw new LettinError(404);
      throw error;
    }
  }
  const object = await bucket.get(row.object_path);
  if (!object) throw new LettinError(404);
  // workerd and DOM declarations differ on the completed reader result, but
  // R2 bodies are native ReadableStreams accepted directly by Response.
  return new Response(object.body as unknown as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type':
        object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
