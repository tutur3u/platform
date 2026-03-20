import { createClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const referralSettingsSchema = z.object({
  referral_count_cap: z.number().int().min(0),
  referral_increment_percent: z.number().min(0),
  referral_promotion_id: z.string().nullable().optional(),
  referral_reward_type: z.enum(['REFERRER', 'RECEIVER', 'BOTH']),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function PUT(request: Request, { params }: Params) {
  const supabase = await createClient(request);
  const { wsId } = await params;
  const permissions = await getPermissions({ wsId, request });

  if (
    !permissions ||
    permissions.withoutPermission('manage_workspace_settings')
  ) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const parsed = referralSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 }
    );
  }

  const nextValues = parsed.data;
  const { data: existingSettings } = await supabase
    .from('workspace_settings')
    .select('referral_promotion_id')
    .eq('ws_id', wsId)
    .maybeSingle();

  const { error } = await supabase.from('workspace_settings').upsert({
    ws_id: wsId,
    ...nextValues,
  });

  if (error) {
    console.error('Failed to update workspace referral settings:', error);
    return NextResponse.json(
      { message: 'Failed to update referral settings' },
      { status: 500 }
    );
  }

  const previousPromoId = existingSettings?.referral_promotion_id ?? null;
  const nextPromoId = nextValues.referral_promotion_id ?? null;

  if (previousPromoId && nextPromoId && previousPromoId !== nextPromoId) {
    try {
      const { data: referredUsers, error: usersError } = await supabase
        .from('workspace_users')
        .select('id')
        .eq('ws_id', wsId)
        .not('referred_by', 'is', null);

      if (usersError) throw usersError;

      const userIds = (referredUsers ?? []).map((user) => user.id);
      if (userIds.length > 0) {
        const { data: oldLinks, error: oldLinksError } = await supabase
          .from('user_linked_promotions')
          .select('user_id')
          .eq('promo_id', previousPromoId)
          .in('user_id', userIds);

        if (oldLinksError) throw oldLinksError;

        const affectedUserIds = (oldLinks ?? []).map((link) => link.user_id);
        const targetUserIds =
          affectedUserIds.length > 0 ? affectedUserIds : userIds;

        const { error: upsertError } = await supabase
          .from('user_linked_promotions')
          .upsert(
            targetUserIds.map((userId) => ({
              user_id: userId,
              promo_id: nextPromoId,
            })),
            { onConflict: 'user_id,promo_id' }
          );

        if (upsertError) throw upsertError;

        if (affectedUserIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('user_linked_promotions')
            .delete()
            .eq('promo_id', previousPromoId)
            .in('user_id', affectedUserIds);

          if (deleteError) throw deleteError;
        }
      }
    } catch (migrationError) {
      console.error(
        'Failed to migrate referral default promotion links',
        migrationError
      );
    }
  }

  return NextResponse.json({ message: 'success' });
}
