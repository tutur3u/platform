import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

export async function GET() {
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

    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin.rpc(
      'get_platform_ai_credit_overview'
    );

    if (error) {
      console.error('Error getting platform overview:', error);
      return NextResponse.json(
        { error: 'Failed to get platform overview' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in admin overview route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
