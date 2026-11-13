import {
  hasMiraAdultAttestation,
  type MiraWorkspaceAttestation,
} from './participant-consent';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';

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
};

export type MiraAdmission =
  | { allowed: true; authority: 'verified-personal' | 'workspace-admin' }
  | {
      allowed: false;
      reason:
        | 'disabled'
        | 'identity'
        | 'membership'
        | 'participation'
        | 'workspace';
    };

export function miraDemoAdmission(input: MiraAdmissionInput): MiraAdmission {
  if (input.explicitEnable !== true || input.disabled !== false)
    return { allowed: false, reason: 'disabled' };
  if (!input.actor?.id) return { allowed: false, reason: 'identity' };
  if (!input.workspaceId || !input.meetingId || !input.workspaceMember)
    return { allowed: false, reason: 'membership' };
  if (!input.admitted) return { allowed: false, reason: 'participation' };
  if (
    isVerifiedTuturuuuStaffSession(input.actor) &&
    input.personalWorkspace &&
    input.workspaceOwnerId === input.actor.id
  )
    return { allowed: true, authority: 'verified-personal' };
  if (!hasMiraAdultAttestation(input))
    return { allowed: false, reason: 'workspace' };
  return { allowed: true, authority: 'workspace-admin' };
}
