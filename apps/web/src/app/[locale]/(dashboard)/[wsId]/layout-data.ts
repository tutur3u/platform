import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  User,
  UserPrivateDetails,
  Workspace,
  WorkspaceProductTier,
} from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
} from '@tuturuuu/utils/constants';

type DashboardPrincipal = {
  email: string | null;
  id: string;
};

type WorkspaceSubscriptionData = {
  created_at: string;
  product_id?: string | null;
  status?: string | null;
};

type WorkspaceSubscriptionProductTierRow = {
  id: string;
  tier: WorkspaceProductTier | null;
};

type WorkspaceWithMembers = Workspace & {
  workspace_members?: { user_id: string }[] | null;
};

export type DashboardLayoutUser = (User & UserPrivateDetails) | WorkspaceUser;

export type DashboardLayoutWorkspace = Workspace & {
  joined: boolean;
  tier: WorkspaceProductTier | null;
};

async function createDashboardSupabaseClient() {
  const { createClient } = await import('@tuturuuu/supabase/next/server');

  return createClient();
}

async function createDashboardAdminClient(options?: { noCookie?: boolean }) {
  const { createAdminClient } = await import('@tuturuuu/supabase/next/server');

  return createAdminClient(options);
}

function isWorkspaceUuidLiteral(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
    value.trim()
  );
}

function isDirectWorkspaceLookupIdentifier(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  const workspaceHandlePattern = /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/u;

  return (
    normalized === PERSONAL_WORKSPACE_SLUG.toLowerCase() ||
    normalized === ROOT_WORKSPACE_ID.toLowerCase() ||
    normalized === 'internal' ||
    isWorkspaceUuidLiteral(normalized) ||
    workspaceHandlePattern.test(normalized)
  );
}

async function resolveDashboardPrincipal(
  supabase: TypedSupabaseClient
): Promise<DashboardPrincipal | null> {
  if (typeof supabase.auth.getClaims === 'function') {
    try {
      const claimsResult = await supabase.auth.getClaims();
      const claimsData = claimsResult?.data;
      const claimsError = claimsResult?.error;

      if (!claimsError && claimsData?.claims?.sub) {
        return {
          email:
            typeof claimsData.claims.email === 'string'
              ? claimsData.claims.email
              : null,
          id: claimsData.claims.sub,
        };
      }
    } catch {
      // Older local Supabase clients can omit getClaims; getUser is the fallback.
    }
  }

  const userResult = await supabase.auth.getUser();
  const user = userResult?.data?.user ?? null;

  if (!user) return null;

  return {
    email: user.email ?? null,
    id: user.id,
  };
}

async function getDashboardLayoutUser(
  supabase: TypedSupabaseClient,
  userId: string
): Promise<DashboardLayoutUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select(
      'id, display_name, avatar_url, bio, handle, created_at, user_private_details(email, new_email, birthday, full_name, default_workspace_id)'
    )
    .eq('id', userId)
    .single();

  if (error || !data) return null;

  const { user_private_details, ...rest } = data;

  return { ...rest, ...user_private_details } as DashboardLayoutUser;
}

function extractTierFromSubscriptions(
  subscriptions: WorkspaceSubscriptionData[] | null | undefined,
  productTiersById: Map<string, WorkspaceProductTier | null>
): WorkspaceProductTier | null {
  if (!subscriptions) return null;

  const activeSubscriptions = subscriptions
    .filter((subscription) => subscription?.status === 'active')
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  const activeSubscription = activeSubscriptions[0];

  if (!activeSubscription?.product_id) return null;

  return productTiersById.get(activeSubscription.product_id) ?? null;
}

async function getDashboardWorkspaceTier(
  workspaceId: string
): Promise<WorkspaceProductTier | null> {
  const sbAdmin = await createDashboardAdminClient();
  const { data: subscriptions, error } = await sbAdmin
    .from('workspace_subscriptions')
    .select('created_at, status, product_id')
    .eq('ws_id', workspaceId);

  if (error || !subscriptions?.length) return null;

  const productIds = [
    ...new Set(
      (subscriptions as WorkspaceSubscriptionData[])
        .map((subscription) => subscription.product_id)
        .filter((productId): productId is string => Boolean(productId))
    ),
  ];
  const productTiersById = new Map<string, WorkspaceProductTier | null>();

  if (productIds.length > 0) {
    const { data: products, error: productsError } = await sbAdmin
      .schema('private')
      .from('workspace_subscription_products')
      .select('id, tier')
      .in('id', productIds);

    if (!productsError) {
      for (const product of (products ??
        []) as WorkspaceSubscriptionProductTierRow[]) {
        productTiersById.set(product.id, product.tier);
      }
    }
  }

  return extractTierFromSubscriptions(
    subscriptions as WorkspaceSubscriptionData[],
    productTiersById
  );
}

async function getDashboardLayoutWorkspace(
  id: string,
  principal: DashboardPrincipal
): Promise<DashboardLayoutWorkspace | null> {
  if (!isDirectWorkspaceLookupIdentifier(id)) return null;

  const workspaceClient = await createDashboardAdminClient({ noCookie: true });
  const queryBuilder = workspaceClient
    .from('workspaces')
    .select('*, workspace_members!inner(user_id)');
  const resolvedWorkspaceId = resolveWorkspaceId(id);

  if (id.toUpperCase() === PERSONAL_WORKSPACE_SLUG.toUpperCase()) {
    queryBuilder
      .eq('personal', true)
      .eq('workspace_members.user_id', principal.id);
  } else if (isWorkspaceUuidLiteral(resolvedWorkspaceId)) {
    queryBuilder.eq('id', resolvedWorkspaceId);
  } else {
    queryBuilder.eq('handle', id.trim().toLowerCase());
  }

  const { data, error } = await queryBuilder.single();

  if (error || !data) return null;

  const { workspace_members: workspaceMembers, ...workspace } =
    data as WorkspaceWithMembers;
  const joined = Boolean(
    workspaceMembers?.some((member) => member.user_id === principal.id)
  );
  const tier = await getDashboardWorkspaceTier(workspace.id);

  return {
    ...workspace,
    joined,
    tier,
  };
}

export async function getDashboardLayoutData(id: string): Promise<{
  user: DashboardLayoutUser | null;
  workspace: DashboardLayoutWorkspace | null;
}> {
  const supabase = await createDashboardSupabaseClient();
  const principal = await resolveDashboardPrincipal(
    supabase as TypedSupabaseClient
  );

  if (!principal) {
    return {
      user: null,
      workspace: null,
    };
  }

  const [user, workspace] = await Promise.all([
    getDashboardLayoutUser(supabase as TypedSupabaseClient, principal.id),
    getDashboardLayoutWorkspace(id, principal),
  ]);

  return {
    user,
    workspace,
  };
}
