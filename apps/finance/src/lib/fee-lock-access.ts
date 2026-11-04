import { verifySecret } from '@tuturuuu/utils/workspace-helper';

// Interim copy of the PR-01 flag helper (design §2.0); replace with the shared
// export once that lands. Root-admin secret, fails closed on lookup errors.
export const FEE_LOCK_SECRET = 'ENABLE_FEE_LOCK';

export function isFeeLockEnabled(wsId: string) {
  return verifySecret({
    wsId,
    forceAdmin: true,
    name: FEE_LOCK_SECRET,
    value: 'true',
  });
}
