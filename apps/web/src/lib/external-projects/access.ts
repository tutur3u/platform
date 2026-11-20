import {
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
import type { WorkspaceExternalProjectBinding } from '@tuturuuu/types';
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
import { rejectStaleExternalAppBearer } from '@/lib/app-coordination/external-app-bearer';
import {
  getWorkspaceInviteStatus,
  type WorkspaceInvitationRecord,
} from '@/lib/workspace-invitations/status';
import {
  appTokenHasRequiredScope,
  getExternalProjectModeForScopes,
  hasWorkspaceExternalProjectPermission,
  type WorkspaceExternalProjectMode,
} from './access-mode';
import { appTokenTargetMatchesExternalProjectBinding } from './app-binding';
import {
  authorizeExternalAppRequest,
  readExternalAppCredentials,
} from './app-credentials';
import { resolveWorkspaceExternalProjectBinding } from './binding-state';
import {
  hasRootExternalProjectsAdminPermission,
  verifyCmsOrCliSession,
} from './root-access';

export {
  appTokenHasRequiredScope,
  getExternalProjectModeForScopes,
  type WorkspaceExternalProjectMode,
} from './access-mode';
export {
  getDefaultCanonicalExternalProjectId,
  resolveWorkspaceExternalProjectBinding,
} from './binding-state';
export {
  hasRootExternalProjectsAdminPermission,
  requireRootExternalProjectsAdmin,
} from './root-access';
export {
  ExternalProjectSetupForbiddenError,
  type ExternalProjectSetupScope,
  ensureWorkspaceExternalProjectStudio,
} from './studio-setup';

type AdminDb = TypedSupabaseClient;

function deny(error: string, status: 401 | 403) {
  return {
    ok: false as const,
    response: NextResponse.json({ error }, { status }),
  };
}

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
    return deny('Unauthorized', 401);
  }

  if (!appTokenHasRequiredScope(verification.claims, 'manage')) {
    return deny('Forbidden', 403);
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const appRejection = await rejectStaleExternalAppBearer(
    admin,
    verification.claims
  );
  if (appRejection) return { ok: false as const, response: appRejection };
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

  // Setup enables the studio and may provision shared canonical projects, so
  // only root external-project admins may run it; workspace manage access is
  // not enough (see apps/docs/platform/applications/cms.mdx).
  const rootPermissions = await getPermissionsForUserId({
    admin,
    userId: verification.claims.sub,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (!hasRootExternalProjectsAdminPermission(rootPermissions)) {
    return deny('Forbidden', 403);
  }

  return {
    ok: true as const,
    admin,
    normalizedWorkspaceId,
    rootPermissions,
    setupScope: 'root' as const,
    user: {
      app: verification.claims.target_app,
      email: verification.claims.email,
      id: verification.claims.sub,
    },
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
    verification = verifyCmsOrCliSession(request);
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
    return deny('Unauthorized', 401);
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

  // Setup enables the studio and may provision shared canonical projects, so
  // only root external-project admins may run it; workspace manage access is
  // not enough (see apps/docs/platform/applications/cms.mdx).
  const rootPermissions = await getPermissionsForUserId({
    admin,
    userId: verification.claims.sub,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (!hasRootExternalProjectsAdminPermission(rootPermissions)) {
    return deny('Forbidden', 403);
  }

  return {
    ok: true as const,
    admin,
    normalizedWorkspaceId,
    rootPermissions,
    setupScope: 'root' as const,
    user: {
      app: verification.claims.target_app,
      email: verification.claims.email,
      id: verification.claims.sub,
    },
  };
}

export async function requireWorkspaceExternalProjectAccessWithAppToken({
  mode,
  exactManage = false,
  token,
  wsId,
}: {
  mode: WorkspaceExternalProjectMode;
  exactManage?: boolean;
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
    return deny('Unauthorized', 401);
  }

  const tokenWorkspace = verification.claims.workspace_id;
  if (exactManage && !tokenWorkspace) return deny('Unauthorized', 401);
  if (exactManage && tokenWorkspace !== wsId) return deny('Forbidden', 403);

  if (
    exactManage
      ? !verification.claims.scopes.includes('external-projects:manage')
      : !appTokenHasRequiredScope(verification.claims, mode)
  ) {
    return deny('Forbidden', 403);
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const appRejection = await rejectStaleExternalAppBearer(
    admin,
    verification.claims
  );
  if (appRejection) return { ok: false as const, response: appRejection };
  const normalizedWorkspaceId = await normalizeWorkspaceIdForUser({
    admin,
    userId: verification.claims.sub,
    wsId,
  });
  if (tokenWorkspace && tokenWorkspace !== normalizedWorkspaceId)
    return deny('Forbidden', 403);
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
    return deny('Forbidden', 403);
  }

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
    verification = verifyCmsOrCliSession(request);
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
    return deny('Unauthorized', 401);
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
    return deny('Forbidden', 403);
  }

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
  // A linked app provisioning its own schema has no user to speak for, so it
  // presents its app credentials instead. Scoped to the project it is already
  // bound to, which is the same surface it can already write entries through —
  // this lets a satellite install and repair its own content model without an
  // operator having to click through the studio first.
  const appCredentials = readExternalAppCredentials(request);

  if (appCredentials.appSecret) {
    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const appAccess = await authorizeExternalAppRequest({
      admin,
      appId: appCredentials.appId,
      appSecret: appCredentials.appSecret,
      wsId,
    });

    if (appAccess.response) {
      return { ok: false as const, response: appAccess.response };
    }

    return {
      ok: true as const,
      admin,
      normalizedWorkspaceId: wsId,
      setupScope: 'workspace' as const,
      user: null,
    };
  }

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
    return deny('Unauthorized', 401);
  }

  const rootPermissions = await getPermissions({
    wsId: ROOT_WORKSPACE_ID,
    request,
  });

  if (!hasRootExternalProjectsAdminPermission(rootPermissions)) {
    return deny('Forbidden', 403);
  }

  return {
    ok: true as const,
    admin: (await createAdminClient()) as TypedSupabaseClient,
    normalizedWorkspaceId,
    rootPermissions,
    setupScope: 'root' as const,
    supabase,
    user,
  };
}

/**
 * Access for applying a schema sync, which a linked app may do for itself.
 *
 * Kept separate from `requireWorkspaceExternalProjectAccess` rather than
 * folded into it: most callers of that helper (assets, blocks, entries) act on
 * behalf of a real person and dereference `access.user`, so widening its result
 * to a null user there would push an impossible case into a dozen routes.
 * Installing a schema is setup followed by a sync, so an app that can provision
 * must also be able to apply — otherwise it can create a binding it can never
 * populate.
 */
export async function requireWorkspaceExternalProjectSyncAccess({
  mode,
  request,
  wsId,
}: {
  mode: WorkspaceExternalProjectMode;
  request: Request;
  wsId: string;
}): Promise<
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      admin: AdminDb;
      binding: WorkspaceExternalProjectBinding;
      normalizedWorkspaceId: string;
      user: { id: string } | null;
    }
> {
  const appCredentials = readExternalAppCredentials(request);

  if (appCredentials.appSecret) {
    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const appAccess = await authorizeExternalAppRequest({
      admin,
      appId: appCredentials.appId,
      appSecret: appCredentials.appSecret,
      wsId,
    });

    if (appAccess.response) {
      return { ok: false as const, response: appAccess.response };
    }

    return {
      admin,
      binding: appAccess.binding,
      normalizedWorkspaceId: wsId,
      ok: true as const,
      user: null,
    };
  }

  return requireWorkspaceExternalProjectAccess({ mode, request, wsId });
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
    return deny('Unauthorized', 401);
  }

  const admin = (await createAdminClient()) as TypedSupabaseClient;
  const [workspacePermissions, rootPermissions] = await Promise.all([
    getPermissions({ wsId: normalizedWorkspaceId, request }),
    getPermissions({ wsId: ROOT_WORKSPACE_ID, request }),
  ]);

  const allowed =
    hasWorkspaceExternalProjectPermission(workspacePermissions, mode) ||
    hasRootExternalProjectsAdminPermission(rootPermissions);

  if (!allowed) {
    return deny('Forbidden', 403);
  }

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
    return deny('Unauthorized', 401);
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
    return deny('Unauthorized', 401);
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
    return deny('Forbidden', 403);
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
