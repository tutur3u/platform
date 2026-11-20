import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import { canVerifiedAccountHostMeeting } from '@tuturuuu/utils/meet-hosting';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import {
  isMeetAiEnabledForWorkspace,
  meetAiGateEnv,
} from '../../meeting-ai/server/workspace-gate';
import { miraDemoAdmission } from '../demo-admission';
import { readMiraAdultAttestation } from './mira-attestation';

export { readMiraAdultAttestation } from './mira-attestation';

export async function readMiraDemoAuthority(input: {
  accountId: string;
  workspaceId: string;
  meetingId: string;
  admitted: boolean;
  workspaceMember: boolean;
  disabledBinding: unknown;
}) {
  try {
    const db = await createAdminClient({ noCookie: true });
    const [identity, workspace, attestation, membership] = await Promise.all([
      db.auth.admin.getUserById(input.accountId),
      db
        .from('workspaces')
        .select('id, personal, creator_id, deleted')
        .eq('id', input.workspaceId)
        .maybeSingle(),
      // A failed read is no attestation: only the staff Personal exception
      // can pass, so a missing migration never widens access.
      readMiraAdultAttestation(input.workspaceId).catch(() => null),
      input.workspaceMember
        ? verifyWorkspaceMembershipType({
            supabase: db,
            userId: input.accountId,
            wsId: input.workspaceId,
          })
        : null,
    ]);
    if (
      identity.error ||
      identity.data.user?.id !== input.accountId ||
      workspace.error ||
      workspace.data?.id !== input.workspaceId ||
      workspace.data.deleted === true
    )
      return { allowed: false as const, reason: 'identity' as const };
    // The meeting workspace must pass the Meet AI workspace gate (hard
    // denies, denylist, then the reviewed allow-all opt-in or allowlist).
    const enabled =
      (input.disabledBinding === 'false' || input.disabledBinding === '0') &&
      isMeetAiEnabledForWorkspace(input.workspaceId, await meetAiGateEnv());
    const actor = identity.data.user!;
    // Same rule as Meet hosting, read from current Auth and the account's own
    // Personal subscription. Staff never need the subscription lookup.
    const paidAccount =
      enabled && !isVerifiedTuturuuuStaffSession(actor)
        ? await canVerifiedAccountHostMeeting(input.accountId, actor)
        : false;
    return miraDemoAdmission({
      actor,
      workspaceId: input.workspaceId,
      meetingId: input.meetingId,
      workspaceMember: membership?.ok === true,
      admitted: input.admitted,
      explicitEnable: enabled,
      disabled: !enabled,
      personalWorkspace: workspace.data.personal === true,
      workspaceOwnerId: workspace.data.creator_id,
      attestation,
      paidAccount,
    });
  } catch {
    return { allowed: false as const, reason: 'identity' as const };
  }
}
