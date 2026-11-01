import {
  type AppCoordinationTokenClaims,
  createAppCoordinationToken,
  verifyAppCoordinationToken,
} from './app-coordination-token';
import type { SessionAssurance } from './session-assurance';

const TRANSFER_SCOPE = 'assurance:transfer';

/** session_data is caller writable. Carry only an independently signed, short
 * lived assurance bound to the handoff identity and target app. */
export function createSessionAssuranceTransfer(
  userId: string,
  targetApp: string,
  assurance: SessionAssurance | null
) {
  return assurance
    ? createAppCoordinationToken({
        aal: assurance.aal,
        amr: assurance.amr,
        expiresInSeconds: 300,
        scopes: [TRANSFER_SCOPE],
        targetApp,
        userId,
      }).token
    : undefined;
}

/** Assurance recorded in a verified app-coordination token, if any. */
export function sessionAssuranceFromAppCoordinationClaims(
  claims: Pick<AppCoordinationTokenClaims, 'aal' | 'amr'>
): SessionAssurance | null {
  if (!claims.aal) return null;
  return claims.amr?.length
    ? { aal: claims.aal, amr: claims.amr }
    : { aal: claims.aal };
}

export function readSessionAssuranceTransfer(
  value: unknown,
  userId: string,
  targetApp: string
): SessionAssurance | null {
  if (typeof value !== 'string') return null;
  const verified = verifyAppCoordinationToken(value);
  if (
    !verified.ok ||
    verified.claims.sub !== userId ||
    verified.claims.target_app !== targetApp ||
    !verified.claims.scopes.includes(TRANSFER_SCOPE)
  )
    return null;
  return sessionAssuranceFromAppCoordinationClaims(verified.claims);
}
