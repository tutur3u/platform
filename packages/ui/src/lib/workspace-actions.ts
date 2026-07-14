'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { searchIntent } from '@tuturuuu/utils/search';

const WORKSPACE_SUMMARY_UNAUTHORIZED = 'WORKSPACE_SUMMARY_UNAUTHORIZED';
const DEFAULT_WORKSPACE_SEARCH_LIMIT = 50;
const MAX_WORKSPACE_SEARCH_LIMIT = 100;

type TaskBoardGuestPermission = 'view' | 'edit';

function normalizeTaskBoardShareEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

function strongestTaskBoardGuestPermission(
  permissions: Array<TaskBoardGuestPermission | null | undefined>
): TaskBoardGuestPermission | null {
  if (permissions.includes('edit')) return 'edit';
  if (permissions.includes('view')) return 'view';
  return null;
}

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

type WorkspaceSubscriptionTierData = {
  created_at?: string | null;
  product_id?: string | null;
  status?: string | null;
  workspace_subscription_products?:
    | { tier?: string | null }
    | Array<{ tier?: string | null }>
    | null;
};

function collectSubscriptionProductIds(
  workspace:
    | {
        workspace_subscriptions?: WorkspaceSubscriptionTierData[] | null;
      }
    | null
    | undefined,
  productIds: Set<string>
) {
  for (const subscription of workspace?.workspace_subscriptions ?? []) {
    if (subscription?.product_id) {
      productIds.add(subscription.product_id);
    }
  }
}

async function fetchSubscriptionProductTierMap(
  supabase: TypedSupabaseClient,
  productIds: string[]
) {
  const tierByProductId = new Map<
    string,
    InternalApiWorkspaceSummary['tier']
  >();

  if (productIds.length === 0) return tierByProductId;

  const { data, error } = await supabase
    .schema('private')
    .from('workspace_subscription_products')
    .select('id, tier')
    .in('id', productIds);

  if (error) return tierByProductId;

  for (const product of (data ?? []) as Array<{
    id: string;
    tier?: string | null;
  }>) {
    tierByProductId.set(product.id, normalizeWorkspaceTier(product.tier));
  }

  return tierByProductId;
}

