import {
  type AppCoordinationTokenClaims,
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  CanonicalExternalProject,
  PermissionId,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import { permissions as rolePermissions } from '@tuturuuu/utils/permissions';
import {
  getPermissions,
  normalizeWorkspaceId,
  type PermissionsResult,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate as validateUUID } from 'uuid';
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

export async function requireRootExternalProjectsAdmin(request: Request) {
  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const permissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    request,
  });

  if (!hasRootExternalProjectsAdminPermission(permissions)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    admin: (await createAdminClient()) as TypedSupabaseClient,
    permissions,
    supabase,
    user,
  };
}

type WorkspaceExternalProjectMode = 'read' | 'manage' | 'publish';

function hasWorkspaceExternalProjectPermission(
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
  return false;
}

function createPermissionsResult({
  isCreator,
  permissions,
}: {
  isCreator: boolean;
  permissions: PermissionId[];
}): PermissionsResult {
  const isAdmin = permissions.includes('admin');
  const containsPermission = (permission: PermissionId) =>
    isCreator || isAdmin || permissions.includes(permission);

  return {
    containsPermission,
    permissions,
    withoutPermission: (permission: PermissionId) =>
      !containsPermission(permission),
  };
}

function isWorkspaceHandleCandidate(value: string) {
  return /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u.test(value);
}

async function normalizeWorkspaceIdForUser({
  admin,
  userId,
  wsId,
}: {
  admin: AdminDb;
  userId: string;
  wsId: string;
}) {
  const resolvedWorkspaceId = resolveWorkspaceId(wsId);

  if (resolvedWorkspaceId === ROOT_WORKSPACE_ID) {
    return ROOT_WORKSPACE_ID;
  }

  if (resolvedWorkspaceId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const { data, error } = await admin
      .from('workspaces')
      .select('id, workspace_members!inner(user_id, type)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .eq('workspace_members.type', 'MEMBER')
      .maybeSingle();

    if (error || !data?.id) {
      throw new Error('Personal workspace not found');
    }

    return data.id;
  }

  if (validateUUID(resolvedWorkspaceId)) {
    return resolvedWorkspaceId;
  }

  const handle = resolvedWorkspaceId.trim().toLowerCase();

  if (!isWorkspaceHandleCandidate(handle)) {
    return resolvedWorkspaceId;
  }

  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('handle', handle)
    .maybeSingle();

  return data?.id ?? resolvedWorkspaceId;
}

async function getPermissionsForUserId({
  admin,
  userId,
  wsId,
}: {
  admin: AdminDb;
  userId: string;
  wsId: string;
}): Promise<PermissionsResult | null> {
  const { data: membership, error: membershipError } = await admin
    .from('workspace_members')
    .select('type')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();

  if (membershipError || membership?.type !== 'MEMBER') {
    return null;
  }

  const permissionsQuery = admin
    .from('workspace_role_members')
    .select('workspace_roles!inner(workspace_role_permissions(permission))')
    .eq('user_id', userId)
    .eq('workspace_roles.ws_id', wsId)
    .eq('workspace_roles.workspace_role_permissions.enabled', true);

  const workspaceQuery = admin
    .from('workspaces')
    .select('creator_id')
    .eq('id', wsId)
    .single();

  const defaultQuery = admin
    .from('workspace_default_permissions')
    .select('permission')
    .eq('ws_id', wsId)
    .eq('enabled', true);

  const [permissionsRes, workspaceRes, defaultRes] = await Promise.all([
    permissionsQuery,
    workspaceQuery,
    defaultQuery,
  ]);

  if (
    permissionsRes.error ||
    workspaceRes.error ||
    defaultRes.error ||
    !workspaceRes.data
  ) {
    return null;
  }

  const isCreator = workspaceRes.data.creator_id === userId;
  const rolePermissionIds = permissionsRes.data.flatMap(
    (membership) =>
      membership.workspace_roles?.workspace_role_permissions?.map(
        (permission) => permission.permission
      ) ?? []
  );
  const defaultPermissionIds = defaultRes.data.map(
    (permission) => permission.permission
  );
  const permissions = isCreator
    ? rolePermissions({
        user: { id: userId } as SupabaseUser,
        wsId,
      }).map(({ id }) => id)
    : [...new Set([...rolePermissionIds, ...defaultPermissionIds])];

  if (!isCreator && permissions.length === 0) {
    return null;
  }

  return createPermissionsResult({
    isCreator,
    permissions,
  });
}

function appTokenHasRequiredScope(
  claims: AppCoordinationTokenClaims,
  mode: WorkspaceExternalProjectMode
) {
  if (claims.scopes.length === 0) {
    return true;
  }

  const requiredScope =
    mode === 'read'
      ? 'external-projects:read'
      : mode === 'publish'
        ? 'external-projects:publish'
        : 'external-projects:manage';

  return (
    claims.scopes.includes('external-projects:*') ||
    claims.scopes.includes(requiredScope)
  );
}

async function requireWorkspaceExternalProjectAccessWithAppToken({
  mode,
  token,
  wsId,
}: {
  mode: WorkspaceExternalProjectMode;
  token: string;
  wsId: string;
}) {
  let verification: ReturnType<typeof verifyAppCoordinationToken>;

  try {
    verification = verifyAppCoordinationToken(token);
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'App coordination is not configured' },
        { status: 500 }
      ),
    };
  }

  if (!verification.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (!appTokenHasRequiredScope(verification.claims, mode)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const normalizedWorkspaceId = await normalizeWorkspaceIdForUser({
    admin,
    userId: verification.claims.sub,
    wsId,
  });
  const [workspacePermissions, rootPermissions] = await Promise.all([
    getPermissionsForUserId({
      admin,
      userId: verification.claims.sub,
      wsId: normalizedWorkspaceId,
    }),
    getPermissionsForUserId({
      admin,
      userId: verification.claims.sub,
      wsId: ROOT_WORKSPACE_ID,
    }),
  ]);
  const binding = await resolveWorkspaceExternalProjectBinding(
    normalizedWorkspaceId,
    admin
  );

  if (!binding.enabled || !binding.canonical_project) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'External project studio unavailable for this workspace' },
        { status: 404 }
      ),
    };
  }

  const allowed =
    hasWorkspaceExternalProjectPermission(workspacePermissions, mode) ||
    hasRootExternalProjectsAdminPermission(rootPermissions);

  if (!allowed) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    admin,
    binding,
    normalizedWorkspaceId,
    rootPermissions,
    user: {
      app: verification.claims.target_app,
      email: verification.claims.email,
      id: verification.claims.sub,
    },
    workspacePermissions,
  };
}

