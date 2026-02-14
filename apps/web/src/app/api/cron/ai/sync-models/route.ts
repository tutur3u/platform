import { syncGatewayModels } from '@tuturuuu/ai/credits/sync-gateway-models';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sbAdmin = await createAdminClient();
    const result = await syncGatewayModels(sbAdmin);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in cron AI model sync:', error);
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
