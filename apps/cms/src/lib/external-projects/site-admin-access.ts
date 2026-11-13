import {
  externalProjectAdminBindingMatches,
  resolveExternalProjectAdminMapping,
} from '@tuturuuu/utils/external-project-admin-binding';
import { getCmsWorkspaceAccess, hasCmsEditPermission } from './access';

/** Same central session and workspace gate for the site admin and analytics. */
export async function getCmsExternalProjectAdminAccess(origin: string) {
  const mapping = resolveExternalProjectAdminMapping(
    process.env.EXTERNAL_PROJECT_ADMIN_BINDINGS,
    origin
  );
  if (!mapping) return { ok: false as const, reason: 'unavailable' as const };
  const access = await getCmsWorkspaceAccess(mapping.workspaceId);
  if (!access.userId)
    return { ok: false as const, reason: 'unauthorized' as const };
  if (
    !access.canAccessWorkspace ||
    access.workspacePermissions?.membershipType !== 'MEMBER' ||
    !hasCmsEditPermission(access.workspacePermissions) ||
    !externalProjectAdminBindingMatches({
      mapping,
      binding: access.binding,
      workspaceId: access.normalizedWorkspaceId,
    })
  )
    return { ok: false as const, reason: 'forbidden' as const };
  return { ok: true as const, access, mapping };
}
