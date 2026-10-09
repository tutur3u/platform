import type { LettinCommand } from '@tuturuuu/internal-api/lettin';
import {
  type Actor,
  LettinError,
  type Store,
  worldRole,
  writeAccess,
} from './context';
import { lettinDraftSchema } from './schema';
import { draftArtwork } from './wiki-references';

// The caller has already resolved notebook access. The INSERT repeats its fence.
export async function duplicateEntry(
  db: Store,
  actor: Actor,
  command: Extract<LettinCommand, { action: 'duplicateEntry' }>
) {
  const source = await db
    .prepare(
      'SELECT draft,version FROM entries WHERE id=? AND ws_id=? AND world_id=?'
    )
    .bind(command.entryId, actor.wsId, command.worldId)
    .first<{ draft: string; version: number }>();
  if (!source) throw new LettinError(404);
  if (source.version !== command.version)
    throw new LettinError(409, 'Revision conflict');
  const saved = JSON.parse(source.draft);
  const parsed = lettinDraftSchema.safeParse({
    ...saved,
    title: command.title,
    links: [],
    ...(saved.wiki ? { wiki: { ...saved.wiki, relationships: [] } } : {}),
  });
  if (!parsed.success) throw new LettinError(400, 'Invalid saved draft');
  const id = crypto.randomUUID();
  const access = writeAccess(actor, command.worldId);
  const image = draftArtwork(parsed.data, command.worldId);
  const result = await db
    .prepare(`INSERT INTO entries(id,ws_id,world_id,draft)
      SELECT ?,?,?,? FROM entries source
      WHERE source.id=? AND source.ws_id=? AND source.world_id=? AND source.version=?
      AND ${access.sql} AND ${image.sql} RETURNING id`)
    .bind(
      id,
      actor.wsId,
      command.worldId,
      JSON.stringify(parsed.data),
      command.entryId,
      actor.wsId,
      command.worldId,
      command.version,
      ...access.values,
      ...image.values
    )
    .first();
  if (!result) {
    await worldRole(db, actor, command.worldId);
    throw new LettinError(409, 'Source revision or artwork changed');
  }
  return { id };
}
