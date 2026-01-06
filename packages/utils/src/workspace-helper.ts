import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type {
  PermissionId,
  Workspace,
  WorkspaceProductTier,
} from '@tuturuuu/types';
import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { notFound, redirect } from 'next/navigation';

import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from './constants';
import { isValidTuturuuuEmail } from './email/client';
import { permissions as rolePermissions } from './permissions';

// Structured logging utility
const logWorkspaceError = (
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>
) => {
  const logData = {
    context,
    error: error instanceof Error ? error.message : error,
    timestamp: new Date().toISOString(),
    ...metadata,
  };
  console.error(`[WorkspaceHelper] ${context}:`, logData);
};

/**
 * Fetches a workspace by ID or the 'PERSONAL' keyword.
 *
 * @param id - Workspace ID (UUID) or 'PERSONAL' to fetch the current user's personal workspace.
 *
 * @returns The workspace object with a `joined` boolean indicating membership status.
 *
 * @throws Redirects to `/login` if the user is not authenticated.
 * @throws Calls `notFound()` (throws) if the workspace does not exist or access is denied.
 *         Callers should handle this in a try/catch or expect navigation to 404.
 */
export async function getWorkspace(id: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const queryBuilder = supabase
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, personal, created_at, workspace_members(user_id), workspace_subscriptions!left(created_at, status, workspace_subscription_products(tier))'
    );

  const resolvedWorkspaceId = resolveWorkspaceId(id);

  if (id.toUpperCase() === 'PERSONAL') queryBuilder.eq('personal', true);
  else queryBuilder.eq('id', resolvedWorkspaceId);

  const { data, error } = await queryBuilder.single();

  // If there's an error, log it for debugging with structured logging
  if (error) {
    logWorkspaceError('Failed to fetch workspace', error, {
      workspaceId: id,
      userId: user.id,
      errorCode: error.code,
      errorDetails: error.details,
    });

    // Return null to let the caller handle the error appropriately
    // This allows for more graceful error handling in different contexts
    notFound();
  }

  const workspaceJoined = data.workspace_members.some(
    (member) => member.user_id === user.id
  );

  // Extract tier from workspace subscription - filter active subscriptions and sort by created_at
  const activeSubscriptions = (data.workspace_subscriptions || [])
    .filter((sub) => sub?.status === 'active')
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  const tier =
    activeSubscriptions?.[0]?.workspace_subscription_products?.tier || null;

  const { workspace_members: _, workspace_subscriptions: __, ...rest } = data;

  const ws = {
    ...rest,
    joined: workspaceJoined,
    tier,
  };

  return ws as Workspace & {
    joined: boolean;
    tier: WorkspaceProductTier | null;
  };
}

export async function getWorkspaces() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, personal, created_at, workspace_members!inner(user_id), workspace_subscriptions!left(created_at, status, workspace_subscription_products(tier))'
    )
    .eq('workspace_members.user_id', user.id);

  if (error) {
    logWorkspaceError('Failed to fetch user workspaces', error, {
      userId: user.id,
      errorCode: error.code,
      errorDetails: error.details,
    });
    notFound();
  }

  return data.map((ws) => {
    // Extract tier from workspace subscription - filter active subscriptions and sort by created_at
    const activeSubscriptions = (ws.workspace_subscriptions || [])
      .filter((sub) => sub?.status === 'active')
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    const tier =
      activeSubscriptions?.[0]?.workspace_subscription_products?.tier || null;

    const { workspace_subscriptions: _, ...rest } = ws;

    return {
      ...rest,
      tier,
    };
  });
}

export async function getWorkspaceInvites() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const invitesQuery = supabase
    .from('workspace_invites')
    .select('...workspaces(id, name), created_at')
    .eq('user_id', user.id);

  const emailInvitesQuery = user.email
    ? supabase
        .from('workspace_email_invites')
        .select('...workspaces(id, name), created_at')
        .ilike('email', `%${user.email}%`)
    : null;

  // use promise.all to run both queries in parallel
  const [invites, emailInvites] = await Promise.all([
    invitesQuery,
    emailInvitesQuery,
  ]);

  if (invites.error || emailInvites?.error)
    throw invites.error || emailInvites?.error;

  const data = [...invites.data, ...(emailInvites?.data || [])] as Workspace[];
  return data;
}

