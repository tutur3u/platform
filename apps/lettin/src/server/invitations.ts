import type { LettinCommand } from '@tuturuuu/internal-api/lettin';
import { type Actor, LettinError, type Store } from './context';

type InvitationCommand = Extract<
  LettinCommand,
  { action: 'invite' | 'acceptInvitation' | 'revokeInvitation' | 'setCreator' }
>;
export async function mutateInvitation(
  db: Store,
  actor: Actor,
  command: InvitationCommand
) {
  if (command.action === 'acceptInvitation') {
    const email = await actor.verifiedEmail();
    if (!email) throw new LettinError(403, 'Invalid invitation');
    const now = new Date().toISOString();
    // Both statements run atomically. An invitation is single-use and can never
    // re-enable a revoked creator or confer the ability to invite others.
    const result = await db.batch([
      db
        .prepare(`INSERT INTO creators(user_id,granted_by) SELECT ?,invited_by FROM invitations
        WHERE id=? AND email=? AND accepted_by IS NULL AND revoked=0 AND expires_at>?
        ON CONFLICT(user_id) DO NOTHING`)
        .bind(actor.id, command.invitationId, email, now),
      db
        .prepare(
          `UPDATE invitations SET accepted_by=? WHERE id=? AND email=? AND accepted_by IS NULL AND revoked=0 AND expires_at>? RETURNING id`
        )
        .bind(actor.id, command.invitationId, email, now),
    ]);
    if (!result[1]?.results.length)
      throw new LettinError(403, 'Invalid invitation');
    return { id: actor.id };
  }
  if (command.action === 'setCreator') {
    if (!actor.isAdmin) throw new LettinError(403);
    const result = await db
      .prepare(
        'UPDATE creators SET can_invite=?,enabled=? WHERE user_id=? RETURNING user_id'
      )
      .bind(Number(command.canInvite), Number(command.enabled), command.userId)
      .first();
    if (!result) throw new LettinError(404);
    return { id: command.userId };
  }
  const allowed = `(?=1 OR EXISTS(SELECT 1 FROM creators WHERE user_id=? AND enabled=1 AND can_invite=1))`;
  if (command.action === 'invite') {
    const id = crypto.randomUUID();
    const result = await db
      .prepare(
        `INSERT INTO invitations(id,email,invited_by,expires_at) SELECT ?,?,?,? WHERE ${allowed} RETURNING id`
      )
      .bind(
        id,
        command.email.trim().toLowerCase(),
        actor.id,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        Number(actor.isAdmin),
        actor.id
      )
      .first();
    if (!result) throw new LettinError(403);
    return { id };
  }
  const result = await db
    .prepare(
      `UPDATE invitations SET revoked=1 WHERE id=? AND (?=1 OR invited_by=?) RETURNING id`
    )
    .bind(command.invitationId, Number(actor.isAdmin), actor.id)
    .first();
  if (!result) throw new LettinError(403);
  return { id: command.invitationId };
}
