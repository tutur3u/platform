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
  ExternalProjectAdapterKind,
  ExternalProjectSyncSchema,
  Json,
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
  DEFAULT_EXTERNAL_PROJECT_COLLECTIONS,
  EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
  EXTERNAL_PROJECT_DISPLAY_NAMES,
  EXTERNAL_PROJECT_ENABLED_SECRET,
} from './constants';

type AdminDb = TypedSupabaseClient;

export function getDefaultCanonicalExternalProjectId(
  adapter: ExternalProjectAdapterKind
) {
  return `${adapter}-main`;
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

function getExternalProjectSchemaCollectionSlugs(
  schema?: ExternalProjectSyncSchema
) {
  return schema?.collections.map((collection) => collection.slug) ?? [];
}

function buildExternalProjectDeliveryProfile(
  schema?: ExternalProjectSyncSchema
) {
  return {
    schema: schema ?? { collections: [] },
  } as Json;
}

async function ensureCanonicalExternalProject({
  adapter,
  admin,
  actorId,
  schema,
}: {
  adapter: ExternalProjectAdapterKind;
  admin: AdminDb;
  actorId: string;
  schema?: ExternalProjectSyncSchema;
}) {
  const canonicalProjectId = getDefaultCanonicalExternalProjectId(adapter);
  const { data: existingProject, error: existingProjectError } = await admin
    .from('canonical_external_projects')
    .select('*')
    .eq('id', canonicalProjectId)
    .maybeSingle();

  if (existingProjectError) {
    throw new Error(existingProjectError.message);
  }

  const schemaCollectionSlugs = getExternalProjectSchemaCollectionSlugs(schema);
  const allowedCollections =
    schemaCollectionSlugs.length > 0
      ? schemaCollectionSlugs
      : DEFAULT_EXTERNAL_PROJECT_COLLECTIONS[adapter];

  if (existingProject) {
    if (existingProject.adapter !== adapter) {
      throw new Error(
        `Canonical external project ${canonicalProjectId} already uses the ${existingProject.adapter} adapter`
      );
    }

    if (!existingProject.is_active) {
      throw new Error(
        `Canonical external project ${canonicalProjectId} is inactive`
      );
    }

    const { data: updatedProject, error: updateError } = await admin
      .from('canonical_external_projects')
      .update({
        allowed_collections: allowedCollections,
        ...(schema
          ? {
              delivery_profile: buildExternalProjectDeliveryProfile(schema),
            }
          : {}),
        updated_by: actorId,
      })
      .eq('id', canonicalProjectId)
      .select('*')
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      canonicalProject: updatedProject,
      created: false,
      id: canonicalProjectId,
    };
  }

  const { data: canonicalProject, error: insertError } = await admin
    .from('canonical_external_projects')
    .insert({
      adapter,
      allowed_collections: allowedCollections,
      allowed_features: ['sync', 'assets', 'delivery'],
      created_by: actorId,
      delivery_profile: buildExternalProjectDeliveryProfile(schema),
      display_name: EXTERNAL_PROJECT_DISPLAY_NAMES[adapter],
      id: canonicalProjectId,
      is_active: true,
      metadata: {
        autoSetup: true,
        adapter,
      },
      updated_by: actorId,
    })
    .select('*')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return {
    canonicalProject,
    created: true,
    id: canonicalProjectId,
  };
}

async function bindWorkspaceExternalProject({
  actorId,
  admin,
  canonicalProjectId,
  previousCanonicalId,
  workspaceId,
}: {
  actorId: string;
  admin: AdminDb;
  canonicalProjectId: string;
  previousCanonicalId: string | null;
  workspaceId: string;
}) {
  if (workspaceId === ROOT_WORKSPACE_ID) {
    throw new Error(
      'Root workspace cannot be used as a destination external project workspace'
    );
  }

  const { error: deleteError } = await admin
    .from('workspace_secrets')
    .delete()
    .eq('ws_id', workspaceId)
    .in('name', [
      EXTERNAL_PROJECT_ENABLED_SECRET,
      EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
    ]);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const { error: insertError } = await admin.from('workspace_secrets').insert([
    {
      name: EXTERNAL_PROJECT_ENABLED_SECRET,
      value: 'true',
      ws_id: workspaceId,
    },
    {
      name: EXTERNAL_PROJECT_CANONICAL_ID_SECRET,
      value: canonicalProjectId,
      ws_id: workspaceId,
    },
  ]);

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: auditError } = await admin
    .from('workspace_external_project_binding_audits')
    .insert({
      actor_user_id: actorId,
      destination_ws_id: workspaceId,
      next_canonical_id: canonicalProjectId,
      previous_canonical_id: previousCanonicalId,
      source_ws_id: ROOT_WORKSPACE_ID,
    });

  if (auditError) {
    throw new Error(auditError.message);
  }
}

