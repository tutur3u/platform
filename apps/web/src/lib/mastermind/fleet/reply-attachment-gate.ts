import 'server-only';

import {
  type MastermindBridge,
  MastermindBridgeError,
} from '@tuturuuu/utils/mastermind-store/bridge-client';
import type { MfaSessionProof } from '@tuturuuu/utils/required-mfa-policy';
import { type NextRequest, NextResponse } from 'next/server';
import { isFleetOwner } from './auth';
import {
  bridgeFailure,
  type FleetAssurancePrincipal,
  fleetBridge,
  fleetSecret,
  replyAssurance,
  replyMfaMaxAgeSeconds,
} from './bridge';
import { FLEET_NO_STORE, fleetError } from './http';
import {
  attachmentCredential,
  replyAttachmentsEnabled,
} from './reply-attachments';

export type AttachmentGate =
  | {
      ok: true;
      bridge: MastermindBridge;
      secret: string;
      proof: MfaSessionProof;
      /** Keyed digest of the session; every step must present the same one. */
      credential: string;
    }
  | { ok: false; response: NextResponse };

/**
 * The checks every attachment step shares: the flag, the owner, the
 * platform's account second-factor policy and a recent proof of this very
 * session (the same window a reply needs), the bridge and the fleet secret.
 */
export async function attachmentGate(
  request: Pick<NextRequest, 'headers' | 'url'>,
  principal: FleetAssurancePrincipal & { user: { id: string } }
): Promise<AttachmentGate> {
  const refuse = (response: NextResponse) => ({ ok: false, response }) as const;
  if (!replyAttachmentsEnabled()) return refuse(fleetError('not_found', 404));
  if (!(await isFleetOwner(principal.user)))
    return refuse(fleetError('forbidden', 403));
  const maxAgeSeconds = replyMfaMaxAgeSeconds();
  const assurance = await replyAssurance(request, principal, maxAgeSeconds);
  if (assurance.status === 'unavailable')
    return refuse(fleetError('unavailable', 503));
  if (assurance.status !== 'allowed')
    return refuse(
      NextResponse.json(
        { error: 'mfa_required', maxAgeSeconds },
        { status: 401, headers: FLEET_NO_STORE }
      )
    );
  const bridge = fleetBridge();
  const secret = fleetSecret(process.env);
  if (!bridge || !secret) return refuse(fleetError('unavailable', 503));
  return {
    ok: true,
    bridge,
    secret,
    proof: assurance.proof,
    credential: attachmentCredential(secret, assurance.proof.sessionId),
  };
}

/** Closed-set refusal for a failed attachment call to the bridge. */
export function attachmentBridgeFailure(error: unknown) {
  const code = error instanceof MastermindBridgeError ? error.code : 'unknown';
  if (code === 'unsupported') return fleetError('attachments_unsupported', 409);
  if (code === 'offline') return fleetError('machine_offline', 503);
  if (code === 'attachment_refused')
    return fleetError('attachment_refused', 409);
  if (code === 'full') return fleetError('attachment_limit', 409);
  if (code === 'bad_request') return fleetError('attachment_invalid', 422);
  return bridgeFailure(error);
}
