import type { AppCoordinationTokenClaims } from '@tuturuuu/auth/app-coordination';
import type { PermissionsResult } from '@tuturuuu/utils/workspace-helper';

// `edit` (save and privately preview CMS page drafts) is held by editors,
// publishers and managers; the other modes keep their legacy meaning.
export type WorkspaceExternalProjectMode =
  | 'read'
  | 'edit'
  | 'manage'
  | 'publish';

export function hasWorkspaceExternalProjectPermission(
  permissions: PermissionsResult | null,
  mode: WorkspaceExternalProjectMode
) {
  if (!permissions) return false;
  if (permissions.containsPermission('manage_external_projects')) return true;
  if (mode === 'read') {
    return permissions.containsPermission('publish_external_projects');
  }
  if (mode === 'publish') {
    return permissions.containsPermission('publish_external_projects');
  }
  if (mode === 'edit') {
    return (
      permissions.containsPermission('publish_external_projects') ||
      permissions.containsPermission('edit_external_projects')
    );
  }
  return false;
}

export function appTokenHasRequiredScope(
  claims: AppCoordinationTokenClaims,
  mode: WorkspaceExternalProjectMode
) {
  if (claims.scopes.length === 0) {
    return false;
  }

  // Broader scopes answer for narrower ones. `manage` is the right to change the
  // content model, which nobody can exercise without also reading and
  // publishing — yet a token holding it was refused a plain read. An app granted
  // everything could therefore do nothing, and no permission change fixed it,
  // because the grant was never what was missing.
  const acceptedScopes =
    mode === 'read'
      ? [
          'external-projects:read',
          'external-projects:publish',
          'external-projects:manage',
        ]
      : mode === 'publish' || mode === 'edit'
        ? ['external-projects:publish', 'external-projects:manage']
        : ['external-projects:manage'];

  return (
    claims.scopes.includes('external-projects:*') ||
    acceptedScopes.some((scope) => claims.scopes.includes(scope))
  );
}
