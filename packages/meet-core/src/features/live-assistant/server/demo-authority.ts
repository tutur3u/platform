import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { miraDemoAdmission } from '../demo-admission';
import type { MiraWorkspaceAttestation } from '../participant-consent';

export async function readMiraAdultAttestation(
  _workspaceId: string
): Promise<MiraWorkspaceAttestation | null> {
  // No authoritative attestation store is configured. Client and environment
  // values cannot substitute for a persisted administrator decision.
  return null;
}

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
    const [identity, workspace, attestation] = await Promise.all([
      db.auth.admin.getUserById(input.accountId),
      db
        .from('workspaces')
        .select('id, personal, creator_id, deleted')
        .eq('id', input.workspaceId)
        .maybeSingle(),
      readMiraAdultAttestation(input.workspaceId),
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
      workspaceMember: input.workspaceMember,
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
