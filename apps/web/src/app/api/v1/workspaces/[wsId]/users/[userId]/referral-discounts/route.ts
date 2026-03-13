import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
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

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json(
      { message: 'Failed to verify workspace membership' },
      { status: 500 }
    );
  }

  if (!membership) {
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
