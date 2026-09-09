import { settleLiveBilling } from './billing';
import type { SavedSession } from './session-state';
import type { LiveEnvironment } from './storage';
import { reportLiveUsage } from './usage-report';

/** Keep unsettled reservations durable until both quota and meeting accounting acknowledge them. */
export async function finalizeSessionBilling(
  env: LiveEnvironment,
  saved: SavedSession,
  persist: () => Promise<void>,
  retry: () => Promise<void>
) {
  for (const [id, billing] of Object.entries(saved.publicBillings ?? {})) {
    try {
      const final = await settleLiveBilling(env, saved.claims, billing, true);
      saved.publicBillings![id] = final;
      await persist();
      await reportLiveUsage(env, saved.claims, saved.identity, final);
      delete saved.publicBillings![id];
    } catch {
      await retry();
    }
  }
  if (saved.billing && !saved.billingFinalized) {
    try {
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
