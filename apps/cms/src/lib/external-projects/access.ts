import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  CanonicalExternalProject,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import {
  EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
  EXTERNAL_PROJECT_ENABLED_SECRET,
} from './constants';

type AdminDb = TypedSupabaseClient;

export function hasRootExternalProjectsAdminPermission(
  permissions: PermissionsResult | null
) {
  if (!permissions) return false;

  return (
    permissions.containsPermission('manage_external_projects') ||
    permissions.containsPermission('manage_workspace_roles')
  );
}

function hasWorkspaceExternalProjectPermission(
  permissions: PermissionsResult | null
) {
  if (!permissions) return false;

  return (
    permissions.containsPermission('manage_external_projects') ||
    permissions.containsPermission('publish_external_projects')
  );
}

export async function resolveWorkspaceExternalProjectBinding(
  workspaceId: string,
  db?: AdminDb
): Promise<WorkspaceExternalProjectBinding> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);

  const { data: secrets, error: secretsError } = await admin
    .from('workspace_secrets')
    .select('name, value')
    .eq('ws_id', workspaceId)
    .in('name', [
      EXTERNAL_PROJECT_ENABLED_SECRET,
      EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
    ]);

  if (secretsError) {
    throw new Error(secretsError.message);
  }

  const enabled =
    secrets?.some(
      (secret) =>
        secret.name === EXTERNAL_PROJECT_ENABLED_SECRET &&
        secret.value === 'true'
    ) ?? false;
  const canonicalId =
    secrets?.find(
      (secret) => secret.name === EXTERNAL_PROJECT_CANONICAL_ID_SECRET
    )?.value ?? null;

  let canonicalProject: CanonicalExternalProject | null = null;

  if (canonicalId) {
    const { data } = await admin
      .from('canonical_external_projects')
      .select('*')
      .eq('id', canonicalId)
      .maybeSingle();

    canonicalProject = data;
  }

  return {
    adapter: canonicalProject?.adapter ?? null,
    canonical_id: canonicalId,
    canonical_project:
      enabled && canonicalProject?.is_active ? canonicalProject : null,
    enabled:
      enabled && Boolean(canonicalId) && Boolean(canonicalProject?.is_active),
    workspace_id: workspaceId,
  };
}

export async function getCmsWorkspaceAccess(rawWsId: string) {
  const supabase = (await createClient()) as TypedSupabaseClient;
  const normalizedWorkspaceId = await normalizeWorkspaceId(rawWsId, supabase);
  const [workspacePermissions, rootPermissions, binding] = await Promise.all([
    getPermissions({ wsId: rawWsId }),
    getPermissions({ wsId: ROOT_WORKSPACE_ID }),
    resolveWorkspaceExternalProjectBinding(normalizedWorkspaceId),
  ]);

  const isRootAdmin = hasRootExternalProjectsAdminPermission(rootPermissions);
  const canAccessWorkspace =
    binding.enabled &&
    Boolean(binding.canonical_project) &&
    (hasWorkspaceExternalProjectPermission(workspacePermissions) ||
      isRootAdmin);

  return {
    binding,
    canAccessAdmin: isRootAdmin && normalizedWorkspaceId === ROOT_WORKSPACE_ID,
    canAccessWorkspace,
    isRootAdmin,
    normalizedWorkspaceId,
    rootPermissions,
    workspacePermissions,
  };
}
