import {
  type GatewayModelSyncSource,
  syncGatewayModels,
} from '@tuturuuu/ai/credits/sync-gateway-models';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { DEV_MODE, ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const syncModelsSchema = z.object({
  source: z
    .enum(['tuturuuu-production-public', 'vercel-gateway'])
    .optional()
    .default('vercel-gateway'),
});

export async function POST(request: Request) {
  try {
    // Auth: require root workspace admin
    const supabase = await createClient();
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

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

    const body = await request.json().catch(() => ({}));
    const parsed = syncModelsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const source = parsed.data.source as GatewayModelSyncSource;
    if (source === 'tuturuuu-production-public' && !DEV_MODE) {
      return NextResponse.json(
        {
          error:
            'Tuturuuu production public model sync is only available in development mode',
        },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();
    const result = await syncGatewayModels(sbAdmin, { source });

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
