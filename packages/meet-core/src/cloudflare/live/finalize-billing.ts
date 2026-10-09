import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { settleLiveBilling } from './billing';
import { eraseEndedLiveContext } from './erase-context';
import { liveRoomCommand } from './room';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';
import { reportLiveUsage } from './usage-report';

function completed(saved: SavedSession | undefined): saved is SavedSession {
  if (
    saved?.ended !== true ||
    saved.contextErased !== true ||
    saved.pendingUsage ||
    (saved.billing &&
      (saved.billingFinalized !== true ||
        saved.billing.settlementComplete !== true ||
        saved.billing.pendingSettlement ||
        saved.billing.pendingShareFinish))
  )
    return false;
  // Stop at the first entry; do not allocate or scan a full billing map.
  for (const _id in saved.publicBillings ?? {}) return false;
  return true;
}

/** Keep unsettled reservations durable until both quota and meeting accounting acknowledge them. */
export async function finalizeSessionBilling(
  env: LiveEnvironment,
  saved: SavedSession,
  persist: () => Promise<void>,
  retry: () => Promise<void>,
  storage: DurableObjectStorage
) {
  if (completed(saved)) {
    // In-memory flags can precede a failed final write. Confirm the durable
    // receipt, then recheck after the await so new obligations cannot be skipped.
    const durable = await storage.get<SavedSession>('session');
    if (
      completed(durable) &&
      completed(saved) &&
      typeof saved.claims?.sessionId === 'string' &&
      typeof saved.claims.ownerId === 'string' &&
      durable.claims?.sessionId === saved.claims.sessionId &&
      durable.claims?.ownerId === saved.claims.ownerId
    )
      return;
  }
  try {
    await eraseEndedLiveContext(storage, saved, retry);
  } catch {
    await retry();
  }
  await settlePublicBillings(env, saved, persist, retry, true);
  if (saved.billing && !saved.billingFinalized) {
    try {
      if (!saved.billing.settlementComplete)
        saved.billing = await settleLiveBilling(
          env,
          saved.claims,
          saved.billing,
          true
        );
      await persist();
      await reportLiveUsage(env, saved.claims, saved.identity, saved.billing);
      saved.billingFinalized = true;
    } catch {
      await retry();
    }
  }
  await persist();
}

export async function settlePublicBillings(
  env: LiveEnvironment,
  saved: SavedSession,
  persist: () => Promise<void>,
  retry: () => Promise<void>,
  all = false
) {
  for (const [id, billing] of Object.entries(saved.publicBillings ?? {})) {
    if (!all && !billing.pendingSettlement) continue;
    try {
      const final = billing.settlementComplete
        ? billing
        : await settleLiveBilling(env, saved.claims, billing, true);
      saved.publicBillings![id] = final;
      await persist();
      if (final.pendingShareFinish) {
        await liveRoomCommand(env, saved.claims, saved.identity, {
          action: 'live.share.finish',
          id: final.pendingShareFinish,
        });
        final.pendingShareFinish = undefined;
        await persist();
      }
      await reportLiveUsage(env, saved.claims, saved.identity, final);
      delete saved.publicBillings![id];
    } catch {
      await retry();
    }
  }
  await persist();
}