export async function ensureWorkspaceExternalProjectStudio({
  actorId,
  adapter,
  admin,
  schema,
  workspaceId,
}: {
  actorId: string;
  adapter: ExternalProjectAdapterKind;
  admin: AdminDb;
  schema?: ExternalProjectSyncSchema;
  workspaceId: string;
}) {
  const canonicalProjectId = getDefaultCanonicalExternalProjectId(adapter);
  const currentBinding = await resolveWorkspaceExternalProjectBinding(
    workspaceId,
    admin
  );

  if (
    currentBinding.enabled &&
    currentBinding.canonical_project &&
    currentBinding.canonical_id === canonicalProjectId
  ) {
    const { created: createdCanonicalProject } =
      await ensureCanonicalExternalProject({
        actorId,
        adapter,
        admin,
        schema,
      });

    return {
      binding: await resolveWorkspaceExternalProjectBinding(workspaceId, admin),
      createdBinding: false,
      createdCanonicalProject,
    };
  }

  if (
    currentBinding.canonical_id &&
    currentBinding.canonical_id !== canonicalProjectId
  ) {
    throw new Error(
      `Workspace is already configured for ${currentBinding.canonical_id}`
    );
  }

  const { created: createdCanonicalProject } =
    await ensureCanonicalExternalProject({
      actorId,
      adapter,
      admin,
      schema,
    });

  await bindWorkspaceExternalProject({
    actorId,
    admin,
    canonicalProjectId,
    previousCanonicalId: currentBinding.canonical_id,
    workspaceId,
  });

  return {
    binding: await resolveWorkspaceExternalProjectBinding(workspaceId, admin),
    createdBinding: true,
    createdCanonicalProject,
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

export type WorkspaceExternalProjectMode = 'read' | 'manage' | 'publish';

type ExternalProjectAppTokenExchangeAuthorization =
  | {
      mode: WorkspaceExternalProjectMode | null;
      normalizedWorkspaceId: string | null;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 400 | 403 | 404;
    };

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

export function appTokenHasRequiredScope(
  claims: AppCoordinationTokenClaims,
  mode: WorkspaceExternalProjectMode
) {
  if (claims.scopes.length === 0) {
    return false;
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

export function getExternalProjectModeForScopes(
  scopes: string[]
): WorkspaceExternalProjectMode | null {
  if (!scopes.some((scope) => scope.startsWith('external-projects:'))) {
    return null;
  }

  if (
    scopes.includes('external-projects:*') ||
    scopes.includes('external-projects:manage')
  ) {
    return 'manage';
  }

  if (scopes.includes('external-projects:publish')) {
    return 'publish';
  }

  if (scopes.includes('external-projects:read')) {
    return 'read';
  }

  return 'manage';
}

export async function authorizeExternalProjectAppTokenExchange({
  admin,
  appId,
  scopes,
  userId,
  workspaceId,
}: {
  admin: AdminDb;
  appId: string;
  scopes: string[];
  userId: string;
  workspaceId?: string;
}): Promise<ExternalProjectAppTokenExchangeAuthorization> {
  const mode = getExternalProjectModeForScopes(scopes);

  if (!mode) {
    return {
      mode: null,
      normalizedWorkspaceId: null,
      ok: true,
    };
  }

  if (!workspaceId?.trim()) {
    return {
      error: 'Missing workspace ID for external project scopes',
      ok: false,
      status: 400,
    };
  }

  let normalizedWorkspaceId: string;

  try {
    normalizedWorkspaceId = await normalizeWorkspaceIdForUser({
      admin,
      userId,
      wsId: workspaceId,
    });
  } catch {
    return {
      error: 'Forbidden',
      ok: false,
      status: 403,
    };
  }

  const binding = await resolveWorkspaceExternalProjectBinding(
    normalizedWorkspaceId,
    admin
  );

  if (!binding.enabled || !binding.canonical_project) {
    return {
      error: 'External project studio unavailable for this workspace',
      ok: false,
      status: 404,
    };
  }

  if (binding.canonical_project.adapter !== appId) {
    return {
      error: 'App is not linked to this workspace',
      ok: false,
      status: 403,
    };
  }

  const [workspacePermissions, rootPermissions] = await Promise.all([
    getPermissionsForUserId({
      admin,
      userId,
      wsId: normalizedWorkspaceId,
    }),
    getPermissionsForUserId({
      admin,
      userId,
      wsId: ROOT_WORKSPACE_ID,
    }),
  ]);

  const allowed =
    hasWorkspaceExternalProjectPermission(workspacePermissions, mode) ||
    hasRootExternalProjectsAdminPermission(rootPermissions);

  if (!allowed) {
    return {
      error: 'Forbidden',
      ok: false,
      status: 403,
    };
  }

  return {
    mode,
    normalizedWorkspaceId,
    ok: true,
  };
}

async function requireWorkspaceExternalProjectSetupAccessWithAppToken({
  token,
  wsId,
}: {
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

  if (!appTokenHasRequiredScope(verification.claims, 'manage')) {
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

  const allowed =
    hasWorkspaceExternalProjectPermission(workspacePermissions, 'manage') ||
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

export async function requireWorkspaceExternalProjectSetupAccess({
  request,
  wsId,
}: {
  request: Request;
  wsId: string;
}) {
  const appCoordinationToken = getBearerAppCoordinationToken(request);

  if (appCoordinationToken) {
    return requireWorkspaceExternalProjectSetupAccessWithAppToken({
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

  const allowed =
    hasWorkspaceExternalProjectPermission(workspacePermissions, 'manage') ||
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
    normalizedWorkspaceId,
    rootPermissions,
    supabase,
    user,
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
