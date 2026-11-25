import type { MeetRealtimeTokenPayload } from './primitives';
import {
  authorizeMiraSharePrivateRead,
  MIRA_SHARE_CONTEXT_TTL_MS,
  type MiraShareStoredContext,
  miraShareContextKey,
} from './room-mira-share';
import type { RoomServiceState } from './room-service';

/** The parts of Durable Object storage the shared tutor chat uses. */
export type MiraShareKeyStorage = {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<unknown>;
  delete(keys: string[]): Promise<unknown>;
};

/**
 * Keeps each person's shared tutor chat under its own storage key, so the
 * room snapshot carries only small metadata and a busy room never rewrites
 * everyone's chat. Every snapshot write flushes queued text and deletes the
 * keys the snapshot no longer references: a revoke, an expiry, a changed
 * Private Mira choice, an eviction, an erasure, and meeting end or restore.
 */
export class MiraShareStorage {
  private readonly stored = new Set<string>();
  private readonly storage: () => MiraShareKeyStorage;

  constructor(storage: () => MiraShareKeyStorage) {
    this.storage = storage;
  }

  /** Accounts whose text may already be stored, from the loaded snapshot. */
  seed(snapshot: RoomServiceState) {
    for (const [account, grant] of Object.entries(snapshot.miraShares ?? {}))
      if (grant.context) this.stored.add(account);
  }

  /**
   * Issues the storage writes in the same output-gated batch as the snapshot
   * write that follows, and returns the snapshot without the queued text.
   */
  flush(snapshot: RoomServiceState): RoomServiceState {
    const storage = this.storage();
    const shares = snapshot.miraShares ?? {};
    const logFailure = () =>
      console.error('Meet shared tutor chat storage write failed');
    for (const [account, text] of Object.entries(
      snapshot.miraSharePending ?? {}
    )) {
      // Text evicted or revoked before this write never reaches storage.
      if (shares[account]?.context?.updatedAt !== text.updatedAt) continue;
      storage.put(miraShareContextKey(account), text).catch(logFailure);
      this.stored.add(account);
    }
    const stale = [...this.stored].filter(
      (account) => !shares[account]?.context
    );
    if (stale.length) {
      for (const account of stale) this.stored.delete(account);
      storage.delete(stale.map(miraShareContextKey)).catch(logFailure);
    }
    if (!snapshot.miraSharePending) return snapshot;
    const { miraSharePending: _flushed, ...rest } = snapshot;
    return rest;
  }
}

/**
 * Serves a Private Mira read of shared tutor chat from its storage key. The
 * stored text counts only while it matches the grant revision and share time
 * the snapshot holds, so a revoke or newer share is never answered with
 * older text. `sharedAt` is when the grant was turned on, so the caller can
 * refuse a grant older than the owner's latest Mira confirmation.
 */
export async function readSharedTutorChat(
  storage: Pick<MiraShareKeyStorage, 'get'>,
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  body: unknown,
  now = Date.now()
): Promise<{ status?: number; body: unknown } | undefined> {
  if (
    !body ||
    typeof body !== 'object' ||
    (body as { action?: unknown }).action !== 'mira.share.private.read'
  )
    return;
  const read = authorizeMiraSharePrivateRead(snapshot, token, body, now);
  if ('status' in read) return { status: read.status, body: read.body };
  const context = read.grant.context;
  const text =
    context && context.updatedAt + MIRA_SHARE_CONTEXT_TTL_MS > now
      ? await storage.get<MiraShareStoredContext>(
          miraShareContextKey(read.account)
        )
      : undefined;
  const current =
    !!text &&
    text.revision === read.grant.revision &&
    text.updatedAt === context?.updatedAt;
  return {
    body: {
      tutor: current ? text.tutor : [],
      sharedAt: read.grant.updatedAt,
    },
  };
}
