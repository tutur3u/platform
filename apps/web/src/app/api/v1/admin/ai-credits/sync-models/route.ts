import { syncGatewayModels } from '@tuturuuu/ai/credits/sync-gateway-models';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    // Auth: require root workspace admin
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
    const result = await syncGatewayModels(sbAdmin);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error syncing gateway models:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to sync gateway models',
      },
      { status: 500 }
    );
  }
}
