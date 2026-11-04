import { verifySecret } from '@tuturuuu/utils/workspace-helper';

// Interim copy of the PR-01 flag helper (design §2.0); replace with the shared
// export once that lands. Root-admin secret, fails closed on lookup errors so
// a flag failure hides fee lock instead of failing the whole finance layout.
export const FEE_LOCK_SECRET = 'ENABLE_FEE_LOCK';

export async function isFeeLockEnabled(wsId: string) {
  try {
    return await verifySecret({
      wsId,
      forceAdmin: true,
      name: FEE_LOCK_SECRET,
      value: 'true',
    });
  } catch (error) {
    console.error('[fee-lock] flag lookup failed; treating as off', error);
    return false;
  }
}