function resolveWorkspaceTier(
  workspace: {
    workspace_subscriptions?: WorkspaceSubscriptionTierData[] | null;
  },
  productTiersById: Map<string, InternalApiWorkspaceSummary['tier']>
) {
  const activeSubscriptions =
    workspace.workspace_subscriptions
      ?.filter((subscription) => subscription?.status === 'active')
      .sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() -
          new Date(a.created_at ?? 0).getTime()
      ) ?? [];

  for (const subscription of activeSubscriptions) {
    if (subscription.product_id) {
      const tier = productTiersById.get(subscription.product_id);

      if (tier) {
        return tier;
      }
    }

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

function normalizeWorkspaceSearchLimit(limit: number | undefined) {
  if (!Number.isFinite(limit)) return undefined;

  return Math.min(
    MAX_WORKSPACE_SEARCH_LIMIT,
    Math.max(1, Math.trunc(limit as number))
  );
}

function workspaceSummarySearchCandidate(
  workspace: InternalApiWorkspaceSummary
) {
  const accessType = workspace.access_type ?? null;

  return {
    aliases: [
      workspace.id,
      workspace.personal ? 'personal' : '',
      accessType === 'guest' ? 'guest' : '',
      workspace.guest_landing_path ?? '',
    ].filter(Boolean),
    keywords: [
      workspace.personal ? 'personal' : '',
      accessType === 'guest' ? 'guest' : '',
      workspace.created_by_me ? 'created by me' : '',
    ].filter(Boolean),
    summary: workspace,
    subtitle: workspace.id,
    title: workspace.name || workspace.id,
  };
}

function applyWorkspaceSummarySearch(
  summaries: InternalApiWorkspaceSummary[],
  {
    limit,
    query,
  }: {
    limit?: number;
    query?: string;
  }
) {
  const normalizedLimit = normalizeWorkspaceSearchLimit(limit);
  const trimmedQuery = query?.trim() ?? '';

  if (trimmedQuery) {
    return searchIntent(
      summaries.map(workspaceSummarySearchCandidate),
      trimmedQuery,
      {
        limit: normalizedLimit ?? DEFAULT_WORKSPACE_SEARCH_LIMIT,
      }
    ).map((result) => result.item.summary);
  }

  if (normalizedLimit) {
    return summaries.slice(0, normalizedLimit);
  }

  return summaries;
}

export async function fetchWorkspaceSummaries({
  limit,
  query,
  requireAuth = false,
  request,
  supabase: providedSupabase,
  userId: providedUserId,
}: {
  limit?: number;
  query?: string;
  requireAuth?: boolean;
  request?: Pick<Request, 'headers'>;
  supabase?: TypedSupabaseClient;
  userId?: string;
} = {}): Promise<InternalApiWorkspaceSummary[]> {
  const supabase =
    providedSupabase ??
    ((await (request
      ? createClient(request)
      : createClient())) as TypedSupabaseClient);
  const sbAdmin = await createAdminClient();
  const userId =
    providedUserId ?? (await supabase.auth.getUser()).data.user?.id ?? null;

  if (!userId) {
    if (requireAuth) {
      throw new Error(WORKSPACE_SUMMARY_UNAUTHORIZED);
    }
    return [];
  }

  const { data: workspaces, error } = await sbAdmin
    .from('workspaces')
    .select(
      'id, name, personal, avatar_url, logo_url, created_at, creator_id, workspace_members!inner(user_id), workspace_subscriptions!left(created_at, status, product_id)'
    )
    .eq('workspace_members.user_id', userId);

  if (error) return [];

  // Resolve the display label and avatar for personal workspaces using the current user's profile
  const [publicProfileRes, privateDetailsRes] = await Promise.all([
    supabase
      .from('users')
      .select('display_name, handle, avatar_url')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('user_private_details')
      .select('email')
      .eq('user_id', userId)
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
  const memberWorkspaceIds = new Set(
    workspaces.map((workspace) => workspace.id)
  );

  const guestWorkspaceById = new Map<
    string,
    InternalApiWorkspaceSummary & {
      guestBoardIds: Set<string>;
    }
  >();
  const guestShareRows: Array<{
    board_id?: string | null;
    permission?: 'view' | 'edit' | null;
    workspace_boards?: {
      id?: string | null;
      ws_id?: string | null;
      workspaces?:
        | {
            avatar_url?: string | null;
            creator_id?: string | null;
            id?: string | null;
            logo_url?: string | null;
            name?: string | null;
            personal?: boolean | null;
            workspace_subscriptions?: Array<{
              created_at?: string | null;
              product_id?: string | null;
              status?: string | null;
              workspace_subscription_products?:
                | { tier?: string | null }
                | Array<{ tier?: string | null }>
                | null;
            }> | null;
          }
        | Array<{
            avatar_url?: string | null;
            creator_id?: string | null;
            id?: string | null;
            logo_url?: string | null;
            name?: string | null;
            personal?: boolean | null;
            workspace_subscriptions?: Array<{
              created_at?: string | null;
              product_id?: string | null;
              status?: string | null;
              workspace_subscription_products?:
                | { tier?: string | null }
                | Array<{ tier?: string | null }>
                | null;
            }> | null;
          }>
        | null;
    } | null;
  }> = [];
  const guestShareSelect = `
    board_id,
    permission,
    workspace_boards!inner (
      id,
      ws_id,
      deleted_at,
      workspaces!inner (
        id,
        name,
        personal,
        avatar_url,
        logo_url,
        creator_id,
        workspace_subscriptions!left (
          created_at,
          status,
          product_id
        )
      )
    )
  `;

  const userShareResult = await (sbAdmin as any)
    .from('task_board_shares')
    .select(guestShareSelect)
    .eq('shared_with_user_id', userId)
    .is('workspace_boards.deleted_at', null);
  if (!userShareResult.error) {
    guestShareRows.push(
      ...((userShareResult.data ?? []) as typeof guestShareRows)
    );
  }

  const normalizedEmail = normalizeTaskBoardShareEmail(privateDetails?.email);
  if (normalizedEmail) {
    const emailShareResult = await (sbAdmin as any)
      .from('task_board_shares')
      .select(guestShareSelect)
      .eq('shared_with_email', normalizedEmail)
      .is('workspace_boards.deleted_at', null);
    if (!emailShareResult.error) {
      guestShareRows.push(
        ...((emailShareResult.data ?? []) as typeof guestShareRows)
      );
    }
  }

  const subscriptionProductIds = new Set<string>();
  for (const workspace of workspaces) {
    collectSubscriptionProductIds(workspace, subscriptionProductIds);
  }
  for (const share of guestShareRows) {
    const board = share.workspace_boards;
    const workspace = Array.isArray(board?.workspaces)
      ? board?.workspaces[0]
      : board?.workspaces;
    collectSubscriptionProductIds(workspace, subscriptionProductIds);
  }
  const productTiersById = await fetchSubscriptionProductTierMap(
    sbAdmin as TypedSupabaseClient,
    [...subscriptionProductIds]
  );

  for (const share of guestShareRows) {
    const board = share.workspace_boards;
    const workspace = Array.isArray(board?.workspaces)
      ? board?.workspaces[0]
      : board?.workspaces;
    const workspaceId = workspace?.id ?? board?.ws_id ?? null;
    const boardId = share.board_id ?? board?.id ?? null;

    if (
      !workspaceId ||
      !boardId ||
      !share.permission ||
      memberWorkspaceIds.has(workspaceId)
    ) {
      continue;
    }

    const existing = guestWorkspaceById.get(workspaceId);
    const guestBoardIds = existing?.guestBoardIds ?? new Set<string>();
    guestBoardIds.add(boardId);

    guestWorkspaceById.set(workspaceId, {
      id: workspaceId,
      name: workspace?.name || (workspace?.personal ? 'Personal' : 'Untitled'),
      personal: workspace?.personal ?? false,
      avatar_url: workspace?.avatar_url || null,
      logo_url: workspace?.logo_url || null,
      created_by_me: workspace?.creator_id === userId,
      tier: resolveWorkspaceTier(workspace ?? {}, productTiersById),
      access_type: 'guest',
      guest_products: ['tasks'],
      guest_board_count: guestBoardIds.size,
      guest_highest_permission: strongestTaskBoardGuestPermission([
        existing?.guest_highest_permission,
        share.permission,
      ]),
      guest_landing_path:
        guestBoardIds.size === 1
          ? `/tasks/boards/${[...guestBoardIds][0]}`
          : '/tasks/boards',
      guestBoardIds,
    });
  }

  // For personal workspaces, override the name and avatar with the user's data
  const memberSummaries = workspaces.map((ws) => {
    return {
      id: ws.id,
      name: ws.personal ? displayLabel || ws.name || 'Personal' : ws.name,
      personal: ws.personal,
      avatar_url: ws.personal ? userAvatarUrl || ws.avatar_url : ws.avatar_url,
      logo_url: ws.logo_url,
      created_by_me: ws.creator_id === userId,
      tier: resolveWorkspaceTier(ws, productTiersById),
      access_type: 'member' as const,
    };
  });

  const summaries = [
    ...memberSummaries,
    ...[...guestWorkspaceById.values()].map(
      ({ guestBoardIds: _, ...workspace }) => workspace
    ),
  ];

  return applyWorkspaceSummarySearch(summaries, { limit, query });
}

export async function fetchWorkspaces() {
  return fetchWorkspaceSummaries();
}
