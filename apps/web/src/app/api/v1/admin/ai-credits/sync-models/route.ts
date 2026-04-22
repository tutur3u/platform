import { syncGatewayModels } from '@tuturuuu/ai/credits/sync-gateway-models';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
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

    const member = await verifyWorkspaceMembershipType({
      wsId: ROOT_WORKSPACE_ID,
      userId: user.id,
      supabase,
    });

    if (member.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!member.ok) {
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
