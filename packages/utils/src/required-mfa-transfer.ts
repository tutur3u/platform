import {
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from './app-coordination-token';
import type { MfaSessionProof } from './required-mfa-policy';

const TRANSFER_SCOPE = 'mfa:transfer';
/** session_data is caller writable. Carry only an independently signed, short
 * lived proof bound to the handoff identity and target app. */
export function createMfaTransfer(
  userId: string,
  targetApp: string,
  mfa: MfaSessionProof | null
) {
  return mfa
    ? createAppCoordinationToken({
        userId,
        targetApp,
        mfa,
        scopes: [TRANSFER_SCOPE],
        expiresInSeconds: 300,
      }).token
    : undefined;
}

export function readMfaTransfer(
  value: unknown,
  userId: string,
  targetApp: string
): MfaSessionProof | null {
  if (typeof value !== 'string') return null;
  const verified = verifyAppCoordinationToken(value);
  if (
    !verified.ok ||
    verified.claims.sub !== userId ||
    verified.claims.target_app !== targetApp ||
    !verified.claims.scopes.includes(TRANSFER_SCOPE)
  )
    return null;
  return verified.claims.mfa ?? null;
}
