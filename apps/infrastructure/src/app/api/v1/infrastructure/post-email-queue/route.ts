import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { getPostEmailQueueObservability } from '@/lib/post-email-queue/observability';
import { requirePostEmailQueueRootAdmin } from './auth';

export async function GET(request: NextRequest) {
  const auth = await requirePostEmailQueueRootAdmin(request);
  if (auth.error) return auth.error;

  try {
    const sbAdmin = await createAdminClient();
    const observability = await getPostEmailQueueObservability(sbAdmin);

    return NextResponse.json(observability);
  } catch (error) {
    serverLogger.error('[PostEmailQueueInfra] Error fetching queue analytics', {
      errorName: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { message: 'Error fetching post email queue' },
      { status: 500 }
    );
  }
}
