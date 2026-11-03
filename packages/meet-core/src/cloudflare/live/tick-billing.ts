import type { LiveAssistantEvent } from '../../features/live-assistant/contracts';
import { beginLiveBilling, settleLiveBilling } from './billing';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';
import { reportLiveUsage } from './usage-report';

/**
 * Periodic usage settlement and renewal for a running session. Returns 'closed'
 * when the quota ended the session and the caller must stop it.
 */
export async function settleTickBilling(
  env: LiveEnvironment,
  saved: SavedSession,
  persist: () => Promise<unknown>,
  emit: (event: LiveAssistantEvent) => void
): Promise<'closed' | 'open'> {
  if (!saved.billing) return 'open';
  const result = await settleLiveBilling(
    env,
    saved.claims,
    saved.billing,
    false
  );
  saved.billing = result;
  await persist();
  await reportLiveUsage(env, saved.claims, saved.identity, result);
  emit({
    type: 'usage',
    costUsd: result.costUsd,
    incomplete: result.incomplete,
  });
  if (result.closed || result.exhausted) return 'closed';
  if (result.renew) {
    saved.billing = await settleLiveBilling(env, saved.claims, result, true);
    await persist();
    await reportLiveUsage(env, saved.claims, saved.identity, saved.billing);
    saved.billingFinalized = true;
    await persist();
    saved.billing = await beginLiveBilling(
      env,
      saved.claims,
      saved.billing.costUsd,
      saved.identity.workspaceId
    );
    saved.coverageGap = false;
    saved.billingFinalized = false;
    await persist();
    await reportLiveUsage(env, saved.claims, saved.identity, saved.billing);
  }
  return 'open';
}
