/**
 * A reply that is waiting for the owner to verify a second factor, kept for
 * the trip through the central sign-in and back. The sign-in is a full page
 * navigation, which empties the composer; what is kept here lets the reply
 * go out afterwards as the same reply, under the same idempotency key.
 *
 * It lives in this tab's session storage, holds one reply, is handed back
 * once, only to the owner who wrote it and only for the thread it was
 * written for, and is ignored after fifteen minutes. What comes back is sent
 * as the signed-in owner's reply, so an entry written under another account
 * is dropped, never resumed.
 */
import type { ReplyTarget } from './thread-reply';

export type PendingReply = { key: string; text: string };

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_KEY = 'mastermind.reply.pending.v1';
const MAX_AGE_MS = 15 * 60 * 1000;
const MAX_TEXT_CHARS = 4000;
const REPLY_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const validOwner = (owner: unknown): owner is string =>
  typeof owner === 'string' && owner.length > 0 && owner.length <= 320;

const sameTarget = (stored: Partial<ReplyTarget>, target: ReplyTarget) =>
  stored.machineId === target.machineId &&
  stored.threadId === target.threadId &&
  (stored.environmentId ?? null) === (target.environmentId ?? null);

function tabStorage(): KeyValueStorage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Where "verify again" sends the owner: the sign-in that asks for the second
 * factor anew and returns to `nextPath`.
 */
export function replyStepUpHref(nextPath: string) {
  return `/login?${new URLSearchParams({ mfa: 'fresh', nextUrl: nextPath })}`;
}

/**
 * Keeps the reply for the return from the sign-in. `owner` is any stable
 * identifier of the signed-in owner. False when it could not be kept.
 */
export function savePendingReply(
  owner: string,
  target: ReplyTarget,
  reply: PendingReply,
  options: { storage?: KeyValueStorage | null; now?: () => number } = {}
) {
  const storage = options.storage ?? tabStorage();
  if (
    !storage ||
    !validOwner(owner) ||
    !REPLY_KEY.test(reply.key) ||
    !reply.text.trim() ||
    reply.text.length > MAX_TEXT_CHARS
  )
    return false;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        owner,
        machineId: target.machineId,
        ...(target.environmentId
          ? { environmentId: target.environmentId }
          : {}),
        threadId: target.threadId,
        key: reply.key,
        text: reply.text,
        savedAt: (options.now ?? Date.now)(),
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The reply this owner kept for this thread, removed as it is read. Null
 * when there is none, when it was kept for another thread (it stays for that
 * one), or when it is another owner's, too old or not in shape (it is
 * dropped).
 */
export function takePendingReply(
  owner: string,
  target: ReplyTarget,
  options: { storage?: KeyValueStorage | null; now?: () => number } = {}
): PendingReply | null {
  const storage = options.storage ?? tabStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    let stored: Partial<
      ReplyTarget & PendingReply & { owner: string; savedAt: number }
    > = {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') stored = parsed;
    } catch {
      // Not ours: dropped below.
    }
    const age = (options.now ?? Date.now)() - Number(stored.savedAt);
    const usable =
      validOwner(owner) &&
      stored.owner === owner &&
      typeof stored.key === 'string' &&
      REPLY_KEY.test(stored.key) &&
      typeof stored.text === 'string' &&
      stored.text.trim().length > 0 &&
      stored.text.length <= MAX_TEXT_CHARS &&
      age >= 0 &&
      age <= MAX_AGE_MS;
    if (usable && !sameTarget(stored, target)) return null;
    storage.removeItem(STORAGE_KEY);
    return usable
      ? { key: stored.key as string, text: stored.text as string }
      : null;
  } catch {
    return null;
  }
}