export async function requireWorkspaceExternalProjectAccess({
  mode,
  request,
  wsId,
}: {
  mode: WorkspaceExternalProjectMode;
  request: Request;
  wsId: string;
}) {
  const appCoordinationToken = getBearerAppCoordinationToken(request);

  if (appCoordinationToken) {
    return requireWorkspaceExternalProjectAccessWithAppToken({
      mode,
      token: appCoordinationToken,
      wsId,
    });
  }

  const supabase = (await createClient(request)) as TypedSupabaseClient;
  const normalizedWorkspaceId = await normalizeWorkspaceId(wsId, supabase);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const [workspacePermissions, rootPermissions] = await Promise.all([
    getPermissions({ wsId: normalizedWorkspaceId, request }),
    getPermissions({ wsId: ROOT_WORKSPACE_ID, request }),
  ]);

  const binding = await resolveWorkspaceExternalProjectBinding(
    normalizedWorkspaceId,
    admin
  );

  if (!binding.enabled || !binding.canonical_project) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'External project studio unavailable for this workspace' },
        { status: 404 }
      ),
    };
  }

  const allowed =
    hasWorkspaceExternalProjectPermission(workspacePermissions, mode) ||
    hasRootExternalProjectsAdminPermission(rootPermissions);

  if (!allowed) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    admin,
    binding,
    normalizedWorkspaceId,
    rootPermissions,
    user,
    workspacePermissions,
  };
}
