import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  autoSkipOldPostEmails,
  processPostEmailQueueBatch,
  reconcileOrphanedApprovedPosts,
} from '@/lib/post-email-queue';

export async function GET(req: NextRequest) {
  try {
    const cronSecret =
      process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { ok: false, error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
        { status: 500 }
      );
    }

    if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const sbAdmin = await createAdminClient();
    const limit = Number.parseInt(
      req.nextUrl.searchParams.get('limit') || '25',
      10
    );

    await autoSkipOldPostEmails(sbAdmin);

    const reconciliation = await reconcileOrphanedApprovedPosts(sbAdmin);

    const result = await processPostEmailQueueBatch(sbAdmin, {
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 25,
    });

    return NextResponse.json({
      ok: true,
      reconciliation,
      ...result,
    });
  } catch (error) {
    console.error('Error processing post email queue:', error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
