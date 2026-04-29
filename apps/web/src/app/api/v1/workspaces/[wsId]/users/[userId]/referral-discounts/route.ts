import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
    userId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return NextResponse.json(
      { error: 'Failed to verify workspace membership' },
      { status: 500 }
    );
  }

  if (!membership.ok) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await sbAdmin
    .from('v_user_referral_discounts')
    .select('promo_id, calculated_discount_value')
    .eq('ws_id', wsId)
    .eq('user_id', userId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching referral discounts' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
