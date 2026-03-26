import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  autoSkipOldApprovedPostChecks,
  autoSkipOldPostEmails,
  autoSkipRejectedPosts,
  cleanupStaleProcessingRows,
  type PostEmailQueueRow,
  processPostEmailQueueBatch,
  reconcileOrphanedApprovedPosts,
  reEnqueueSkippedPostEmails,
} from '@/lib/post-email-queue';

const LOG_PREFIX = '[PostEmailQueueCron]';

type QueueStatusSummary = {
  blocked: number;
  cancelled: number;
  failed: number;
  processing: number;
  queued: number;
  sent: number;
  skipped: number;
  total: number;
};

function createEmptyQueueStatusSummary(): QueueStatusSummary {
  return {
    blocked: 0,
    cancelled: 0,
    failed: 0,
    processing: 0,
    queued: 0,
    sent: 0,
    skipped: 0,
    total: 0,
  };
}

async function getQueueStatusSummary(
  sbAdmin: TypedSupabaseClient
): Promise<QueueStatusSummary> {
  const { data, error } = await sbAdmin
    .from('post_email_queue')
    .select('status');

  if (error) {
    throw error;
  }

  const summary = createEmptyQueueStatusSummary();

  for (const row of (data ?? []) as Array<Pick<PostEmailQueueRow, 'status'>>) {
    summary.total++;
    if (row.status === 'queued') summary.queued++;
    else if (row.status === 'processing') summary.processing++;
    else if (row.status === 'sent') summary.sent++;
    else if (row.status === 'failed') summary.failed++;
    else if (row.status === 'blocked') summary.blocked++;
    else if (row.status === 'cancelled') summary.cancelled++;
    else if (row.status === 'skipped') summary.skipped++;
  }

  return summary;
}

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
    const debugMode = req.nextUrl.searchParams.get('debug') === '1';
    const batchLimit = Number.parseInt(
      req.nextUrl.searchParams.get('limit') || '200',
      10
    );
    const sendLimit = Number.parseInt(
      req.nextUrl.searchParams.get('sendLimit') || '50',
      10
    );
    const phaseTimingsMs: Record<string, number> = {};
    const queueBefore = await getQueueStatusSummary(sbAdmin);

    log('info', `[${requestId}] Queue snapshot before processing`, {
      queueBefore,
    });

    const phasesStart = Date.now();
    await Promise.all([
      (async () => {
        const start = Date.now();
        const cleanedUp = await cleanupStaleProcessingRows(sbAdmin);
        phaseTimingsMs.phase0Cleanup = Date.now() - start;
        log('info', `[${requestId}] Phase 0 complete`, {
          durationMs: phaseTimingsMs.phase0Cleanup,
          cleanedUp,
        });
        return { cleanedUp };
      })(),
      (async () => {
        const start = Date.now();
        await autoSkipOldPostEmails(sbAdmin);
        phaseTimingsMs.phase1AutoSkipOldQueuedRows = Date.now() - start;
        log('info', `[${requestId}] Phase 1 complete`, {
          durationMs: phaseTimingsMs.phase1AutoSkipOldQueuedRows,
        });
      })(),
      (async () => {
        const start = Date.now();
        const skipped = await autoSkipOldApprovedPostChecks(sbAdmin);
        phaseTimingsMs.phase1_6AutoSkipOldApprovedChecks = Date.now() - start;
        log('info', `[${requestId}] Phase 1.6 complete`, {
          durationMs: phaseTimingsMs.phase1_6AutoSkipOldApprovedChecks,
          skipped,
        });
        return { skipped };
      })(),
      (async () => {
        const start = Date.now();
        const rejectedSkipped = await autoSkipRejectedPosts(sbAdmin);
        phaseTimingsMs.phase1_5AutoSkipRejectedPosts = Date.now() - start;
        log('info', `[${requestId}] Phase 1.5 complete`, {
          durationMs: phaseTimingsMs.phase1_5AutoSkipRejectedPosts,
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
    phaseTimingsMs.phase2Reenqueue = Date.now() - reEnqueueStart;
    log('info', `[${requestId}] Phase 2 complete`, {
      durationMs: phaseTimingsMs.phase2Reenqueue,
      reEnqueued: reEnqueueResult.reEnqueued,
      totalChecked: reEnqueueResult.totalChecked,
    });

    log('info', `[${requestId}] Phase 3: reconcileOrphanedApprovedPosts`);
    const reconciliationStart = Date.now();
    const reconciliation = await reconcileOrphanedApprovedPosts(sbAdmin);
    phaseTimingsMs.phase3Reconcile = Date.now() - reconciliationStart;
    log('info', `[${requestId}] Phase 3 complete`, {
      durationMs: phaseTimingsMs.phase3Reconcile,
      enqueued: reconciliation.enqueued,
      checked: reconciliation.checked,
      diagnostics: reconciliation.diagnostics,
    });

    const queueAfterReconciliation = await getQueueStatusSummary(sbAdmin);
    log('info', `[${requestId}] Queue snapshot after reconciliation`, {
      queueAfterReconciliation,
    });

    let result: {
      claimed: number;
      processed: number;
      failed: number;
      timedOut: boolean;
      results: Array<Record<string, unknown>>;
    } = { claimed: 0, processed: 0, failed: 0, timedOut: false, results: [] };
    let phase4SkippedReason: string | null = null;

    if (
      queueAfterReconciliation.queued + queueAfterReconciliation.failed ===
      0
    ) {
      phase4SkippedReason = 'no_queued_or_failed_rows_after_reconciliation';
      log('info', `[${requestId}] Phase 4 skipped`, {
        phase4SkippedReason,
        queueAfterReconciliation,
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
      phaseTimingsMs.phase4ProcessQueue = Date.now() - batchStart;
      log('info', `[${requestId}] Phase 4 complete`, {
        durationMs: phaseTimingsMs.phase4ProcessQueue,
        claimed: result.claimed,
        processed: result.processed,
        failed: result.failed,
        timedOut: result.timedOut,
      });
    }

    const queueAfter = await getQueueStatusSummary(sbAdmin);
    log('info', `[${requestId}] Queue snapshot after processing`, {
      queueAfter,
    });

    const totalDuration = Date.now() - startTime;
    const diagnostics = {
      phase4SkippedReason,
      queueAfter,
      queueBefore,
      queueAfterReconciliation,
      reconciliationDiagnostics: reconciliation.diagnostics,
    };
    log('info', `[${requestId}] Cron job completed successfully`, {
      totalDurationMs: totalDuration,
      diagnostics,
      reEnqueue: reEnqueueResult,
      reconciliation,
      ...result,
    });

    const payload: Record<string, unknown> = {
      ok: true,
      requestId,
      totalDurationMs: totalDuration,
      diagnostics,
      reEnqueue: reEnqueueResult,
      reconciliation,
      ...result,
    };

    if (debugMode) {
      payload.debug = {
        phaseTimingsMs,
      };
    }

    return NextResponse.json(payload);
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
