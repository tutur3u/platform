import { createHmac } from 'node:crypto';

/**
 * The id one person carries on one board: an HMAC of their user id with the
 * realtime secret, scoped to the board. Presence, cursors and edits name
 * people by it, so no platform user id reaches anyone else on the board, and
 * the Meet API and the board room derive the same id independently.
 */
export function boardActorId(secret: string, boardId: string, userId: string) {
  if (!secret.trim()) throw new Error('Board actor ids require a secret');
  return createHmac('sha256', secret.trim())
    .update(`board-actor:${boardId}:${userId}`)
    .digest('base64url')
    .slice(0, 22);
}
