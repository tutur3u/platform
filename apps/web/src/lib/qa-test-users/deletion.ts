import type { QaActor, QaStore } from './store';

export type QaDeleteOutcome = 'deleted' | 'not_found' | 'busy' | 'pending';

export interface QaDeletionDeps {
  store: QaStore;
  /** Deletes a non-personal workspace row. Throws when the delete failed. */
  deleteWorkspace: (wsId: string) => Promise<void>;
  /** Deletes the Auth account; 'unknown' when the outcome cannot be confirmed. */
  deleteAuthUser: (
    userId: string
  ) => Promise<'deleted' | 'present' | 'unknown'>;
}

/**
 * Deletes one QA test account. The ledger refuses accounts without the QA
 * marker before anything is removed, and settles only after Auth confirms the
 * account is gone. Any other outcome stays leased as 'deleting' so the next
 * cleanup re-verifies it instead of replaying a delete blindly.
 */
export async function deleteQaUser(
  deps: QaDeletionDeps,
  userId: string,
  actor: QaActor,
  actorUserId: string | null
): Promise<QaDeleteOutcome> {
  const begun = await deps.store.beginDelete(userId, actor, actorUserId);
  if (begun.state !== 'deleting') return begun.state;

  try {
    if (begun.runWorkspaceId && begun.runId) {
      await deps.deleteWorkspace(begun.runWorkspaceId);
      await deps.store.finishWorkspaceDelete(begun.runId, actor, actorUserId);
    }
    if (begun.authPresent && (await deps.deleteAuthUser(userId)) !== 'deleted')
      return 'pending';
    const finished = await deps.store.finishDelete(userId, actor, actorUserId);
    return finished.state === 'deleted' ? 'deleted' : 'pending';
  } catch (error) {
    console.error('QA test account deletion incomplete', {
      errorType: error instanceof Error ? error.name : 'unknown',
      userId,
    });
    return 'pending';
  }
}

export interface QaCleanupResult {
  fenced: boolean;
  deleted: string[];
  pending: string[];
  skipped: string[];
}

/**
 * Deletes the given accounts with bounded concurrency, stopping before the
 * deadline. Accounts not reached are reported as skipped for the next pass.
 */
export async function deleteQaUsers(
  deps: QaDeletionDeps,
  userIds: readonly string[],
  actor: QaActor,
  actorUserId: string | null,
  { concurrency = 4, deadline }: { concurrency?: number; deadline: number }
): Promise<QaCleanupResult> {
  const result: QaCleanupResult = {
    fenced: false,
    deleted: [],
    pending: [],
    skipped: [],
  };
  let next = 0;
  async function worker() {
    while (next < userIds.length) {
      const userId = userIds[next++]!;
      if (Date.now() >= deadline) {
        result.skipped.push(userId);
        continue;
      }
      const outcome = await deleteQaUser(deps, userId, actor, actorUserId);
      if (outcome === 'deleted' || outcome === 'not_found')
        result.deleted.push(userId);
      else if (outcome === 'busy') result.skipped.push(userId);
      else result.pending.push(userId);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, userIds.length) }, worker)
  );
  return result;
}
