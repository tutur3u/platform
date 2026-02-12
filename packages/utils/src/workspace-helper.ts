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
 * Type for workspace subscription data from Supabase queries
 */
interface WorkspaceSubscriptionData {
  created_at: string;
  status?: string | null;
  workspace_subscription_products?: {
    tier?: WorkspaceProductTier | null;
  } | null;
}

/**
 * Extracts the tier from workspace subscription data.
 * Filters for active subscriptions and returns the tier from the most recent one.
 *
 * @param subscriptions - Array of workspace subscription data from Supabase
 * @returns The tier from the most recent active subscription, or null if none found
 */
export function extractTierFromSubscriptions(
  subscriptions: (WorkspaceSubscriptionData | null)[] | null | undefined
): WorkspaceProductTier | null {
  if (!subscriptions) return null;

  const activeSubscriptions = subscriptions
    .filter(
      (sub): sub is WorkspaceSubscriptionData =>
        sub !== null && sub?.status === 'active'
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  return (
    activeSubscriptions?.[0]?.workspace_subscription_products?.tier || null
  );
}

/**
 * Gets the workspace tier for a user by their creator ID.
 * Useful for API routes to check tier requirements without full workspace context.
 *
 * @param creatorId - The user ID of the workspace creator
 * @param options - Optional configuration
 * @returns The workspace tier or 'FREE' as default
 */
export async function getWorkspaceTierByCreator(
  creatorId: string,
  options: { useAdmin?: boolean } = {}
): Promise<WorkspaceProductTier> {
  const supabase = await (options.useAdmin
    ? createAdminClient()
    : createClient());

  const { data } = await supabase
    .from('workspaces')
    .select(
      'id, workspace_subscriptions!left(created_at, status, workspace_subscription_products(tier))'
    )
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return extractTierFromSubscriptions(data?.workspace_subscriptions) || 'FREE';
}

/**
 * Gets the workspace tier by workspace ID.
 * Useful for API routes to check tier requirements.
 *
 * @param wsId - The workspace ID to check
 * @param options - Optional configuration
 * @returns The workspace tier or 'FREE' as default
 */
export async function getWorkspaceTier(
  wsId: string,
  options: { useAdmin?: boolean } = {}
): Promise<WorkspaceProductTier> {
  const supabase = await (options.useAdmin
    ? createAdminClient()
    : createClient());

  const resolvedWorkspaceId = resolveWorkspaceId(wsId);

  const { data } = await supabase
    .from('workspaces')
    .select(
      'id, workspace_subscriptions!left(created_at, status, workspace_subscription_products(tier))'
    )
    .eq('id', resolvedWorkspaceId)
    .maybeSingle();

  return extractTierFromSubscriptions(data?.workspace_subscriptions) || 'FREE';
}

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
export async function getWorkspace(
  id: string,
  options: { useAdmin?: boolean } = {}
) {
  const supabase = await createClient();
  const sbAdmin = options.useAdmin ? await createAdminClient() : supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const queryBuilder = sbAdmin
    .from('workspaces')
    .select(
      '*, workspace_members!inner(user_id), workspace_subscriptions!left(created_at, status, workspace_subscription_products(tier))'
    );

  const resolvedWorkspaceId = resolveWorkspaceId(id);

  if (id.toUpperCase() === 'PERSONAL') {
    queryBuilder.eq('personal', true).eq('workspace_members.user_id', user.id);
  } else {
    queryBuilder.eq('id', resolvedWorkspaceId);
  }

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

export async function getWorkspaces(options: { useAdmin?: boolean } = {}) {
  const supabase = await createClient();
  const sbAdmin = options.useAdmin ? await createAdminClient() : supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await sbAdmin
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

  const sbAdmin = await createAdminClient();

  // Handle "personal" workspace slug by looking up the user's personal workspace
  let resolvedWorkspaceId: string;
  if (wsId.toUpperCase() === PERSONAL_WORKSPACE_SLUG.toUpperCase()) {
    const { data: personalWorkspace } = await sbAdmin
      .from('workspaces')
      .select('id')
      .eq('personal', true)
      .eq('creator_id', user.id)
      .single();

    if (!personalWorkspace) {
      console.error('Personal workspace not found for user', user.id);
      notFound();
    }

    resolvedWorkspaceId = personalWorkspace.id;
  } else {
    resolvedWorkspaceId = resolveWorkspaceId(wsId);
  }

  const permissionsQuery = sbAdmin
    .from('workspace_role_members')
    .select('workspace_roles!inner(workspace_role_permissions(permission))')
    .eq('user_id', user.id)
    .eq('workspace_roles.ws_id', resolvedWorkspaceId)
    .eq('workspace_roles.workspace_role_permissions.enabled', true);

  const workspaceQuery = sbAdmin
    .from('workspaces')
    .select('creator_id')
    .eq('id', resolvedWorkspaceId)
    .single();

  const defaultQuery = sbAdmin
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

  // if (DEV_MODE) {
  //   console.log('--------------------');
  //   console.log('Is creator', isCreator);
  //   console.log('Workspace permissions', permissionsData);
  //   console.log('Default permissions', defaultData);
  //   console.log('Has permissions', hasPermissions);
  //   console.log('--------------------');
  // }

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

  const isAdmin = permissions.includes('admin');

  const containsPermission = (permission: PermissionId) => {
    const hasPermission =
      isCreator || isAdmin || permissions.includes(permission);
    // console.log(permission, 'is allowed:', hasPermission);
    return hasPermission;
  };

  const withoutPermission = (permission: PermissionId) =>
    !containsPermission(permission);

  return { permissions, containsPermission, withoutPermission };
}

export interface GetWorkspaceUserOptions {
  /**
   * If true (default), automatically creates a missing workspace_user_linked_users entry
   * when a workspace member doesn't have one. This uses the ensure_workspace_user_link RPC.
   */
  autoRepair?: boolean;
}

/**
 * Gets the workspace user link for a specific user in a workspace.
 * Optionally auto-repairs missing links (enabled by default).
 *
 * @param id - The workspace ID (can be a UUID or special identifier like 'personal')
 * @param userId - The platform user ID to look up
 * @param options - Configuration options
 * @returns The workspace user link data
 * @throws notFound() if not found and auto-repair fails
 */
export async function getWorkspaceUser(
  id: string,
  userId: string,
  options: GetWorkspaceUserOptions = {}
) {
  const { autoRepair = true } = options;
  const supabase = await createClient();

  const resolvedWorkspaceId = resolveWorkspaceId(id);

  // First attempt to get the workspace user link
  const { data, error } = await supabase
    .from('workspace_user_linked_users')
    .select('*')
    .eq('ws_id', resolvedWorkspaceId)
    .eq('platform_user_id', userId)
    .single();

  // If found, return it
  if (data && !error) {
    return data;
  }

  // If not found and auto-repair is disabled, throw
  if (!autoRepair) {
    console.error('Error fetching workspace user:', error);
    notFound();
  }

  // Check if user is a workspace member first
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('user_id', userId)
    .eq('ws_id', resolvedWorkspaceId)
    .maybeSingle();

  // Not a member, can't create a link
  if (!membership) {
    console.error(
      'User is not a workspace member, cannot create workspace user link:',
      { userId, wsId: resolvedWorkspaceId }
    );
    notFound();
  }

  // Try to repair the missing link using the RPC function
  try {
    const sbAdmin = await createAdminClient();
    // Note: ensure_workspace_user_link is defined in migration 20260112060000
    // Using type assertion since RPC types are generated after migration is applied
    const rpc = sbAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ error: Error | null }>;
    const { error: repairError } = await rpc('ensure_workspace_user_link', {
      target_user_id: userId,
      target_ws_id: resolvedWorkspaceId,
    });

    if (repairError) {
      console.error(
        '[getWorkspaceUser] Failed to auto-repair workspace user link:',
        repairError
      );
      notFound();
    }

    // Fetch the newly created link
    const { data: repairedData, error: fetchError } = await supabase
      .from('workspace_user_linked_users')
      .select('*')
      .eq('ws_id', resolvedWorkspaceId)
      .eq('platform_user_id', userId)
      .single();

    if (fetchError || !repairedData) {
      console.error(
        '[getWorkspaceUser] Failed to fetch repaired workspace user link:',
        fetchError
      );
      notFound();
    }

    return repairedData;
  } catch (err) {
    console.error('[getWorkspaceUser] Error during auto-repair:', err);
    notFound();
  }
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

/**
 * Fetches a workspace configuration by ID.
 *
 * @param wsId - The workspace ID
 * @param configId - The configuration ID
 * @returns The configuration value or null if not found
 */
export async function getWorkspaceConfig(
  wsId: string,
  configId: string
): Promise<string | null> {
  const sbAdmin = await createAdminClient();

  const resolvedWorkspaceId = await normalizeWorkspaceId(wsId);

  const { data, error } = await sbAdmin
    .from('workspace_configs')
    .select('value')
    .eq('ws_id', resolvedWorkspaceId)
    .eq('id', configId)
    .maybeSingle();

  if (error) {
    logWorkspaceError('Failed to fetch workspace config', error, {
      workspaceId: wsId,
      configId,
      errorCode: error.code,
    });
    return null;
  }

  return data?.value || null;
}
