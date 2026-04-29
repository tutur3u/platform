import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { MAX_SEARCH_LENGTH } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  fetchRequireAttentionUserIds,
  withRequireAttentionFlag,
} from '@/lib/require-attention-users';
import { matchesWorkspaceUserSearch } from '@/lib/workspace-user-search';

const ReferralQuerySchema = z.object({
  type: z.enum(['available', 'list']).default('list'),
  q: z.string().max(MAX_SEARCH_LENGTH).default(''),
});

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
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
    const { data, error } = await sbAdmin.rpc('get_available_referral_users', {
      p_ws_id: wsId,
      p_user_id: userId,
    });

    if (error) {
      console.error(error);
      return NextResponse.json(
        { message: 'Error fetching available referral users' },
        { status: 500 }
      );
    }

    const availableUsers = (
      (data ?? []) as {
        id: string;
        full_name?: string | null;
        display_name?: string | null;
        email?: string | null;
        phone?: string | null;
      }[]
    ).filter((user) => matchesWorkspaceUserSearch(user, q));
    const requireAttentionUserIds = await fetchRequireAttentionUserIds(
      sbAdmin,
      {
        wsId,
        userIds: availableUsers.map((user) => user.id),
      }
    );

    return NextResponse.json(
      withRequireAttentionFlag(
        availableUsers as unknown as {
          id: string;
        }[],
        requireAttentionUserIds
      )
    );
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
    console.error(error);
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
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const schema = z.object({
    referredUserId: z.guid(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request body' },
      { status: 400 }
    );
  }

  const { referredUserId } = parsed.data;

  // Resolve current workspace virtual user id for auditing fields
  const { user: authUser } = await resolveAuthenticatedSessionUser(supabase);
  if (!authUser) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: wsUser } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('ws_id', wsId)
    .eq('platform_user_id', authUser.id)
    .maybeSingle();

  if (!wsUser?.virtual_user_id) {
    return NextResponse.json(
      { message: 'User not found in workspace' },
      { status: 403 }
    );
  }

  const creatorVirtualUserId = wsUser.virtual_user_id;

  // 1) Ensure referrer-owned referral promotion exists
  const { data: existingPromo, error: promoFetchErr } = await sbAdmin
    .from('workspace_promotions')
    .select('id')
    .eq('ws_id', wsId)
    .eq('promo_type', 'REFERRAL')
    .eq('owner_id', userId)
    .maybeSingle();

  if (promoFetchErr) {
    console.error(promoFetchErr);
    return NextResponse.json(
      { message: 'Error checking referral promotion' },
      { status: 500 }
    );
  }

  if (!existingPromo) {
    const { error: promoInsertErr } = await sbAdmin
      .from('workspace_promotions')
      .insert({
        ws_id: wsId,
        owner_id: userId,
        promo_type: 'REFERRAL',
        value: 0,
        code: 'REF',
        name: 'Referral',
        description: 'Referral Code for Referral System',
        use_ratio: true,
        creator_id: creatorVirtualUserId,
      });

    if (promoInsertErr) {
      console.error(promoInsertErr);
      return NextResponse.json(
        { message: 'Error creating referral promotion' },
        { status: 500 }
      );
    }
  }

  // 2) Set referred_by for the selected user
  const { error: updateErr } = await sbAdmin
    .from('workspace_users')
    .update({ referred_by: userId, updated_by: creatorVirtualUserId })
    .eq('id', referredUserId)
    .eq('ws_id', wsId);

  if (updateErr) {
    console.error(updateErr);
    return NextResponse.json(
      { message: 'Error updating user referral' },
      { status: 500 }
    );
  }

  // 3) Conditionally link workspace default referral promotion to referred user
  const { data: workspaceSettings } = await sbAdmin
    .from('workspace_settings')
    .select('referral_reward_type, referral_promotion_id')
    .eq('ws_id', wsId)
    .maybeSingle();

  const rewardType = workspaceSettings?.referral_reward_type;
  const shouldLink = rewardType === 'RECEIVER' || rewardType === 'BOTH';
  const promoIdToLink = workspaceSettings?.referral_promotion_id;

  if (shouldLink && promoIdToLink) {
    const { error: linkErr } = await sbAdmin
      .from('user_linked_promotions')
      .upsert(
        { user_id: referredUserId, promo_id: promoIdToLink },
        { onConflict: 'user_id,promo_id' }
      );

    if (linkErr) {
      console.error(linkErr);
      // We don't fail the whole request if reward linking fails, but we should log it
    }
  }

  return NextResponse.json({ message: 'success' });
}

export async function DELETE(req: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const supabase = await createClient(req);
  const sbAdmin = await createAdminClient();

  const permissions = await getPermissions({ wsId, request: req });
  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!permissions.containsPermission('update_users')) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const referredUserId = searchParams.get('referredUserId');

  if (!referredUserId) {
    return NextResponse.json(
      { message: 'Missing referredUserId parameter' },
      { status: 400 }
    );
  }

  // Resolve current workspace virtual user id for auditing fields
  const { user: authUser } = await resolveAuthenticatedSessionUser(supabase);
  if (!authUser) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: wsUser } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('ws_id', wsId)
    .eq('platform_user_id', authUser.id)
    .maybeSingle();

  if (!wsUser?.virtual_user_id) {
    return NextResponse.json(
      { message: 'User not found in workspace' },
      { status: 403 }
    );
  }

  const updaterVirtualUserId = wsUser.virtual_user_id;

  // 1) Remove referred_by relationship
  const { error: updateErr } = await sbAdmin
    .from('workspace_users')
    .update({ referred_by: null, updated_by: updaterVirtualUserId })
    .eq('id', referredUserId)
    .eq('ws_id', wsId)
    .eq('referred_by', userId);

  if (updateErr) {
    console.error(updateErr);
    return NextResponse.json(
      { message: 'Error removing user referral' },
      { status: 500 }
    );
  }

  // 2) Remove linked referral promotion if it matches workspace default
  const { data: workspaceSettings } = await sbAdmin
    .from('workspace_settings')
    .select('referral_promotion_id')
    .eq('ws_id', wsId)
    .maybeSingle();

  const promoIdToRemove = workspaceSettings?.referral_promotion_id;
  if (promoIdToRemove) {
    await sbAdmin
      .from('user_linked_promotions')
      .delete()
      .eq('user_id', referredUserId)
      .eq('promo_id', promoIdToRemove);
  }

  return NextResponse.json({ message: 'success' });
}
