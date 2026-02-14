import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error: memberError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', ROOT_WORKSPACE_ID)
      .eq('user_id', user.id)
      .single();

    if (memberError) {
      return NextResponse.json(
        { error: 'Root workspace admin required' },
        { status: 403 }
      );
    }

    const wsId = req.nextUrl.searchParams.get('ws_id');
    const userId = req.nextUrl.searchParams.get('user_id');

    if (!wsId && !userId) {
      return NextResponse.json(
        { error: 'Must provide ws_id or user_id' },
        { status: 400 }
      );
    }

    const rpcParams: Record<string, unknown> = {};
    if (wsId) rpcParams.p_ws_id = wsId;
    if (userId) rpcParams.p_user_id = userId;

    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin.rpc(
      'admin_get_ai_credit_entity_detail',
      rpcParams
    );

    if (error) {
      console.error('Error getting entity detail:', error);
      return NextResponse.json(
        { error: 'Failed to get entity detail' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in admin entity-detail route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
