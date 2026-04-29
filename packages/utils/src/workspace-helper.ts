import { ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID } from '@tuturuuu/internal-api/workspace-configs';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  PermissionId,
  Workspace,
  WorkspaceProductTier,
} from '@tuturuuu/types';
import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import type { NextRequest } from 'next/server';
import { validate as validateUUID } from 'uuid';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from './constants';
import { isValidTuturuuuEmail } from './email/client';
import { permissions as rolePermissions } from './permissions';

export class WorkspaceAuthError extends Error {
  constructor(message = 'User not authenticated') {
    super(message);
    this.name = 'WorkspaceAuthError';
  }
}

export class WorkspaceAccessError extends Error {
  constructor(message = 'Workspace access denied') {
    super(message);
    this.name = 'WorkspaceAccessError';
  }
}

export type WorkspaceMemberType = 'MEMBER' | 'GUEST';

/** Use `'ANY'` when any workspace_members row (MEMBER or GUEST) should count as access. */
export type WorkspaceMembershipRequiredType = WorkspaceMemberType | 'ANY';

export type WorkspaceMembershipCheckError =
  | 'membership_lookup_failed'
  | 'membership_missing'
  | 'membership_type_mismatch';

export interface WorkspaceMembershipCheckResult {
  ok: boolean;
  error?: WorkspaceMembershipCheckError;
  membershipType?: WorkspaceMemberType;
}

export class WorkspaceRedirectRequiredError extends Error {
  public readonly redirectTo: string;

  constructor(redirectTo: string, message = 'Workspace redirect required') {
    super(message);
    this.name = 'WorkspaceRedirectRequiredError';
    this.redirectTo = redirectTo;
  }
}

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

function isDirectWorkspaceLookupIdentifier(id: string): boolean {
  const normalized = id.trim().toLowerCase();

  return (
    normalized === PERSONAL_WORKSPACE_SLUG.toLowerCase() ||
    normalized === ROOT_WORKSPACE_ID.toLowerCase() ||
    normalized === 'internal' ||
    validateUUID(normalized)
  );
}

