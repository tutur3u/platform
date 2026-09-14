import type { LettinCommand } from '@tuturuuu/internal-api/lettin';
import {
  type Actor,
  isCreator,
  LettinError,
  type Store,
  worldRole,
  writeAccess,
} from './context';
import { mutateInvitation } from './invitations';

export async function mutate(
  db: Store,
  actor: Actor,
  command: LettinCommand
): Promise<{ id: string }> {
  if (
    command.action === 'invite' ||
    command.action === 'acceptInvitation' ||
    command.action === 'revokeInvitation' ||
    command.action === 'setCreator'
  )
    return mutateInvitation(db, actor, command);
  if (!actor.canManage || !(await isCreator(db, actor)))
    throw new LettinError(403);
  if (command.action === 'createWorld') {
    const id = crypto.randomUUID();
    const result = await db
      .prepare(
        `INSERT INTO worlds(id,ws_id,owner_id,draft) SELECT ?,?,?,? WHERE ?=1 OR EXISTS(SELECT 1 FROM creators WHERE user_id=? AND enabled=1) RETURNING id`
      )
      .bind(
        id,
        actor.wsId,
        actor.id,
        JSON.stringify(command.draft),
        Number(actor.isAdmin),
        actor.id
      )
      .first();
    if (!result) throw new LettinError(403);
    return { id };
  }
  const role = await worldRole(db, actor, command.worldId);
  if (
    command.action === 'setCollaborator' ||
    command.action === 'removeCollaborator'
  ) {
    if (role !== 'owner') throw new LettinError(403);
    if (command.action === 'setCollaborator') {
      if (
        command.userId === actor.id ||
        !(await actor.eligibleMember(command.userId))
      )
        throw new LettinError(403);
      const access = writeAccess(actor, command.worldId);
      const result = await db
        .prepare(`INSERT INTO collaborators(ws_id,world_id,user_id,role)
        SELECT ?,?,?,? WHERE ${access.sql} AND EXISTS(SELECT 1 FROM creators WHERE user_id=? AND enabled=1)
        ON CONFLICT(world_id,user_id) DO UPDATE SET role=excluded.role RETURNING user_id`)
        .bind(
          actor.wsId,
          command.worldId,
          command.userId,
          command.role,
          ...access.values,
          command.userId
        )
        .first();
      if (!result) throw new LettinError(403);
    } else {
      const access = writeAccess(actor, command.worldId);
      await db
        .prepare(
          `DELETE FROM collaborators WHERE ws_id=? AND world_id=? AND user_id=? AND ${access.sql}`
        )
        .bind(actor.wsId, command.worldId, command.userId, ...access.values)
        .run();
    }
    return { id: command.userId };
  }
  const publishing = [
    'publishWorld',
    'unpublishWorld',
    'publishEntry',
    'unpublishEntry',
  ].includes(command.action);
  if (publishing && role === 'editor') throw new LettinError(403);
  const access = writeAccess(actor, command.worldId, publishing);
  if (command.action === 'createEntry') {
    const id = crypto.randomUUID();
    const result = await db
      .prepare(
        `INSERT INTO entries(id,ws_id,world_id,draft) SELECT ?,?,?,? WHERE ${access.sql} RETURNING id`
      )
      .bind(
        id,
        actor.wsId,
        command.worldId,
        JSON.stringify(command.draft),
        ...access.values
      )
      .first();
    if (!result) throw new LettinError(403);
    return { id };
  }
  const isEntry = 'entryId' in command;
  const table = isEntry ? 'entries' : 'worlds';
  const id = isEntry ? command.entryId : command.worldId;
  const saving =
    command.action === 'saveEntry' || command.action === 'saveWorld';
  const publish =
    command.action === 'publishEntry' || command.action === 'publishWorld';
  const now = new Date().toISOString();
  const assignments = saving
    ? 'draft=?'
    : `published=${publish ? 'draft' : 'NULL'},published_at=?`;
  const value = saving ? JSON.stringify(command.draft) : publish ? now : null;
  // Reject cross-world link IDs inside the same atomic write as the revision check.
  const links = saving ? command.draft.links : [];
  const validLinks = `NOT EXISTS(SELECT 1 FROM json_each(?) link WHERE NOT EXISTS(SELECT 1 FROM entries e WHERE e.id=link.value AND e.ws_id=? AND e.world_id=?))`;
  const result = await db
    .prepare(`UPDATE ${table} SET ${assignments},version=version+1,updated_at=?
    WHERE id=? AND ws_id=? ${isEntry ? 'AND world_id=?' : ''} AND version=? AND ${access.sql} AND ${validLinks} RETURNING id`)
    .bind(
      value,
      now,
      id,
      actor.wsId,
      ...(isEntry ? [command.worldId] : []),
      command.version,
      ...access.values,
      JSON.stringify(links),
      actor.wsId,
      command.worldId
    )
    .first();
  if (!result) {
    await worldRole(db, actor, command.worldId);
    throw new LettinError(409, 'Revision conflict');
  }
  return { id };
}
