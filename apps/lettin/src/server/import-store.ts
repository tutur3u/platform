import { type Actor, isCreator, LettinError, type Store } from './context';
import type { PreparedImport } from './import-media';
import type { ImportPlan } from './import-plan';
export async function previewImport(db: Store, actor: Actor, plan: ImportPlan) {
  const id = crypto.randomUUID(),
    worldId = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO import_previews(id,ws_id,actor_id,world_id,plan,expires_at) VALUES (?,?,?,?,?,?)'
    )
    .bind(
      id,
      actor.wsId,
      actor.id,
      worldId,
      JSON.stringify(plan),
      new Date(Date.now() + 15 * 60 * 1000).toISOString()
    )
    .run();
  return {
    id,
    title: plan.world.title,
    count: plan.entries.length,
    blacklistCount: plan.blacklist.length,
    skipped: plan.skipped,
    kinds: plan.entries.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.draft.kind] = (counts[entry.draft.kind] ?? 0) + 1;
      return counts;
    }, {}),
    entries: plan.entries.map((entry) => ({
      title: entry.draft.title,
      kind: entry.draft.kind,
    })),
  };
}
export async function applyImport(
  db: Store,
  actor: Actor,
  id: string,
  prepare?: (worldId: string, plan: ImportPlan) => Promise<PreparedImport>
) {
  if (!actor.canManage || !(await isCreator(db, actor)))
    throw new LettinError(403);
  const preview = await db
    .prepare(
      'SELECT world_id,applied,expires_at,plan FROM import_previews WHERE id=? AND ws_id=? AND actor_id=?'
    )
    .bind(id, actor.wsId, actor.id)
    .first<{
      world_id: string;
      applied: number;
      expires_at: string;
      plan: string;
    }>();
  if (!preview) throw new LettinError(404);
  if (preview.applied) return { id: preview.world_id };
  if (preview.expires_at <= new Date().toISOString())
    throw new LettinError(410, 'Import preview expired');
  const access =
    '(?=1 OR EXISTS(SELECT 1 FROM creators WHERE user_id=? AND enabled=1))';
  const prepared = prepare
    ? await prepare(preview.world_id, JSON.parse(preview.plan))
    : undefined;
  let committed = false;
  try {
    // D1 batches are transactional. All imported records remain private drafts.
    await db.batch([
      ...(prepared
        ? [
            db
              .prepare(
                'UPDATE import_previews SET plan=? WHERE id=? AND ws_id=? AND actor_id=? AND applied=0'
              )
              .bind(JSON.stringify(prepared.plan), id, actor.wsId, actor.id),
          ]
        : []),
      db
        .prepare(
          `INSERT INTO worlds(id,ws_id,owner_id,draft) SELECT world_id,ws_id,actor_id,json_extract(plan,'$.world') FROM import_previews WHERE id=? AND ws_id=? AND actor_id=? AND applied=0 AND expires_at>? AND ${access}`
        )
        .bind(
          id,
          actor.wsId,
          actor.id,
          new Date().toISOString(),
          Number(actor.isAdmin),
          actor.id
        ),
      ...(prepared?.media ?? []).map((item) =>
        db
          .prepare(
            'INSERT INTO media(id,ws_id,world_id,object_path,created_by) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM import_previews WHERE id=? AND applied=0) AND EXISTS(SELECT 1 FROM worlds WHERE id=? AND ws_id=? AND owner_id=?)'
          )
          .bind(
            item.id,
            actor.wsId,
            preview.world_id,
            item.path,
            actor.id,
            id,
            preview.world_id,
            actor.wsId,
            actor.id
          )
      ),
      db
        .prepare(
          `INSERT INTO entries(id,ws_id,world_id,draft) SELECT json_extract(entry.value,'$.id'),p.ws_id,p.world_id,json_extract(entry.value,'$.draft') FROM import_previews p,json_each(p.plan,'$.entries') entry WHERE p.id=? AND p.ws_id=? AND p.actor_id=? AND p.applied=0 AND EXISTS(SELECT 1 FROM worlds w WHERE w.id=p.world_id AND w.owner_id=p.actor_id AND w.ws_id=p.ws_id)`
        )
        .bind(id, actor.wsId, actor.id),
      db
        .prepare(
          `INSERT INTO creator_blacklist(id,ws_id,owner_id,display_name,reason,reference_url,source_id) SELECT json_extract(item.value,'$.id'),p.ws_id,p.actor_id,json_extract(item.value,'$.displayName'),json_extract(item.value,'$.reason'),json_extract(item.value,'$.referenceUrl'),json_extract(item.value,'$.sourceId') FROM import_previews p,json_each(p.plan,'$.blacklist') item WHERE p.id=? AND p.ws_id=? AND p.actor_id=? AND p.applied=0 AND EXISTS(SELECT 1 FROM worlds w WHERE w.id=p.world_id AND w.owner_id=p.actor_id AND w.ws_id=p.ws_id) ON CONFLICT(ws_id,owner_id,source_id) WHERE source_id IS NOT NULL DO NOTHING`
        )
        .bind(id, actor.wsId, actor.id),
      db
        .prepare(
          'UPDATE import_previews SET applied=1 WHERE id=? AND ws_id=? AND actor_id=? AND EXISTS(SELECT 1 FROM worlds w WHERE w.id=world_id AND w.ws_id=import_previews.ws_id AND w.owner_id=actor_id)'
        )
        .bind(id, actor.wsId, actor.id),
    ]);
    committed = true;
    const applied = await db
      .prepare(
        'SELECT applied FROM import_previews WHERE id=? AND ws_id=? AND actor_id=?'
      )
      .bind(id, actor.wsId, actor.id)
      .first<{ applied: number }>();
    if (!applied?.applied) throw new LettinError(403);
    if (prepared?.media.length) {
      const persisted = await db
        .prepare('SELECT id FROM media WHERE world_id=?')
        .bind(preview.world_id)
        .all<{ id: string }>();
      const ids = new Set(persisted.results.map((row) => row.id));
      if (prepared.media.some((item) => !ids.has(item.id)))
        await prepared.cleanup();
    }
    return { id: preview.world_id };
  } catch (error) {
    if (!committed) await prepared?.cleanup();
    throw error;
  }
}
