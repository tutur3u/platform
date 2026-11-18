import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { miraDemoAdmission, readMiraAdultAttestation } from '../demo-admission';

export { readMiraAdultAttestation } from '../demo-admission';

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
      readMiraAdultAttestation(input.workspaceId),
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
    const enabled =
      input.disabledBinding === 'false' || input.disabledBinding === '0';
    return miraDemoAdmission({
      actor: identity.data.user!,
      workspaceId: input.workspaceId,
      meetingId: input.meetingId,
      workspaceMember: membership?.ok === true,
      admitted: input.admitted,
      explicitEnable: enabled,
      disabled: !enabled,
      personalWorkspace: workspace.data.personal === true,
      workspaceOwnerId: workspace.data.creator_id,
      attestation,
    });
  } catch {
    return { allowed: false as const, reason: 'identity' as const };
  }
}
