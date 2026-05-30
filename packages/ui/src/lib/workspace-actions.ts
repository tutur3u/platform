'use server';

import {
  normalizeTaskBoardShareEmail,
  strongestTaskBoardGuestPermission,
} from '@tuturuuu/apis/tu-do/board-access';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
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
  supabase: providedSupabase,
  userId: providedUserId,
}: {
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
      'id, name, personal, avatar_url, logo_url, created_at, creator_id, workspace_members!inner(user_id), workspace_subscriptions!left(created_at, status, workspace_subscription_products(tier))'
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
          workspace_subscription_products (
            tier
          )
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
      name: workspace?.personal
        ? displayLabel || workspace?.name || 'Personal'
        : workspace?.name || 'Untitled',
      personal: workspace?.personal ?? false,
      avatar_url: workspace?.personal
        ? userAvatarUrl || workspace?.avatar_url || null
        : workspace?.avatar_url || null,
      logo_url: workspace?.logo_url || null,
      created_by_me: workspace?.creator_id === userId,
      tier: resolveWorkspaceTier(workspace ?? {}),
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
      tier: resolveWorkspaceTier(ws),
      access_type: 'member' as const,
    };
  });

  return [
    ...memberSummaries,
    ...[...guestWorkspaceById.values()].map(
      ({ guestBoardIds: _, ...workspace }) => workspace
    ),
  ];
}

export async function fetchWorkspaces() {
  return fetchWorkspaceSummaries();
}