async function resolveAuthenticatedPrincipal(
  supabase: TypedSupabaseClient
): Promise<{ id: string; email: string | null } | null> {
  try {
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    if (!claimsError && claimsData?.claims?.sub) {
      return {
        id: claimsData.claims.sub,
        email:
          typeof claimsData.claims.email === 'string'
            ? claimsData.claims.email
            : null,
      };
    }
  } catch {
    console.warn(
      '[resolveAuthenticatedPrincipal] getClaims is unavailable, falling back to getUser. This may be expected in testing environments or older Supabase clients.'
    );
    // Fall back to getUser when getClaims is unavailable in mocks/older clients.
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return { id: user.id, email: user.email ?? null };
}

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

interface WorkspaceSubscriptionTierLookupRow extends WorkspaceSubscriptionData {
  ws_id: string;
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

async function getWorkspaceTierMap(
  workspaceIds: string[]
): Promise<Map<string, WorkspaceProductTier | null>> {
  if (workspaceIds.length === 0) return new Map();

  const sbAdmin = await createAdminClient();
  const { data, error } = await sbAdmin
    .from('workspace_subscriptions')
    .select('ws_id, created_at, status, workspace_subscription_products(tier)')
    .in('ws_id', workspaceIds);

  if (error) {
    logWorkspaceError('Failed to fetch workspace subscription tiers', error, {
      workspaceIds,
      errorCode: error.code,
      errorDetails: error.details,
    });
    return new Map(
      workspaceIds.map((workspaceId) => [workspaceId, null] as const)
    );
  }

  const subscriptionsByWorkspace = new Map<
    string,
    WorkspaceSubscriptionData[]
  >();

  for (const subscription of (data ??
    []) as WorkspaceSubscriptionTierLookupRow[]) {
    const current = subscriptionsByWorkspace.get(subscription.ws_id) ?? [];
    current.push(subscription);
    subscriptionsByWorkspace.set(subscription.ws_id, current);
  }

  return new Map(
    workspaceIds.map((workspaceId) => [
      workspaceId,
      extractTierFromSubscriptions(
        subscriptionsByWorkspace.get(workspaceId) ?? null
      ),
    ])
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
    .select('id')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.id) return 'FREE';

  const tierMap = await getWorkspaceTierMap([data.id]);
  return tierMap.get(data.id) || 'FREE';
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
    .select('id')
    .eq('id', resolvedWorkspaceId)
    .maybeSingle();

  if (!data?.id) return 'FREE';

  const tierMap = await getWorkspaceTierMap([data.id]);
  return tierMap.get(data.id) || 'FREE';
}

/**
 * Fetches a workspace by ID or the 'PERSONAL' keyword.
 *
 * @param id - Workspace ID (UUID) or 'PERSONAL' to fetch the current user's personal workspace.
 *
 * @returns The workspace object with a `joined` boolean indicating membership status.
 *
 * Returns `null` when the user is not authenticated or the workspace cannot be fetched.
 * Callers are responsible for handling navigation/response behavior.
 */
export async function getWorkspace(
  id: string,
  options: { useAdmin?: boolean } = {}
): Promise<
  | (Workspace & {
      joined: boolean;
      tier: WorkspaceProductTier | null;
    })
  | null
> {
  if (!isDirectWorkspaceLookupIdentifier(id)) {
    return null;
  }

  const supabase = await createClient();
  const sbAdmin = options.useAdmin ? await createAdminClient() : supabase;
  const principal = await resolveAuthenticatedPrincipal(supabase);

  if (!principal) return null;

  const queryBuilder = sbAdmin
    .from('workspaces')
    .select('*, workspace_members!inner(user_id)');

  const resolvedWorkspaceId = resolveWorkspaceId(id);

  if (id.toUpperCase() === 'PERSONAL') {
    queryBuilder
      .eq('personal', true)
      .eq('workspace_members.user_id', principal.id);
  } else {
    queryBuilder.eq('id', resolvedWorkspaceId);
  }

  const { data, error } = await queryBuilder.single();

  // If there's an error, log it for debugging with structured logging
  if (error) {
    logWorkspaceError('Failed to fetch workspace', error, {
      workspaceId: id,
      userId: principal.id,
      errorCode: error.code,
      errorDetails: error.details,
    });

    return null;
  }

  const workspaceJoined = data.workspace_members.some(
    (member) => member.user_id === principal.id
  );
  const tierMap = await getWorkspaceTierMap([data.id]);
  const tier = tierMap.get(data.id) ?? null;

  const { workspace_members: _, ...rest } = data;

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
  const principal = await resolveAuthenticatedPrincipal(supabase);

  if (!principal) return null;

  const { data, error } = await sbAdmin
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, personal, created_at, workspace_members!inner(user_id)'
    )
    .eq('workspace_members.user_id', principal.id);

  if (error) {
    logWorkspaceError('Failed to fetch user workspaces', error, {
      userId: principal.id,
      errorCode: error.code,
      errorDetails: error.details,
    });
    return null;
  }

  const tierMap = await getWorkspaceTierMap(
    data.map((workspace) => workspace.id)
  );

  return data.map((ws) => {
    return {
      ...ws,
      tier: tierMap.get(ws.id) ?? null,
    };
  });
}

export async function getWorkspaceInvites() {
  const supabase = await createClient();
  const principal = await resolveAuthenticatedPrincipal(supabase);

  if (!principal) return null;

  const invitesQuery = supabase
    .from('workspace_invites')
    .select('...workspaces(id, name), created_at')
    .eq('user_id', principal.id);

  const emailInvitesQuery = principal.email
    ? supabase
        .from('workspace_email_invites')
        .select('...workspaces(id, name), created_at')
        .ilike('email', `%${principal.email}%`)
    : null;

  // use promise.all to run both queries in parallel
  const [invites, emailInvites] = await Promise.all([
    invitesQuery,
    emailInvitesQuery,
  ]);

  if (invites.error || emailInvites?.error) return null;

  const data = [...invites.data, ...(emailInvites?.data || [])] as Workspace[];
  return data;
}

export async function getUnresolvedInquiriesCount() {
  const supabase = await createClient();
  const principal = await resolveAuthenticatedPrincipal(supabase);

  if (!principal?.email || !isValidTuturuuuEmail(principal.email))
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

  if (options.redirectTo) {
    throw new WorkspaceRedirectRequiredError(options.redirectTo);
  }

  throw new WorkspaceAccessError('Root workspace required');
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
  const principal = await resolveAuthenticatedPrincipal(supabase);

  if (!principal) throw new WorkspaceAuthError();

  const membership = await verifyWorkspaceMembershipType({
    wsId: ROOT_WORKSPACE_ID,
    userId: principal.id,
    supabase,
  });

  if (membership.error === 'membership_lookup_failed' || !membership.ok) {
    if (options.redirectTo) {
      throw new WorkspaceRedirectRequiredError(options.redirectTo);
    }

    throw new WorkspaceAccessError('Root workspace admin required');
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
    return null;
  }

  return data as WorkspaceSecret[];
}

export async function verifyHasSecrets(
  wsId: string,
  requiredSecrets: string[]
) {
  const secrets = await getSecrets({ wsId, forceAdmin: true });
  if (!secrets) return false;

  const allSecretsVerified = requiredSecrets.every((secret) => {
    const { value } = getSecret(secret, secrets) || {};
    return value === 'true';
  });

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
  if (!secrets) return false;
  const secret = getSecret(name, secrets);
  return secret?.value === value;
}

export async function getGuestGroup({ groupId }: { groupId: string }) {
  const supabase = await createClient();
  const principal = await resolveAuthenticatedPrincipal(supabase);

  if (!principal) {
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

export interface PermissionsResult {
  permissions: PermissionId[];
  containsPermission(permission: PermissionId): boolean;
  withoutPermission(permission: PermissionId): boolean;
}

export async function getPermissions({
  wsId,
  request,
}: {
  wsId: string;
  request?: Request;
}): Promise<PermissionsResult | null> {
  const supabase = await (request ? createClient(request) : createClient());

  const principal = await resolveAuthenticatedPrincipal(supabase);

  if (!principal) {
    console.error('User not found');
    return null;
  }

  const userId = principal.id;

  const sbAdmin = await createAdminClient();

  // Handle "personal" workspace slug by looking up the user's personal workspace
  let resolvedWorkspaceId: string;
  try {
    resolvedWorkspaceId = await normalizeWorkspaceId(wsId, supabase);
  } catch {
    return null;
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: resolvedWorkspaceId,
    userId,
    supabase,
  });

  if (!membership.ok) {
    return null;
  }

  const permissionsQuery = sbAdmin
    .from('workspace_role_members')
    .select('workspace_roles!inner(workspace_role_permissions(permission))')
    .eq('user_id', userId)
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
    console.info('Workspace not found in getPermissions', resolvedWorkspaceId);
    return null;
  }

  if (permissionsError) return null;
  if (workspaceError) return null;
  if (defaultError) return null;

  const isCreator = workspaceData.creator_id === userId;
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
    return null;
  }

  const permissions = isCreator
    ? rolePermissions({
        wsId: resolvedWorkspaceId,
        user: { id: userId } as SupabaseUser,
      }).map(({ id }) => id)
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

export async function verifyWorkspaceMembershipType({
  requiredType = 'MEMBER',
  supabase,
  userId,
  wsId,
}: {
  wsId: string;
  userId: string;
  supabase: TypedSupabaseClient;
  requiredType?: WorkspaceMembershipRequiredType;
}): Promise<WorkspaceMembershipCheckResult> {
  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select('type')
    .eq('ws_id', wsId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: 'membership_lookup_failed' };
  }

  if (!membership) {
    return { ok: false, error: 'membership_missing' };
  }

  const membershipType = membership.type;

  if (requiredType === 'ANY') {
    return {
      ok: true,
      membershipType,
    };
  }

  if (membershipType !== requiredType) {
    return {
      ok: false,
      error: 'membership_type_mismatch',
      membershipType,
    };
  }

  return {
    ok: true,
    membershipType,
  };
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
 * @returns The workspace user link data or null if not found/repairable
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
    return null;
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: resolvedWorkspaceId,
    userId,
    supabase,
    requiredType: 'MEMBER',
  });

  if (!membership.ok) {
    console.error(
      'User is not a workspace member, cannot create workspace user link:',
      { userId, wsId: resolvedWorkspaceId }
    );
    return null;
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
      return null;
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
      return null;
    }

    return repairedData;
  } catch (err) {
    console.error('[getWorkspaceUser] Error during auto-repair:', err);
    return null;
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

export async function normalizeWorkspaceId(
  wsId: string,
  supabase?: TypedSupabaseClient,
  request?: NextRequest
): Promise<string> {
  // Use provided client, or create one from request (for mobile Bearer auth)
  // or fall back to cookie-based client
  const sb =
    supabase ??
    (request != null ? await createClient(request) : await createClient());
  const resolvedWorkspaceId = resolveWorkspaceId(wsId);

  if (resolvedWorkspaceId === ROOT_WORKSPACE_ID) {
    return ROOT_WORKSPACE_ID;
  }

  if (wsId.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    const principal = await resolveAuthenticatedPrincipal(sb);

    if (!principal) {
      throw new Error('User not authenticated');
    }

    const userId = principal.id;

    const { data: workspace, error } = await sb
      .from('workspaces')
      .select('id, workspace_members!inner(user_id, type)')
      .eq('personal', true)
      .eq('workspace_members.user_id', userId)
      .eq('workspace_members.type', 'MEMBER')
      .maybeSingle();

    if (error || !workspace) {
      throw new Error('Personal workspace not found');
    }

    return workspace.id;
  }

  return resolvedWorkspaceId;
}

/**
 * Fetches a workspace configuration by ID.
 *
 * @param wsId - The workspace ID
 * @param configId - The configuration ID
 * @returns The configuration value or null if not found
 */
async function fetchWorkspaceConfigValue(
  wsId: string,
  configId: string
): Promise<{ error: unknown; value: string | null }> {
  const sbAdmin = await createAdminClient();

  // Skip normalization if already a valid UUID (avoids auth check in admin context)
  const resolvedWorkspaceId = validateUUID(wsId)
    ? wsId
    : await normalizeWorkspaceId(wsId);

  const { data, error } = await sbAdmin
    .from('workspace_configs')
    .select('value')
    .eq('ws_id', resolvedWorkspaceId)
    .eq('id', configId)
    .maybeSingle();

  return {
    error,
    value: data?.value || null,
  };
}

export async function getWorkspaceConfig(
  wsId: string,
  configId: string
): Promise<string | null> {
  const { error, value } = await fetchWorkspaceConfigValue(wsId, configId);

  if (error) {
    logWorkspaceError('Failed to fetch workspace config', error, {
      workspaceId: wsId,
      configId,
      errorCode:
        typeof error === 'object' && 'code' in error ? error.code : undefined,
    });
    return null;
  }

  return value;
}

/** Result of {@link getWorkspaceNonMemberInviteEligibility} (user not in `workspace_members` yet). */
export type WorkspaceNonMemberInviteEligibility = {
  /** Set when `workspace_invites` or `workspace_email_invites` has a row for this user. */
  hasPendingInvite: boolean;
  /**
   * Guest self-join is allowed: workspace config is on and
   * `resolve_guest_self_join_candidate` returns eligible.
   */
  allowGuestSelfJoin: boolean;
};

type GuestSelfJoinCandidateRpcRow = {
  eligible: boolean;
  matched_email_source: string | null;
  reason: string | null;
  virtual_user_id: string | null;
};

export type GuestSelfJoinCandidateResult = {
  allowGuestSelfJoin: boolean;
  candidateEmails: string[];
  guestSelfJoinEnabled: boolean;
  matchedEmailSource: string | null;
  reason: string | null;
  virtualUserId: string | null;
};

export async function resolveGuestSelfJoinCandidate(
  supabase: TypedSupabaseClient,
  params: {
    authEmail: string | null;
    rpcSupabase: TypedSupabaseClient;
    privateEmail?: string | null;
    userId: string;
    workspaceId: string;
  }
): Promise<GuestSelfJoinCandidateResult> {
  const { authEmail, privateEmail, rpcSupabase, userId, workspaceId } = params;
  const authEmailNorm = authEmail?.trim().toLowerCase() || null;

  let privateEmailNorm =
    typeof privateEmail === 'string'
      ? privateEmail.trim().toLowerCase() || null
      : null;

  if (privateEmail === undefined) {
    const { data: privateDetails, error: privateDetailsError } = await supabase
      .from('user_private_details')
      .select('email')
      .eq('user_id', userId)
      .maybeSingle();

    if (privateDetailsError) {
      logWorkspaceError(
        'Failed to fetch private email for guest self-join candidate',
        privateDetailsError,
        {
          userId,
          workspaceId,
          errorCode: privateDetailsError.code,
        }
      );
      throw privateDetailsError;
    }

    privateEmailNorm = privateDetails?.email?.trim().toLowerCase() || null;
  }

  const candidateEmails = [
    ...new Set([authEmailNorm, privateEmailNorm]),
  ].filter(
    (email): email is string => typeof email === 'string' && email.length > 0
  );

  const guestSelfJoinConfig = await fetchWorkspaceConfigValue(
    workspaceId,
    ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID
  );

  if (guestSelfJoinConfig.error) {
    logWorkspaceError(
      'Failed to fetch guest self-join workspace config',
      guestSelfJoinConfig.error,
      {
        workspaceId,
        configId: ENABLE_GUEST_SELF_JOIN_FROM_WORKSPACE_USER_EMAIL_CONFIG_ID,
      }
    );
    throw guestSelfJoinConfig.error;
  }

  const guestSelfJoinEnabled =
    guestSelfJoinConfig.value?.trim().toLowerCase() === 'true';

  if (!guestSelfJoinEnabled) {
    return {
      allowGuestSelfJoin: false,
      candidateEmails,
      guestSelfJoinEnabled,
      matchedEmailSource: null,
      reason: null,
      virtualUserId: null,
    };
  }

  const { data: guestCandidate, error: guestCandidateError } =
    await rpcSupabase.rpc('resolve_guest_self_join_candidate', {
      p_user_id: userId,
      p_ws_id: workspaceId,
    });

  if (guestCandidateError) {
    logWorkspaceError(
      'Failed to resolve guest self-join candidate',
      guestCandidateError,
      {
        userId,
        workspaceId,
        hasAuthEmail: authEmailNorm !== null,
        hasPrivateEmail: privateEmailNorm !== null,
      }
    );
    throw guestCandidateError;
  }

  const candidate = (guestCandidate?.[0] ??
    null) as GuestSelfJoinCandidateRpcRow | null;

  if (
    candidate?.reason === 'unauthorized' ||
    candidate?.reason === 'forbidden'
  ) {
    logWorkspaceError(
      'Guest self-join candidate RPC denied authorization',
      new Error(candidate.reason),
      {
        userId,
        workspaceId,
        reason: candidate.reason,
      }
    );
  }

  return {
    allowGuestSelfJoin: candidate?.eligible === true,
    candidateEmails,
    guestSelfJoinEnabled,
    matchedEmailSource: candidate?.matched_email_source ?? null,
    reason: candidate?.reason ?? null,
    virtualUserId: candidate?.virtual_user_id ?? null,
  };
}

/**
 * Whether the workspace invite/accept flow may be shown (matches what
 * `POST /api/workspaces/:wsId/accept-invite` can accept without `NO_PENDING_INVITE_FOUND`).
 */
export function canShowWorkspaceInviteForNonMember(
  eligibility: WorkspaceNonMemberInviteEligibility
): boolean {
  return eligibility.hasPendingInvite || eligibility.allowGuestSelfJoin;
}

/**
 * For a user who is not yet a member of the workspace, determines if they have a pending
 * direct/email invite and/or are eligible for guest self-join. Use with
 * {@link canShowWorkspaceInviteForNonMember} before rendering the invite card.
 *
 * @param supabase - Prefer the service-role / admin client so invite rows are visible regardless of RLS.
 */
export async function getWorkspaceNonMemberInviteEligibility(
  supabase: TypedSupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    authEmail: string | null;
    /** Authenticated request-scoped client used for RPCs that depend on auth.uid(). */
    rpcSupabase: TypedSupabaseClient;
  }
): Promise<WorkspaceNonMemberInviteEligibility> {
  const { workspaceId, userId, authEmail, rpcSupabase } = params;
  const guestSelfJoinCandidate = await resolveGuestSelfJoinCandidate(supabase, {
    authEmail,
    rpcSupabase,
    userId,
    workspaceId,
  });

  const { data: pendingUserInvite, error: pendingUserInviteError } =
    await supabase
      .from('workspace_invites')
      .select('ws_id')
      .eq('ws_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();

  if (pendingUserInviteError) {
    logWorkspaceError(
      'Failed to fetch pending workspace invite',
      pendingUserInviteError,
      {
        userId,
        workspaceId,
        errorCode: pendingUserInviteError.code,
      }
    );
    throw pendingUserInviteError;
  }

  const candidateEmails = guestSelfJoinCandidate.candidateEmails;

  const { data: pendingEmailInvites, error: pendingEmailInvitesError } =
    candidateEmails.length
      ? await supabase
          .from('workspace_email_invites')
          .select('ws_id')
          .eq('ws_id', workspaceId)
          .in('email', candidateEmails)
      : { data: null, error: null };

  if (pendingEmailInvitesError) {
    logWorkspaceError(
      'Failed to fetch pending workspace email invites',
      pendingEmailInvitesError,
      {
        workspaceId,
        candidateEmailCount: candidateEmails.length,
        errorCode: pendingEmailInvitesError.code,
      }
    );
    throw pendingEmailInvitesError;
  }

  const hasPendingEmailInvite =
    Array.isArray(pendingEmailInvites) && pendingEmailInvites.length > 0;

  const hasPendingInvite = !!(pendingUserInvite || hasPendingEmailInvite);

  return {
    allowGuestSelfJoin: guestSelfJoinCandidate.allowGuestSelfJoin,
    hasPendingInvite,
  };
}
