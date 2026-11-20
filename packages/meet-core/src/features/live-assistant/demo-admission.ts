import {
  hasMiraAdultAttestation,
  type MiraWorkspaceAttestation,
} from './participant-consent';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import type { MiraPayer } from './mira-entitlement';

export type MiraVerifiedIdentity = NonNullable<
  Parameters<typeof isVerifiedTuturuuuStaffSession>[0]
> & {
  id: string;
};

export type MiraAdmissionInput = {
  actor: MiraVerifiedIdentity | null;
  workspaceId: string;
  meetingId: string;
  workspaceMember: boolean;
  admitted: boolean;
  explicitEnable: unknown;
  disabled: unknown;
  personalWorkspace: boolean;
  workspaceOwnerId: string | null;
  attestation: MiraWorkspaceAttestation | null;
  /**
   * The adapter's current, server-side answer to "does this account's own
   * Personal subscription carry a paid Meet tier with paid hosting enabled".
   * Only the exact value `true` counts; staff do not need it.
   */
  paidAccount?: unknown;
};

export type MiraAdmission =
  | {
      allowed: true;
      authority: 'verified-personal' | 'workspace-admin';
      payer: MiraPayer;
    }
  | {
      allowed: false;
      reason:
        | 'disabled'
        | 'identity'
        | 'account'
        | 'membership'
        | 'participation'
        | 'workspace';
    };

/** Stored row in private.workspace_mira_audience_attestations. */
export type MiraAttestationRow = {
  ws_id: string;
  audience: string;
  attested_by: string | null;
  attested_at: string;
};

/**
 * Maps the server-stored attestation row; anything incomplete is no
 * attestation. Client values and environment defaults never reach here.
 */
export function miraAttestationFromRow(
  row: MiraAttestationRow | null | undefined,
  workspaceId: string
): MiraWorkspaceAttestation | null {
  if (!row || row.ws_id !== workspaceId || !row.attested_by) return null;
  const attestedAt = Date.parse(row.attested_at);
  if (row.audience !== 'adults-only' || !Number.isSafeInteger(attestedAt))
    return null;
  return {
    workspaceId,
    actorId: row.attested_by,
    attestedAt,
    audience: 'adults-only',
  };
}

/**
 * Account eligibility mirrors Meet hosting: verified @tuturuuu.com staff, or
 * a confirmed account whose Personal subscription is Plus, Pro or Enterprise.
 * Workspace audience (18+) remains a separate, workspace-level requirement.
 */
export function miraAccountPayer(
  actor: MiraVerifiedIdentity | null,
  paidAccount: unknown
): MiraPayer | null {
  if (!actor?.id || !actor.email_confirmed_at || !actor.email) return null;
  if (isVerifiedTuturuuuStaffSession(actor)) return 'tuturuuu';
  return paidAccount === true ? 'account' : null;
}

export function miraDemoAdmission(input: MiraAdmissionInput): MiraAdmission {
  if (input.explicitEnable !== true || input.disabled !== false)
    return { allowed: false, reason: 'disabled' };
  if (!input.actor?.id) return { allowed: false, reason: 'identity' };
  if (!input.workspaceId || !input.meetingId || !input.workspaceMember)
    return { allowed: false, reason: 'membership' };
  if (!input.admitted) return { allowed: false, reason: 'participation' };
  const payer = miraAccountPayer(input.actor, input.paidAccount);
  if (!payer) return { allowed: false, reason: 'account' };
  // Staff are verified adults; their own Personal workspace has no other audience.
  if (
    payer === 'tuturuuu' &&
    input.personalWorkspace &&
    input.workspaceOwnerId === input.actor.id
  )
    return { allowed: true, authority: 'verified-personal', payer };
  if (!hasMiraAdultAttestation(input))
    return { allowed: false, reason: 'workspace' };
  return { allowed: true, authority: 'workspace-admin', payer };
}
