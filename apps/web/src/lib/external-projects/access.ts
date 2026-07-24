import {
  type AppCoordinationTokenClaims,
  getBearerAppCoordinationToken,
  verifyAppCoordinationToken,
} from '@tuturuuu/auth/app-coordination';
import {
  getAppSessionTokenFromRequest,
  verifyAppSessionRequest,
} from '@tuturuuu/auth/app-session';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  CanonicalExternalProject,
  ExternalProjectAdapterKind,
  ExternalProjectSyncSchema,
  Json,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';
import {
  getPermissions,
  normalizeWorkspaceId,
  type PermissionsResult,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { validate as validateUUID } from 'uuid';
import {
  getWorkspaceInviteStatus,
  type WorkspaceInvitationRecord,
} from '@/lib/workspace-invitations/status';
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

/**
 * Read the enabled flag + canonical id for a workspace.
 *
 * Dual-read rollout: prefer the first-class
 * `workspace_external_project_bindings` table (introduced by the CMS redesign).
 * Fall back to the legacy `workspace_secrets` pattern when no binding row exists
 * yet (e.g. a workspace that has not been backfilled, or before the migration is
 * applied). This keeps delivery working for every workspace regardless of
 * rollout state. The binding table is missing entirely until the migration runs,
 * in which case the query errors and we silently fall back to secrets.
 */
async function readWorkspaceExternalProjectBindingState(
  admin: AdminDb,
  workspaceId: string
): Promise<{ canonicalId: string | null; enabled: boolean }> {
  try {
    const { data: binding, error: bindingError } = await admin
      .from('workspace_external_project_bindings')
      .select('canonical_project_id, is_enabled')
      .eq('ws_id', workspaceId)
      .maybeSingle();

    if (!bindingError && binding) {
      return {
        canonicalId: binding.canonical_project_id ?? null,
        enabled: binding.is_enabled === true,
      };
    }
  } catch {
    // Table not present yet (migration not applied) — fall through to secrets.
  }

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

  return {
    canonicalId:
      secrets?.find(
        (secret) => secret.name === EXTERNAL_PROJECT_CANONICAL_ID_SECRET
      )?.value ?? null,
    enabled:
      secrets?.some(
        (secret) =>
          secret.name === EXTERNAL_PROJECT_ENABLED_SECRET &&
          secret.value === 'true'
      ) ?? false,
  };
}

export async function resolveWorkspaceExternalProjectBinding(
  workspaceId: string,
  db?: AdminDb
): Promise<WorkspaceExternalProjectBinding> {
  const admin = db ?? ((await createAdminClient()) as TypedSupabaseClient);

  const { canonicalId, enabled } =
    await readWorkspaceExternalProjectBindingState(admin, workspaceId);

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
  canonicalProjectId = getDefaultCanonicalExternalProjectId(adapter),
  schema,
}: {
  adapter: ExternalProjectAdapterKind;
  admin: AdminDb;
  actorId: string;
  canonicalProjectId?: string;
  schema?: ExternalProjectSyncSchema;
}) {
  const { data: existingProject, error: existingProjectError } = await admin
    .from('canonical_external_projects')
    .select('*')
    .eq('id', canonicalProjectId)
    .maybeSingle();

  if (existingProjectError) {
    throw new Error(existingProjectError.message);
  }

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

    return {
      canonicalProject: existingProject,
      created: false,
      id: canonicalProjectId,
    };
  }

  const schemaCollectionSlugs = getExternalProjectSchemaCollectionSlugs(schema);
  const allowedCollections =
    schemaCollectionSlugs.length > 0
      ? schemaCollectionSlugs
      : DEFAULT_EXTERNAL_PROJECT_COLLECTIONS[adapter];

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

