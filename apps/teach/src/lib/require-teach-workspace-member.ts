import { checkEducationWorkspaceEligibility } from '@tuturuuu/education-core/education/workspace-eligibility';
import { ENABLE_EDUCATION_SECRET } from '@tuturuuu/education-core/tulearn/constants';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { getSatelliteWorkspacePermissions } from '@tuturuuu/satellite/workspace-access';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { PermissionId } from '@tuturuuu/types/db';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { notFound } from 'next/navigation';

export async function requireTeachWorkspaceMember(
  wsId: string,
  permission: PermissionId | null = null
) {
  const permissions = await getSatelliteWorkspacePermissions('teach', wsId);
  if (!permissions || (permission && permissions.withoutPermission(permission)))
    notFound();

  if (permissions.membershipType !== 'MEMBER') notFound();
  const actor = await getSatelliteAppSessionUser('teach');
  if (!actor) notFound();
  const admin = await createAdminClient({ noCookie: true });
  const membership = await verifyWorkspaceMembershipType({
    wsId: permissions.wsId,
    userId: actor.id,
    supabase: admin,
  });
  if (!membership.ok) {
    if (membership.error === 'membership_lookup_failed') {
      console.error('Teach workspace membership lookup failed');
      throw new Error('Failed to verify Teach workspace membership');
    }
    notFound();
  }

  const eligibility = await checkEducationWorkspaceEligibility({
    membershipType: membership.membershipType,
    readEducationSecret: async () => {
      return admin
        .from('workspace_secrets')
        .select('value')
        .eq('ws_id', permissions.wsId)
        .eq('name', ENABLE_EDUCATION_SECRET)
        .maybeSingle();
    },
  });
  if (!eligibility.ok) {
    if (eligibility.status === 500) {
      console.error('Teach education flag lookup failed');
      throw new Error('Failed to verify Teach education access');
    }
    notFound();
  }
  return permissions;
}
