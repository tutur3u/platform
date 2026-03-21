import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  autoSkipOldPostEmails,
  processPostEmailQueueBatch,
  reconcileOrphanedApprovedPosts,
  reEnqueueSkippedPostEmails,
} from '@/lib/post-email-queue';

const LOG_PREFIX = '[PostEmailQueueCron]';

function log(
  level: 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>
) {
  const timestamp = new Date().toISOString();
  const logLine = `${timestamp} ${LOG_PREFIX} ${message}`;
  if (level === 'error') {
    console.error(logLine, data ?? {});
  } else if (level === 'warn') {
    console.warn(logLine, data ?? {});
  } else {
    console.log(logLine, data ?? {});
  }
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  log('info', `[${requestId}] Starting post email queue cron job`, {
    searchParams: Object.fromEntries(req.nextUrl.searchParams.entries()),
  });

  try {
    const cronSecret =
      process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET;

    if (!cronSecret) {
      log('error', `[${requestId}] CRON_SECRET not configured`);
      return NextResponse.json(
        { ok: false, error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
        { status: 500 }
      );
    }

    if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
      log('warn', `[${requestId}] Unauthorized request`);
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const sbAdmin = await createAdminClient();
    const batchLimit = Number.parseInt(
      req.nextUrl.searchParams.get('limit') || '200',
      10
    );
    const sendLimit = Number.parseInt(
      req.nextUrl.searchParams.get('sendLimit') || '50',
      10
    );

    log('info', `[${requestId}] Phase 1: autoSkipOldPostEmails`);
    const skipStart = Date.now();
    await autoSkipOldPostEmails(sbAdmin);
    log('info', `[${requestId}] Phase 1 complete`, {
      durationMs: Date.now() - skipStart,
    });

    log('info', `[${requestId}] Phase 2: reEnqueueSkippedPostEmails`);
    const reEnqueueStart = Date.now();
    const reEnqueueResult = await reEnqueueSkippedPostEmails(sbAdmin);
    log('info', `[${requestId}] Phase 2 complete`, {
      durationMs: Date.now() - reEnqueueStart,
      reEnqueued: reEnqueueResult.reEnqueued,
      totalChecked: reEnqueueResult.totalChecked,
    });

    log('info', `[${requestId}] Phase 3: reconcileOrphanedApprovedPosts`);
    const reconciliationStart = Date.now();
    const reconciliation = await reconcileOrphanedApprovedPosts(sbAdmin);
    log('info', `[${requestId}] Phase 3 complete`, {
      durationMs: Date.now() - reconciliationStart,
      enqueued: reconciliation.enqueued,
      checked: reconciliation.checked,
    });

    log('info', `[${requestId}] Phase 4: processPostEmailQueueBatch`, {
      batchLimit: Number.isFinite(batchLimit)
        ? Math.min(Math.max(batchLimit, 1), 500)
        : 200,
      sendLimit: Number.isFinite(sendLimit)
        ? Math.min(Math.max(sendLimit, 1), 200)
        : 50,
    });
    const batchStart = Date.now();
    const result = await processPostEmailQueueBatch(sbAdmin, {
      limit: Number.isFinite(batchLimit)
        ? Math.min(Math.max(batchLimit, 1), 500)
        : 200,
      sendLimit: Number.isFinite(sendLimit)
        ? Math.min(Math.max(sendLimit, 1), 200)
        : 50,
      maxDurationMs: 165_000,
    });
    log('info', `[${requestId}] Phase 4 complete`, {
      durationMs: Date.now() - batchStart,
      claimed: result.claimed,
      processed: result.processed,
      failed: result.failed,
      timedOut: result.timedOut,
    });

    const totalDuration = Date.now() - startTime;
    log('info', `[${requestId}] Cron job completed successfully`, {
      totalDurationMs: totalDuration,
      reEnqueue: reEnqueueResult,
      reconciliation,
      ...result,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      totalDurationMs: totalDuration,
      reEnqueue: reEnqueueResult,
      reconciliation,
      ...result,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    log('error', `[${requestId}] Cron job failed after ${totalDuration}ms`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        ok: false,
        requestId,
        totalDurationMs: totalDuration,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