async function importExternalProjectFieldDefinitions({
  actorId,
  admin,
  schema,
  workspaceId,
}: {
  actorId: string;
  admin: AdminDb;
  schema?: ExternalProjectSyncSchema;
  workspaceId: string;
}) {
  if (!schema) {
    return;
  }

  const { upsertWorkspaceExternalProjectFieldDefinitionsFromSchema } =
    await import('./store');

  await upsertWorkspaceExternalProjectFieldDefinitionsFromSchema(
    {
      actorId,
      schema,
      workspaceId,
    },
    admin
  );
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
    currentBinding.adapter === adapter &&
    currentBinding.canonical_id
  ) {
    const { created: createdCanonicalProject } =
      await ensureCanonicalExternalProject({
        actorId,
        adapter,
        admin,
        canonicalProjectId: currentBinding.canonical_id,
        schema,
      });

    await importExternalProjectFieldDefinitions({
      actorId,
      admin,
      schema,
      workspaceId,
    });

    return {
      binding: await resolveWorkspaceExternalProjectBinding(workspaceId, admin),
      createdBinding: false,
      createdCanonicalProject,
    };
  }

  if (currentBinding.canonical_id) {
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

  await importExternalProjectFieldDefinitions({
    actorId,
    admin,
    schema,
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
      code?: 'PENDING_WORKSPACE_INVITE';
      invitation?: WorkspaceInvitationRecord;
      normalizedWorkspaceId?: string;
      ok: false;
      status: 400 | 403 | 404 | 500;
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
  userId,
  wsId,
}: {
  admin: AdminDb;
  userId: string;
  wsId: string;
}): Promise<PermissionsResult | null> {
  return getPermissions({
    user: {
      email: null,
      id: userId,
    },
    wsId,
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

function appTokenTargetMatchesExternalProjectBinding({
  binding,
  targetApp,
}: {
  binding: WorkspaceExternalProjectBinding;
  targetApp: string;
}) {
  return binding.canonical_project?.adapter === targetApp;
}

async function authorizeLinkedWorkspaceMember({
  admin,
  authEmail,
  includeInviteStatus = false,
  userId,
  workspaceId,
}: {
  admin: AdminDb;
  authEmail?: string | null;
  includeInviteStatus?: boolean;
  userId: string;
  workspaceId: string;
}): Promise<
  | { ok: true }
  | {
      code?: 'PENDING_WORKSPACE_INVITE';
      error: string;
      invitation?: WorkspaceInvitationRecord;
      normalizedWorkspaceId?: string;
      ok: false;
      status: 403 | 500;
    }
> {
  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: admin,
    userId,
    wsId: workspaceId,
  });

  if (membership.ok) {
    return { ok: true };
  }

  if (membership.error === 'membership_lookup_failed') {
    return {
      error: 'Failed to verify workspace membership',
      ok: false,
      status: 500,
    };
  }

  if (includeInviteStatus) {
    const inviteStatus = await getWorkspaceInviteStatus(admin, {
      authEmail: authEmail ?? null,
      userId,
      workspaceId,
    });

    if (inviteStatus.status === 'pending_invite') {
      return {
        code: 'PENDING_WORKSPACE_INVITE',
        error: 'Pending workspace invitation',
        invitation: inviteStatus.invitation,
        normalizedWorkspaceId: workspaceId,
        ok: false,
        status: 403,
      };
    }
  }

  return {
    error: 'Forbidden',
    ok: false,
    status: 403,
  };
}

function createLinkedWorkspaceMemberErrorResponse(
  authorization: Exclude<
    Awaited<ReturnType<typeof authorizeLinkedWorkspaceMember>>,
    { ok: true }
  >
) {
  return NextResponse.json(
    { error: authorization.error },
    { status: authorization.status }
  );
}

export async function authorizeExternalProjectAppTokenExchange({
  admin,
  appId,
  authEmail,
  scopes,
  userId,
  workspaceId,
}: {
  admin: AdminDb;
  appId: string;
  authEmail?: string | null;
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

  if (
    !appTokenTargetMatchesExternalProjectBinding({
      binding,
      targetApp: appId,
    })
  ) {
    return {
      error: 'App is not linked to this workspace',
      ok: false,
      status: 403,
    };
  }

  const memberAuthorization = await authorizeLinkedWorkspaceMember({
    admin,
    authEmail,
    includeInviteStatus: true,
    userId,
    workspaceId: normalizedWorkspaceId,
  });

  if (!memberAuthorization.ok) {
    return memberAuthorization;
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
  const memberAuthorization = await authorizeLinkedWorkspaceMember({
    admin,
    userId: verification.claims.sub,
    workspaceId: normalizedWorkspaceId,
  });

  if (!memberAuthorization.ok) {
    return {
      ok: false as const,
      response: createLinkedWorkspaceMemberErrorResponse(memberAuthorization),
    };
  }

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

async function requireWorkspaceExternalProjectSetupAccessWithAppSession({
  request,
  wsId,
}: {
  request: Request;
  wsId: string;
}) {
  let verification: ReturnType<typeof verifyAppSessionRequest>;

  try {
    verification = verifyAppSessionRequest(request, { targetApp: 'cms' });
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

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const normalizedWorkspaceId = await normalizeWorkspaceIdForUser({
    admin,
    userId: verification.claims.sub,
    wsId,
  });
  const memberAuthorization = await authorizeLinkedWorkspaceMember({
    admin,
    userId: verification.claims.sub,
    workspaceId: normalizedWorkspaceId,
  });

  if (!memberAuthorization.ok) {
    return {
      ok: false as const,
      response: createLinkedWorkspaceMemberErrorResponse(memberAuthorization),
    };
  }

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

  if (
    !appTokenTargetMatchesExternalProjectBinding({
      binding,
      targetApp: verification.claims.target_app,
    })
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'App is not linked to this workspace' },
        { status: 403 }
      ),
    };
  }

  const memberAuthorization = await authorizeLinkedWorkspaceMember({
    admin,
    userId: verification.claims.sub,
    workspaceId: normalizedWorkspaceId,
  });

  if (!memberAuthorization.ok) {
    return {
      ok: false as const,
      response: createLinkedWorkspaceMemberErrorResponse(memberAuthorization),
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

async function requireWorkspaceExternalProjectAccessWithAppSession({
  mode,
  request,
  wsId,
}: {
  mode: WorkspaceExternalProjectMode;
  request: Request;
  wsId: string;
}) {
  let verification: ReturnType<typeof verifyAppSessionRequest>;

  try {
    verification = verifyAppSessionRequest(request, { targetApp: 'cms' });
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

  const memberAuthorization = await authorizeLinkedWorkspaceMember({
    admin,
    userId: verification.claims.sub,
    workspaceId: normalizedWorkspaceId,
  });

  if (!memberAuthorization.ok) {
    return {
      ok: false as const,
      response: createLinkedWorkspaceMemberErrorResponse(memberAuthorization),
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

function shouldFallbackFromAppSessionToAppToken(
  access: { ok: true } | { ok: false; response: NextResponse },
  appCoordinationToken: string | null
) {
  return (
    !access.ok &&
    access.response.status === 401 &&
    Boolean(appCoordinationToken)
  );
}

export async function requireWorkspaceExternalProjectSetupAccess({
  request,
  wsId,
}: {
  request: Request;
  wsId: string;
}) {
  const appCoordinationToken = getBearerAppCoordinationToken(request);

  if (getAppSessionTokenFromRequest(request)) {
    const appSessionAccess =
      await requireWorkspaceExternalProjectSetupAccessWithAppSession({
        request,
        wsId,
      });

    if (
      !shouldFallbackFromAppSessionToAppToken(
        appSessionAccess,
        appCoordinationToken
      )
    ) {
      return appSessionAccess;
    }
  }

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

  if (getAppSessionTokenFromRequest(request)) {
    const appSessionAccess =
      await requireWorkspaceExternalProjectAccessWithAppSession({
        mode,
        request,
        wsId,
      });

    if (
      !shouldFallbackFromAppSessionToAppToken(
        appSessionAccess,
        appCoordinationToken
      )
    ) {
      return appSessionAccess;
    }
  }

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

export async function requireWorkspaceExternalProjectMemberBootstrapAccess({
  request,
  wsId,
}: {
  request: Request;
  wsId: string;
}) {
  if (!getAppSessionTokenFromRequest(request)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  let verification: ReturnType<typeof verifyAppSessionRequest>;

  try {
    verification = verifyAppSessionRequest(request, { targetApp: 'cms' });
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

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const normalizedWorkspaceId = await normalizeWorkspaceIdForUser({
    admin,
    userId: verification.claims.sub,
    wsId,
  });
  const [binding, rootPermissions, workspacePermissions] = await Promise.all([
    resolveWorkspaceExternalProjectBinding(normalizedWorkspaceId, admin),
    getPermissionsForUserId({
      admin,
      userId: verification.claims.sub,
      wsId: ROOT_WORKSPACE_ID,
    }),
    getPermissionsForUserId({
      admin,
      userId: verification.claims.sub,
      wsId: normalizedWorkspaceId,
    }),
  ]);

  if (!binding.enabled || !binding.canonical_project) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'External project studio unavailable for this workspace' },
        { status: 404 }
      ),
    };
  }

  if (!hasRootExternalProjectsAdminPermission(rootPermissions)) {
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
