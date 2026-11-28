import { createHmac } from 'node:crypto';
import type { MeetAccountAlias } from './room-viewer-identity';

/**
 * The id a viewer outside the workspace sees for someone else's account: an
 * HMAC of the account id with the realtime secret, scoped to the room. It is
 * stable within one room, so two devices of one account still group together,
 * and it differs between rooms, so it never links a person across meetings.
 * It keeps the UUID shape that presence and chat schemas require.
 */
export function meetRoomAccountAlias(
  secret: string,
  roomId: string,
  accountId: string
) {
  if (!secret.trim()) throw new Error('Room account aliases require a secret');
  const bytes = createHmac('sha256', secret.trim())
    .update(`meet-room-account:${roomId}:${accountId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Reads the secret when first needed, so a Durable Object can build its socket
 * delivery before its environment is assigned. No secret means no alias, and
 * account ids are then omitted for outside viewers.
 */
export function createMeetRoomAccountAlias(
  secret: () => string | undefined
): MeetAccountAlias {
  const cache = new Map<string, string>();
  return (roomId, accountId) => {
    const current = secret()?.trim();
    if (!current) return undefined;
    const key = `${roomId}\n${accountId}`;
    let alias = cache.get(key);
    if (alias === undefined) {
      alias = meetRoomAccountAlias(current, roomId, accountId);
      // A room holds at most a few hundred accounts; bound the cache anyway.
      if (cache.size >= 4096) cache.clear();
      cache.set(key, alias);
    }
    return alias;
  };
}
