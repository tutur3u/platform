import type { Actor, Store } from './store';

export function cancelOwnerWork(
  store: Store,
  actor: Actor,
  ownerKey: string,
  now: number,
  scope: {
    userId?: string;
    channelId?: string;
    disableWatchers?: boolean;
  }
) {
  const followups = store.run(
    `UPDATE followups SET state='cancelled',terminal_code='authorization_lost',
    next_at=NULL,attempt_deadline=NULL,updated_at=? WHERE owner_key=? AND state IN ('pending','queued')
    AND (? IS NULL OR owner_user_id=?) AND (? IS NULL OR channel_id=?)`,
    now,
    ownerKey,
    scope.userId ?? null,
    scope.userId ?? null,
    scope.channelId ?? null,
    scope.channelId ?? null
  ).rowsWritten;
  const watchers = scope.disableWatchers
    ? store.run(
        `
    UPDATE watchers SET disabled_at=? WHERE owner_key=? AND owner_user_id=? AND disabled_at IS NULL`,
        now,
        ownerKey,
        scope.userId ?? null
      ).rowsWritten
    : 0;
  if (followups || watchers)
    store.audit(
      actor,
      'authorization.work_cancelled',
      ownerKey,
      scope.channelId ?? null,
      null,
      { followups, watchers }
    );
}

export function removeDelegation(
  store: Store,
  actor: Actor,
  agentKey: string,
  userId: string,
  now: number,
  action: string,
  requestId: string | null = null
) {
  const before = store.one(
    'DELETE FROM delegations WHERE agent_key=? AND user_id=? RETURNING expires_at AS expiresAt',
    agentKey,
    userId
  );
  if (before) {
    store.audit(
      actor,
      action,
      `${agentKey}:${userId}`,
      null,
      before,
      null,
      requestId
    );
    cancelOwnerWork(store, actor, `agent:${agentKey}`, now, {
      userId,
      disableWatchers: true,
    });
  }
  return !!before;
}
