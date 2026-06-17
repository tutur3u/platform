import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  fetchRequireAttentionUserIds,
  withRequireAttentionFlag,
} from '@/lib/require-attention-users';
import { listAvailableReferralUsers } from '@/lib/user-referrals';

const ReferralQuerySchema = z.object({
  type: z.enum(['available', 'list']).default('list'),
  q: z.string().max(MAX_SEARCH_LENGTH).default(''),
});

const ReferralBodySchema = z.object({
  referredUserId: z.guid(),
});

const ReferralDeleteQuerySchema = z.object({
  referredUserId: z.guid(),
});

type ReferralMutationRow = {
  linked_promotion_id?: string | null;
  referral_promotion_id?: string | null;
  removed_promotion_id?: string | null;
  status: string;
};

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

async function resolveActorVirtualUserId({
  req,
  sbAdmin,
  wsId,
}: {
  req: Request;
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const supabase = await createClient(req);
  const { user: authUser } = await resolveAuthenticatedSessionUser(supabase);

  if (!authUser) {
    return {
      response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      virtualUserId: null,
    };
  }

  const { data: wsUser, error } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('ws_id', wsId)
    .eq('platform_user_id', authUser.id)
    .maybeSingle();

  if (error) {
    serverLogger.error('Error resolving referral actor workspace user', {
      error,
      wsId,
    });
    return {
      response: NextResponse.json(
        { message: 'Error resolving workspace user' },
        { status: 500 }
      ),
      virtualUserId: null,
    };
  }

  if (!wsUser?.virtual_user_id) {
    return {
      response: NextResponse.json(
        { message: 'User not found in workspace' },
        { status: 403 }
      ),
      virtualUserId: null,
    };
  }

  return {
    response: null,
    virtualUserId: wsUser.virtual_user_id,
  };
}

function getReferralMutationRow(data: unknown): ReferralMutationRow | null {
  if (Array.isArray(data)) {
    return (data[0] as ReferralMutationRow | undefined) ?? null;
  }

  return (data as ReferralMutationRow | null) ?? null;
}

function referralAssignResponse(status: string) {
  switch (status) {
    case 'success':
    case 'already_referred_to_referrer':
      return NextResponse.json({ message: 'success' });
    case 'self_referral':
      return NextResponse.json(
        { message: 'A user cannot refer themselves' },
        { status: 400 }
      );
    case 'referrer_not_found':
    case 'referred_user_not_found':
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    case 'referrer_archived':
    case 'referred_user_archived':
      return NextResponse.json(
        { message: 'Archived users cannot be used for referrals' },
        { status: 400 }
      );
    case 'settings_missing':
      return NextResponse.json(
        { message: 'Referral settings are not configured' },
        { status: 409 }
      );
    case 'cap_reached':
      return NextResponse.json(
        { message: 'Referral limit reached' },
        { status: 409 }
      );
    case 'cycle_detected':
      return NextResponse.json(
        { message: 'Referral cycle detected' },
        { status: 409 }
      );
    case 'target_already_referred':
      return NextResponse.json(
        { message: 'User is already referred' },
        { status: 409 }
      );
    default:
      return NextResponse.json(
        { message: 'Error updating user referral' },
        { status: 500 }
      );
  }
}

function referralDeleteResponse(status: string) {
  switch (status) {
    case 'success':
      return NextResponse.json({ message: 'success' });
    case 'referred_user_not_found':
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    case 'not_referred_by_referrer':
      return NextResponse.json(
        { message: 'Referral relationship not found' },
        { status: 409 }
      );
    default:
      return NextResponse.json(
        { message: 'Error removing user referral' },
        { status: 500 }
      );
  }
}

export async function GET(req: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const sbAdmin = await createAdminClient();

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsedQuery = ReferralQuerySchema.safeParse({
    type: searchParams.get('type') ?? undefined,
    q: searchParams.get('q') ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters' },
      { status: 400 }
    );
  }

  const { type, q } = parsedQuery.data;

  if (type === 'available') {
    if (!permissions.containsPermission('update_users')) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    try {
      return NextResponse.json(
        await listAvailableReferralUsers(sbAdmin, {
          currentUserId: userId,
          q,
          wsId,
        })
      );
    } catch (error) {
      serverLogger.error('Error fetching available referral users', { error });
      return NextResponse.json(
        { message: 'Error fetching available referral users' },
        { status: 500 }
      );
    }
  }

  // Default: list referred users
  const { data, error, count } = await sbAdmin
    .from('workspace_users')
    .select('id, full_name, display_name, email, phone, avatar_url', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .eq('referred_by', userId)
    .eq('archived', false)
    .order('created_at', { ascending: false });

  if (error) {
    serverLogger.error('Error fetching referred users', { error });
    return NextResponse.json(
      { message: 'Error fetching referred users' },
      { status: 500 }
    );
  }

  const referredUsers = (data ?? []) as {
    id: string;
    full_name?: string | null;
    display_name?: string | null;
  }[];
  const requireAttentionUserIds = await fetchRequireAttentionUserIds(sbAdmin, {
    wsId,
    userIds: referredUsers.map((user) => user.id),
  });

  return NextResponse.json({
    data: withRequireAttentionFlag(
      referredUsers as unknown as {
        id: string;
      }[],
      requireAttentionUserIds
    ),
    count: count ?? 0,
  });
}

export async function POST(req: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const parsed = ReferralBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { referredUserId } = parsed.data;

  const actor = await resolveActorVirtualUserId({ req, sbAdmin, wsId });
  if (actor.response) return actor.response;
  if (!actor.virtualUserId) {
    return NextResponse.json(
      { message: 'User not found in workspace' },
      { status: 403 }
    );
  }

  const { data, error } = await privateDb.rpc(
    'assign_workspace_user_referral',
    {
      p_actor_user_id: actor.virtualUserId,
      p_referred_user_id: referredUserId,
      p_referrer_user_id: userId,
      p_ws_id: wsId,
    }
  );

  if (error) {
    serverLogger.error('Error assigning user referral', {
      error,
      referredUserId,
      userId,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error updating user referral' },
      { status: 500 }
    );
  }

  return referralAssignResponse(
    getReferralMutationRow(data)?.status ?? 'unknown'
  );
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const sbAdmin = await createAdminClient();
  const privateDb = sbAdmin.schema('private');

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = ReferralDeleteQuerySchema.safeParse({
    referredUserId: searchParams.get('referredUserId') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid referredUserId parameter' },
      { status: 400 }
    );
  }

  const { referredUserId } = parsed.data;

  const actor = await resolveActorVirtualUserId({ req, sbAdmin, wsId });
  if (actor.response) return actor.response;
  if (!actor.virtualUserId) {
    return NextResponse.json(
      { message: 'User not found in workspace' },
      { status: 403 }
    );
  }

  const { data, error } = await privateDb.rpc(
    'remove_workspace_user_referral',
    {
      p_actor_user_id: actor.virtualUserId,
      p_referred_user_id: referredUserId,
      p_referrer_user_id: userId,
      p_ws_id: wsId,
    }
  );

  if (error) {
    serverLogger.error('Error removing user referral', {
      error,
      referredUserId,
      userId,
      wsId,
    });
    return NextResponse.json(
      { message: 'Error removing user referral' },
      { status: 500 }
    );
  }

  return referralDeleteResponse(
    getReferralMutationRow(data)?.status ?? 'unknown'
  );
}
