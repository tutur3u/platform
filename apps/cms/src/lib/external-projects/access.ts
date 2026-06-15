import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  CanonicalExternalProject,
  PermissionId,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
} from '@tuturuuu/utils/constants';
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

function hasAnyPermission(
  permissions: PermissionsResult | null,
  values: readonly PermissionId[]
) {
  if (!permissions) return false;

  return values.some((value) => permissions.containsPermission(value));
}

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

export function hasCmsCommerceFinanceOverviewPermission(
  permissions: PermissionsResult | null
) {
  return hasAnyPermission(permissions, ['view_finance_stats']);
}

export function hasCmsCommerceProductReadPermission(
  permissions: PermissionsResult | null
) {
  return (
    hasAnyPermission(permissions, [
      'manage_inventory',
      'view_inventory_catalog',
      'manage_inventory_catalog',
      'view_inventory',
      'create_inventory',
      'update_inventory',
      'delete_inventory',
    ]) &&
    hasAnyPermission(permissions, [
      'manage_inventory',
      'view_inventory_stock',
      'view_stock_quantity',
      'adjust_inventory_stock',
      'update_stock_quantity',
    ])
  );
}

export function hasCmsCommerceStorefrontReadPermission(
  permissions: PermissionsResult | null
) {
  return hasAnyPermission(permissions, [
    'manage_inventory',
    'view_inventory_catalog',
    'manage_inventory_catalog',
    'view_inventory',
    'create_inventory',
    'update_inventory',
    'delete_inventory',
  ]);
}

export function hasCmsCommerceStorefrontPublishPermission(
  permissions: PermissionsResult | null
) {
  return hasAnyPermission(permissions, [
    'manage_inventory',
    'manage_inventory_catalog',
  ]);
}

export function hasCmsCommerceInsightsPermission(
  permissions: PermissionsResult | null
) {
  return (
    hasAnyPermission(permissions, [
      'view_inventory_analytics',
      'view_inventory_dashboard',
    ]) || hasCmsCommerceProductReadPermission(permissions)
  );
}

export async function resolveWorkspaceExternalProjectBinding(
  workspaceId: string,
  db?: AdminDb
): Promise<WorkspaceExternalProjectBinding> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);

  // Dual-read rollout: prefer the first-class bindings table, fall back to the
  // legacy workspace_secrets pattern when no binding row exists (or before the
  // migration is applied). Keeps CMS access consistent with delivery.
  let enabled = false;
  let canonicalId: string | null = null;
  let resolvedFromBindingTable = false;

  try {
    const { data: binding, error: bindingError } = await admin
      .from('workspace_external_project_bindings')
      .select('canonical_project_id, is_enabled')
      .eq('ws_id', workspaceId)
      .maybeSingle();

    if (!bindingError && binding) {
      enabled = binding.is_enabled === true;
      canonicalId = binding.canonical_project_id ?? null;
      resolvedFromBindingTable = true;
    }
  } catch {
    // Table not present yet — fall through to secrets.
  }

  if (!resolvedFromBindingTable) {
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

    enabled =
      secrets?.some(
        (secret) =>
          secret.name === EXTERNAL_PROJECT_ENABLED_SECRET &&
          secret.value === 'true'
      ) ?? false;
    canonicalId =
      secrets?.find(
        (secret) => secret.name === EXTERNAL_PROJECT_CANONICAL_ID_SECRET
      )?.value ?? null;
  }

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

/**
 * Resolve a raw workspace path segment to a concrete workspace id.
 *
 * The CMS authenticates via the satellite app session and talks to Supabase
 * through a no-cookie admin client, so `normalizeWorkspaceId` cannot resolve the
 * `personal` alias on its own (it has no Supabase principal and would throw
 * "User not authenticated"). When the segment is the personal alias we resolve
 * the authenticated user's personal workspace directly; everything else defers
 * to the shared normalizer.
 */
async function resolveCmsWorkspaceId(
  rawWsId: string,
  userId: string | null,
  supabase: TypedSupabaseClient
): Promise<string> {
  if (rawWsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('workspaces')
      .select('id, workspace_members!inner(user_id)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data?.id) {
      return data.id;
    }
  }

  return normalizeWorkspaceId(rawWsId, supabase);
}

export async function getCmsWorkspaceAccess(rawWsId: string) {
  const user = await getSatelliteAppSessionUser('cms');
  const supabase = (await createAdminClient({
    noCookie: true,
  })) as TypedSupabaseClient;
  const normalizedWorkspaceId = await resolveCmsWorkspaceId(
    rawWsId,
    user?.id ?? null,
    supabase
  );
  const isInternalWorkspace = normalizedWorkspaceId === ROOT_WORKSPACE_ID;
  const [workspacePermissions, rootPermissions, binding] = await Promise.all([
    user
      ? getPermissions({ user, wsId: normalizedWorkspaceId })
      : Promise.resolve(null),
    user ? getPermissions({ user, wsId: ROOT_WORKSPACE_ID }) : null,
    isInternalWorkspace
      ? Promise.resolve({
          adapter: null,
          canonical_id: null,
          canonical_project: null,
          enabled: false,
          workspace_id: normalizedWorkspaceId,
        } satisfies WorkspaceExternalProjectBinding)
      : resolveWorkspaceExternalProjectBinding(normalizedWorkspaceId),
  ]);

  const isRootAdmin = hasRootExternalProjectsAdminPermission(rootPermissions);
  const canAccessWorkspace =
    !isInternalWorkspace &&
    binding.enabled &&
    Boolean(binding.canonical_project) &&
    (hasWorkspaceExternalProjectPermission(workspacePermissions) ||
      isRootAdmin);

  return {
    binding,
    canAccessAdmin: isRootAdmin && isInternalWorkspace,
    canAccessWorkspace,
    isInternalWorkspace,
    isRootAdmin,
    normalizedWorkspaceId,
    rootPermissions,
    workspacePermissions,
  };
}
