'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';

const WORKSPACE_SUMMARY_UNAUTHORIZED = 'WORKSPACE_SUMMARY_UNAUTHORIZED';

function normalizeWorkspaceTier(
  tier: string | null | undefined
): InternalApiWorkspaceSummary['tier'] {
  switch (tier) {
    case 'FREE':
    case 'PLUS':
    case 'PRO':
    case 'ENTERPRISE':
      return tier;
    default:
      return null;
  }
}

function resolveWorkspaceTier(workspace: {
  workspace_subscriptions?: Array<{
    created_at?: string | null;
    status?: string | null;
    workspace_subscription_products?:
      | { tier?: string | null }
      | Array<{ tier?: string | null }>
      | null;
  }> | null;
}) {
  const activeSubscriptions =
    workspace.workspace_subscriptions
      ?.filter((subscription) => subscription?.status === 'active')
      .sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime()
      ) ?? [];

  for (const subscription of activeSubscriptions) {
    const product = subscription.workspace_subscription_products;

    if (product && !Array.isArray(product) && product.tier) {
      return normalizeWorkspaceTier(product.tier);
    }

    if (Array.isArray(product)) {
      const tier = product.find((entry) => entry?.tier)?.tier;
      if (tier) {
        return normalizeWorkspaceTier(tier);
      }
    }
  }

  return null;
}

export async function fetchWorkspaceSummaries({
  requireAuth = false,
  request,
}: {
  requireAuth?: boolean;
  request?: Pick<Request, 'headers'>;
} = {}): Promise<InternalApiWorkspaceSummary[]> {
  const supabase = await (request ? createClient(request) : createClient());
  const sbAdmin = await createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (requireAuth) {
      throw new Error(WORKSPACE_SUMMARY_UNAUTHORIZED);
    }
    return [];
  }

  const { data: workspaces, error } = await sbAdmin
    .from('workspaces')
    .select(
      'id, name, personal, avatar_url, logo_url, created_at, creator_id, workspace_members!inner(user_id), workspace_subscriptions!left(created_at, status, workspace_subscription_products(tier))'
    )
    .eq('workspace_members.user_id', user.id);

  if (error) return [];

  // Resolve the display label and avatar for personal workspaces using the current user's profile
  const [publicProfileRes, privateDetailsRes] = await Promise.all([
    supabase
      .from('users')
      .select('display_name, handle, avatar_url')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('user_private_details')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const publicProfile = publicProfileRes?.data as
    | {
        display_name: string | null;
        handle: string | null;
        avatar_url: string | null;
      }
    | null
    | undefined;
  const privateDetails = privateDetailsRes?.data as
    | { email: string | null }
    | null
    | undefined;

  const displayLabel: string | undefined =
    publicProfile?.display_name ||
    publicProfile?.handle ||
    privateDetails?.email ||
    undefined;

  const userAvatarUrl = publicProfile?.avatar_url || null;

  // For personal workspaces, override the name and avatar with the user's data
  return workspaces.map((ws) => {
    return {
      id: ws.id,
      name: ws.personal ? displayLabel || ws.name || 'Personal' : ws.name,
      personal: ws.personal,
      avatar_url: ws.personal ? userAvatarUrl || ws.avatar_url : ws.avatar_url,
      logo_url: ws.logo_url,
      created_by_me: ws.creator_id === user.id,
      tier: resolveWorkspaceTier(ws),
    };
  });
}

export async function fetchWorkspaces() {
  return fetchWorkspaceSummaries();
}