export async function getUnresolvedInquiriesCount() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !isValidTuturuuuEmail(user.email))
    return { count: 0, latestDate: null };

  const sbAdmin = await createAdminClient();

  const { count } = await sbAdmin
    .from('support_inquiries')
    .select('*', { count: 'exact', head: true })
    .eq('is_resolved', false);

  const { data: latestInquiry } = await sbAdmin
    .from('support_inquiries')
    .select('created_at')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    count: count || 0,
    latestDate: latestInquiry?.created_at || null,
  };
}

export function enforceRootWorkspace(
  wsId: string,
  options: {
    redirectTo?: string;
  } = {}
) {
  const resolvedWorkspaceId = resolveWorkspaceId(wsId);
  // Check if the workspace is the root workspace
  if (resolvedWorkspaceId === ROOT_WORKSPACE_ID) return;

  // If not, redirect to the provided path or 404
  if (options.redirectTo) redirect(options.redirectTo);
  else notFound();
}

export async function enforceRootWorkspaceAdmin(
  wsId: string,
  options: {
    redirectTo?: string;
  } = {}
) {
  const resolvedWorkspaceId = resolveWorkspaceId(wsId);
  enforceRootWorkspace(resolvedWorkspaceId, options);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Check if user is a member of root workspace (membership implies admin)
  const { error } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('user_id', user.id)
    .single();

  if (error) {
    if (options.redirectTo) redirect(options.redirectTo);
    else notFound();
  }
}

export async function getSecrets({
  wsId,
  forceAdmin = false,
}: {
  wsId?: string;
  forceAdmin?: boolean;
}) {
  const supabase = await (forceAdmin ? createAdminClient() : createClient());
  const queryBuilder = supabase.from('workspace_secrets').select('*');

  const resolvedWorkspaceId = wsId ? resolveWorkspaceId(wsId) : undefined;

  if (resolvedWorkspaceId) queryBuilder.eq('ws_id', resolvedWorkspaceId);

  const { data, error } = await queryBuilder.order('created_at', {
    ascending: false,
  });

  if (error) {
    logWorkspaceError('Failed to fetch workspace secrets', error, {
      workspaceId: wsId,
      errorCode: error.code,
      errorDetails: error.details,
    });
    notFound();
  }

  return data as WorkspaceSecret[];
}

export async function verifyHasSecrets(
  wsId: string,
  requiredSecrets: string[],
  redirectPath?: string
) {
  const secrets = await getSecrets({ wsId, forceAdmin: true });

  const allSecretsVerified = requiredSecrets.every((secret) => {
    const { value } = getSecret(secret, secrets) || {};
    return value === 'true';
  });

  if (!allSecretsVerified && redirectPath) redirect(redirectPath);
  return allSecretsVerified;
}

export function getSecret(
  secretName: string,
  secrets: WorkspaceSecret[]
): WorkspaceSecret | undefined {
  return secrets.find(({ name }) => name === secretName);
}

export async function verifySecret({
  wsId,
  forceAdmin = false,
  name,
  value,
}: {
  wsId: string;
  forceAdmin?: boolean;
  name: string;
  value: string;
}) {
  const secrets = await getSecrets({ wsId, forceAdmin });
  const secret = getSecret(name, secrets);
  return secret?.value === value;
}

