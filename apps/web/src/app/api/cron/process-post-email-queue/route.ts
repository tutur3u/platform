import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  autoSkipOldApprovedPostChecks,
  autoSkipOldPostEmails,
  autoSkipRejectedPosts,
  cleanupStaleProcessingRows,
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

    const phasesStart = Date.now();
    await Promise.all([
      (async () => {
        const start = Date.now();
        const cleanedUp = await cleanupStaleProcessingRows(sbAdmin);
        log('info', `[${requestId}] Phase 0 complete`, {
          durationMs: Date.now() - start,
          cleanedUp,
        });
        return { cleanedUp };
      })(),
      (async () => {
        const start = Date.now();
        await autoSkipOldPostEmails(sbAdmin);
        log('info', `[${requestId}] Phase 1 complete`, {
          durationMs: Date.now() - start,
        });
      })(),
      (async () => {
        const start = Date.now();
        const skipped = await autoSkipOldApprovedPostChecks(sbAdmin);
        log('info', `[${requestId}] Phase 1.6 complete`, {
          durationMs: Date.now() - start,
          skipped,
        });
        return { skipped };
      })(),
      (async () => {
        const start = Date.now();
        const rejectedSkipped = await autoSkipRejectedPosts(sbAdmin);
        log('info', `[${requestId}] Phase 1.5 complete`, {
          durationMs: Date.now() - start,
          rejectedSkipped,
        });
        return { rejectedSkipped };
      })(),
    ]);
    log('info', `[${requestId}] Early phases complete`, {
      durationMs: Date.now() - phasesStart,
    });

    log('info', `[${requestId}] Phase 2: reEnqueueSkippedPostEmails`);
    const reEnqueueStart = Date.now();
    const reEnqueueResult = await reEnqueueSkippedPostEmails(sbAdmin, {});
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

    const { count: queuedOrFailedCount } = await sbAdmin
      .from('post_email_queue')
      .select('id', { count: 'exact' })
      .in('status', ['queued', 'failed']);

    let result: {
      claimed: number;
      processed: number;
      failed: number;
      timedOut: boolean;
      results: Array<Record<string, unknown>>;
    } = { claimed: 0, processed: 0, failed: 0, timedOut: false, results: [] };

    if (!queuedOrFailedCount) {
      log('info', `[${requestId}] Phase 4 skipped — no queued/failed rows`, {
        queuedOrFailedCount,
      });
      result = {
        claimed: 0,
        processed: 0,
        failed: 0,
        timedOut: false,
        results: [],
      };
    } else {
      log('info', `[${requestId}] Phase 4: processPostEmailQueueBatch`, {
        batchLimit: Number.isFinite(batchLimit)
          ? Math.min(Math.max(batchLimit, 1), 500)
          : 200,
        sendLimit: Number.isFinite(sendLimit)
          ? Math.min(Math.max(sendLimit, 1), 200)
          : 50,
      });
      const batchStart = Date.now();
      result = await processPostEmailQueueBatch(sbAdmin, {
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
    }

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
    const errorMessage =
      error instanceof Error
        ? error.message
        : error
          ? JSON.stringify(error)
          : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    log('error', `[${requestId}] Cron job failed after ${totalDuration}ms`, {
      error: errorMessage,
      stack: errorStack,
    });
    return NextResponse.json(
      {
        ok: false,
        requestId,
        totalDurationMs: totalDuration,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
