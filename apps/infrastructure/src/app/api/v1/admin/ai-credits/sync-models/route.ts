import {
  type GatewayModelSyncSource,
  syncGatewayModels,
} from '@tuturuuu/ai/credits/sync-gateway-models';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAiCreditsAdminRequest } from '../access';

const syncModelsSchema = z.object({
  source: z
    .enum(['tuturuuu-production-public', 'vercel-gateway'])
    .optional()
    .default('vercel-gateway'),
});

export async function POST(request: Request) {
  try {
    const auth = await authorizeAiCreditsAdminRequest();
    if (!auth.ok) return auth.response;

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

    const result = await syncGatewayModels(auth.sbAdmin, { source });

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
