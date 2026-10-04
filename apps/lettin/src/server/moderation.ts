import { z } from 'zod';
import { type Actor, isCreator, LettinError, type Store } from './context';
import { safeImage } from './rich-text-schema';
export const blacklistItemSchema = z.object({
  displayName: z.string().trim().min(1).max(160),
  reason: z.string().max(4000),
  referenceUrl: z.union([
    z.literal(''),
    z
      .url()
      .max(2000)
      .refine((url) => url.startsWith('https://') && safeImage(url)),
  ]),
});
export const moderationCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    id: z.guid().optional(),
    draft: blacklistItemSchema,
  }),
  z.object({ action: z.literal('remove'), id: z.guid() }),
]);
export async function requireModerationAccess(db: Store, actor: Actor) {
  if (!actor.canManage || !(await isCreator(db, actor)))
    throw new LettinError(403);
}
export async function readBlacklist(db: Store, actor: Actor) {
  await requireModerationAccess(db, actor);
  return (
    await db
      .prepare(
        'SELECT id,display_name AS displayName,reason,reference_url AS referenceUrl,source_id AS sourceId FROM creator_blacklist WHERE ws_id=? AND owner_id=? ORDER BY created_at DESC,id LIMIT 1000'
      )
      .bind(actor.wsId, actor.id)
      .all()
  ).results;
}
export async function mutateBlacklist(
  db: Store,
  actor: Actor,
  command: z.infer<typeof moderationCommandSchema>
) {
  await requireModerationAccess(db, actor);
  const access =
    '(?=1 OR EXISTS(SELECT 1 FROM creators WHERE user_id=? AND enabled=1))';
  const id = command.id ?? crypto.randomUUID();
  let row: { id: string } | null = null;
  if (command.action === 'remove')
    row = await db
      .prepare(
        `DELETE FROM creator_blacklist WHERE id=? AND ws_id=? AND owner_id=? AND ${access} RETURNING id`
      )
      .bind(id, actor.wsId, actor.id, Number(actor.isAdmin), actor.id)
      .first<{ id: string }>();
  else if (command.id)
    row = await db
      .prepare(
        `UPDATE creator_blacklist SET display_name=?,reason=?,reference_url=?,updated_at=? WHERE id=? AND ws_id=? AND owner_id=? AND ${access} RETURNING id`
      )
      .bind(
        command.draft.displayName,
        command.draft.reason,
        command.draft.referenceUrl,
        new Date().toISOString(),
        id,
        actor.wsId,
        actor.id,
        Number(actor.isAdmin),
        actor.id
      )
      .first<{ id: string }>();
  else
    row = await db
      .prepare(
        `INSERT INTO creator_blacklist(id,ws_id,owner_id,display_name,reason,reference_url) SELECT ?,?,?,?,?,? WHERE ${access} RETURNING id`
      )
      .bind(
        id,
        actor.wsId,
        actor.id,
        command.draft.displayName,
        command.draft.reason,
        command.draft.referenceUrl,
        Number(actor.isAdmin),
        actor.id
      )
      .first<{ id: string }>();
  if (!row) throw new LettinError(404);
  return { id };
}