export async function getGuestGroup({ groupId }: { groupId: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error('Unauthenticated access attempt in getGuestGroup');
    return null;
  }

  const { data, error } = await supabase.rpc('check_guest_group', {
    group_id: groupId,
  });

  if (error) {
    console.log(error);
    return null;
  }

  return data;
}
export async function getPermissions({
  wsId,
  redirectTo,
  enableNotFound,
}: {
  wsId: string;
  redirectTo?: string;
  enableNotFound?: boolean;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error('User not found');
    return {
      permissions: [],
      containsPermission: () => false,
      withoutPermission: () => true,
    };
  }

  const resolvedWorkspaceId = resolveWorkspaceId(wsId);

  // FIX: Query user's role memberships and join with permissions
  const permissionsQuery = supabase
    .from('workspace_role_members')
    .select('workspace_roles!inner(workspace_role_permissions(permission))')
    .eq('user_id', user.id)
    .eq('workspace_roles.ws_id', resolvedWorkspaceId)
    .eq('workspace_roles.workspace_role_permissions.enabled', true);

  const workspaceQuery = supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', resolvedWorkspaceId)
    .single();

  const defaultQuery = supabase
    .from('workspace_default_permissions')
    .select('permission')
    .eq('ws_id', resolvedWorkspaceId)
    .eq('enabled', true);

  const [permissionsRes, workspaceRes, defaultRes] = await Promise.all([
    permissionsQuery,
    workspaceQuery,
    defaultQuery,
  ]);

  const { data: permissionsData, error: permissionsError } = permissionsRes;
  const { data: workspaceData, error: workspaceError } = workspaceRes;
  const { data: defaultData, error: defaultError } = defaultRes;

  if (!workspaceData) {
    console.error('Workspace not found in getPermissions', resolvedWorkspaceId);
    notFound();
  }

  if (permissionsError) throw permissionsError;
  if (workspaceError) throw workspaceError;
  if (defaultError) throw defaultError;

  const isCreator = workspaceData.creator_id === user.id;
  const hasPermissions =
    permissionsData.length > 0 || defaultData.length > 0 || isCreator;

  if (DEV_MODE) {
    // console.log('--------------------');
    // console.log('Is creator', isCreator);
    // console.log('Workspace permissions', permissionsData);
    // console.log('Default permissions', defaultData);
    // console.log('Has permissions', hasPermissions);
    // console.log('--------------------');
  }

  if (!isCreator && !hasPermissions) {
    if (redirectTo) {
      // if (DEV_MODE) console.log('Redirecting to', redirectTo);
      redirect(redirectTo);
    }

    if (enableNotFound) {
      // if (DEV_MODE) console.log('Not found');
      notFound();
    }
  }

  const permissions = isCreator
    ? rolePermissions({ wsId: resolvedWorkspaceId, user }).map(({ id }) => id)
    : [
        // permissions from role memberships
        ...permissionsData.flatMap(
          (m) =>
            m.workspace_roles?.workspace_role_permissions?.map(
              (p) => p.permission
            ) || []
        ),
        // default workspace permissions
        ...defaultData.map((d) => d.permission),
      ].filter((value, index, self) => self.indexOf(value) === index);

  const containsPermission = (permission: PermissionId) =>
    isCreator || permissions.includes(permission);

  const withoutPermission = (permission: PermissionId) =>
    !isCreator && !containsPermission(permission);

  return { permissions, containsPermission, withoutPermission };
}

export async function getWorkspaceUser(id: string, userId: string) {
  const supabase = await createClient();

  const resolvedWorkspaceId = resolveWorkspaceId(id);

  const { data, error } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('ws_id', resolvedWorkspaceId)
    .eq('platform_user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching workspace user:', error);
    notFound();
  }

  return data;
}

/**
 * Check if a workspace ID corresponds to a personal workspace
 * @param workspaceId - The workspace ID to check
 * @returns true if the workspace is personal, false otherwise
 */
export async function isPersonalWorkspace(
  workspaceId: string
): Promise<boolean> {
  const supabase = await createClient();

  const resolvedWorkspaceId = resolveWorkspaceId(workspaceId);

  const { data, error } = await supabase
    .from('workspaces')
    .select('personal')
    .eq('id', resolvedWorkspaceId)
    .maybeSingle();

  if (error) {
    console.error('Error checking if workspace is personal:', error);
    return false;
  }

  return data?.personal === true;
}

export async function normalizeWorkspaceId(wsId: string): Promise<string> {
  if (wsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, workspace_members!inner(user_id)')
      .eq('personal', true)
      .eq('workspace_members.user_id', user.id)
      .maybeSingle();

    if (error || !workspace) {
      throw new Error('Personal workspace not found');
    }

    return workspace.id;
  }
  return resolveWorkspaceId(wsId);
}
