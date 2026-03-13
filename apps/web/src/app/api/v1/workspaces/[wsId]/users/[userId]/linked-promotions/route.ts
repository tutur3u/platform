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

export async function GET(_: Request, { params }: Params) {
  const { wsId, userId } = await params;
  const supabase = await createClient();
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
    .from('user_linked_promotions')
    .select(
      'promo_id, workspace_promotions!inner(id, name, code, value, use_ratio, promo_type, max_uses, current_uses, ws_id)'
    )
    .eq('user_id', userId)
    .eq('workspace_promotions.ws_id', wsId);

  if (error) {
    console.error(error);
    return NextResponse.json(
      { message: 'Error fetching linked promotions' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}
