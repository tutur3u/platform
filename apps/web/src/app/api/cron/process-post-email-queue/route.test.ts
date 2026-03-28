import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  adminClientMock,
  autoSkipOldApprovedPostChecksMock,
  autoSkipOldPostEmailsMock,
  autoSkipRejectedPostsMock,
  cleanupStaleProcessingRowsMock,
  createAdminClientMock,
  mergeReconciliationResultsMock,
  processPostEmailQueueBatchMock,
  reconcileOrphanedApprovedPostsMock,
  reEnqueueSkippedPostEmailsMock,
} = vi.hoisted(() => {
  const adminClient = {
    from: vi.fn(),
  };

  return {
    adminClientMock: adminClient,
    autoSkipOldApprovedPostChecksMock: vi.fn(),
    autoSkipOldPostEmailsMock: vi.fn(),
    autoSkipRejectedPostsMock: vi.fn(),
    cleanupStaleProcessingRowsMock: vi.fn(),
    createAdminClientMock: vi.fn(() => adminClient),
    mergeReconciliationResultsMock: vi.fn((base, next) => ({
      checked: base.checked || next.checked,
      diagnostics: {
        alreadySent:
          base.diagnostics.alreadySent || next.diagnostics.alreadySent,
        checked: base.diagnostics.checked || next.diagnostics.checked,
        coveredByExistingQueue:
          base.diagnostics.coveredByExistingQueue ||
          next.diagnostics.coveredByExistingQueue,
        coveredBySentEmail:
          base.diagnostics.coveredBySentEmail ||
          next.diagnostics.coveredBySentEmail,
        eligibleRecipients:
          base.diagnostics.eligibleRecipients +
          next.diagnostics.eligibleRecipients,
        existingProcessing:
          base.diagnostics.existingProcessing +
          next.diagnostics.existingProcessing,
        existingQueued:
          base.diagnostics.existingQueued + next.diagnostics.existingQueued,
        existingSkipped:
          base.diagnostics.existingSkipped + next.diagnostics.existingSkipped,
        missingCompletion:
          base.diagnostics.missingCompletion +
          next.diagnostics.missingCompletion,
        missingEmail:
          base.diagnostics.missingEmail + next.diagnostics.missingEmail,
        missingSenderPlatformUser:
          base.diagnostics.missingSenderPlatformUser +
          next.diagnostics.missingSenderPlatformUser,
        missingUserRecord:
          base.diagnostics.missingUserRecord +
          next.diagnostics.missingUserRecord,
        notApproved:
          base.diagnostics.notApproved + next.diagnostics.notApproved,
        orphaned: base.diagnostics.orphaned || next.diagnostics.orphaned,
        upserted: base.diagnostics.upserted + next.diagnostics.upserted,
      },
      enqueued: base.enqueued + next.enqueued,
      processedPosts: base.processedPosts + next.processedPosts,
      remainingPosts: next.remainingPosts,
    })),
    processPostEmailQueueBatchMock: vi.fn(),
    reconcileOrphanedApprovedPostsMock: vi.fn(),
    reEnqueueSkippedPostEmailsMock: vi.fn(),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@/lib/post-email-queue', () => ({
  autoSkipOldApprovedPostChecks: autoSkipOldApprovedPostChecksMock,
  autoSkipOldPostEmails: autoSkipOldPostEmailsMock,
  autoSkipRejectedPosts: autoSkipRejectedPostsMock,
  cleanupStaleProcessingRows: cleanupStaleProcessingRowsMock,
  mergeReconciliationResults: mergeReconciliationResultsMock,
  processPostEmailQueueBatch: processPostEmailQueueBatchMock,
  reconcileOrphanedApprovedPosts: reconcileOrphanedApprovedPostsMock,
  reEnqueueSkippedPostEmails: reEnqueueSkippedPostEmailsMock,
}));

import { GET } from './route';

function makeQueueRows(summary: {
  blocked?: number;
  cancelled?: number;
  failed?: number;
  processing?: number;
  queued?: number;
  sent?: number;
  skipped?: number;
}) {
  return [
    ...Array.from({ length: summary.queued ?? 0 }, (_, index) => ({
      id: `queued-${index}`,
      status: 'queued',
    })),
    ...Array.from({ length: summary.processing ?? 0 }, (_, index) => ({
      id: `processing-${index}`,
      status: 'processing',
    })),
    ...Array.from({ length: summary.failed ?? 0 }, (_, index) => ({
      id: `failed-${index}`,
      status: 'failed',
    })),
    ...Array.from({ length: summary.sent ?? 0 }, (_, index) => ({
      id: `sent-${index}`,
      status: 'sent',
    })),
    ...Array.from({ length: summary.skipped ?? 0 }, (_, index) => ({
      id: `skipped-${index}`,
      status: 'skipped',
    })),
    ...Array.from({ length: summary.blocked ?? 0 }, (_, index) => ({
      id: `blocked-${index}`,
      status: 'blocked',
    })),
    ...Array.from({ length: summary.cancelled ?? 0 }, (_, index) => ({
      id: `cancelled-${index}`,
      status: 'cancelled',
    })),
  ];
}

function mockQueueStatusSnapshots(
  queueSnapshots: Array<Array<{ id: string; status: string }>>
) {
  adminClientMock.from.mockImplementation((table: string) => {
    expect(table).toBe('post_email_queue');

    return {
      select: vi.fn(() => {
        const snapshot = queueSnapshots.shift() ?? [];

        const builder = {
          order: vi.fn(() => builder),
          range: vi.fn(async () => ({
            data: snapshot,
            error: null,
          })),
        };

        return builder;
      }),
    };
  });
}

describe('process-post-email-queue cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('VERCEL_CRON_SECRET', '');

    cleanupStaleProcessingRowsMock.mockResolvedValue(0);
    autoSkipOldPostEmailsMock.mockResolvedValue(undefined);
    autoSkipOldApprovedPostChecksMock.mockResolvedValue(0);
    autoSkipRejectedPostsMock.mockResolvedValue(0);
    reEnqueueSkippedPostEmailsMock.mockResolvedValue({
      reEnqueued: 0,
      totalChecked: 0,
    });
    processPostEmailQueueBatchMock.mockResolvedValue({
      claimed: 0,
      failed: 0,
      processed: 0,
      results: [],
      timedOut: false,
    });
  });

  it('returns reconciliation diagnostics and skips phase 4 only when queued and failed rows are zero after reconciliation', async () => {
    mockQueueStatusSnapshots([
      makeQueueRows({ processing: 1, queued: 2, sent: 1 }),
      makeQueueRows({ processing: 1, sent: 1, skipped: 2 }),
      makeQueueRows({ processing: 1, sent: 1, skipped: 2 }),
    ]);

    reconcileOrphanedApprovedPostsMock.mockResolvedValue({
      checked: 4,
      diagnostics: {
        alreadySent: 0,
        checked: 4,
        coveredByExistingQueue: 2,
        coveredBySentEmail: 1,
        eligibleRecipients: 2,
        existingProcessing: 0,
        existingQueued: 0,
        existingSkipped: 0,
        missingCompletion: 0,
        missingEmail: 0,
        missingSenderPlatformUser: 2,
        missingUserRecord: 0,
        notApproved: 0,
        orphaned: 2,
        upserted: 0,
      },
      enqueued: 0,
      processedPosts: 2,
      remainingPosts: 5,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/cron/process-post-email-queue?debug=1',
        {
          headers: {
            Authorization: 'Bearer cron-secret',
          },
        }
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      diagnostics: {
        phase4SkippedReason: 'no_queued_or_failed_rows_after_reconciliation',
        queueAfter: {
          failed: 0,
          processing: 1,
          queued: 0,
          sent: 1,
          skipped: 2,
          total: 4,
        },
        queueBefore: {
          failed: 0,
          processing: 1,
          queued: 2,
          sent: 1,
          skipped: 0,
          total: 4,
        },
        reconciliationDiagnostics: {
          coveredBySentEmail: 1,
          missingSenderPlatformUser: 2,
          orphaned: 2,
          upserted: 0,
        },
      },
      reconciliation: {
        checked: 4,
        enqueued: 0,
        processedPosts: 2,
        remainingPosts: 5,
      },
    });

    expect(processPostEmailQueueBatchMock).not.toHaveBeenCalled();
  });

  it('paginates queue summaries and runs phase 4 when reconciliation requeues rows', async () => {
    mockQueueStatusSnapshots([
      makeQueueRows({ skipped: 1000 }),
      makeQueueRows({ skipped: 1 }),
      makeQueueRows({ queued: 1000 }),
      makeQueueRows({ queued: 1 }),
      makeQueueRows({ sent: 1000 }),
      makeQueueRows({ sent: 1 }),
    ]);

    reconcileOrphanedApprovedPostsMock.mockResolvedValue({
      checked: 1001,
      diagnostics: {
        alreadySent: 0,
        checked: 1001,
        coveredByExistingQueue: 900,
        coveredBySentEmail: 0,
        eligibleRecipients: 101,
        existingProcessing: 0,
        existingQueued: 0,
        existingSkipped: 101,
        missingCompletion: 0,
        missingEmail: 0,
        missingSenderPlatformUser: 0,
        missingUserRecord: 0,
        notApproved: 0,
        orphaned: 101,
        upserted: 101,
      },
      enqueued: 101,
      processedPosts: 75,
      remainingPosts: 0,
    });
    processPostEmailQueueBatchMock.mockResolvedValue({
      claimed: 50,
      failed: 0,
      processed: 50,
      results: [],
      timedOut: false,
    });

    const response = await GET(
      new NextRequest('http://localhost/api/cron/process-post-email-queue', {
        headers: {
          Authorization: 'Bearer cron-secret',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      diagnostics: {
        phase4SkippedReason: null,
        queueBefore: {
          queued: 0,
          sent: 0,
          skipped: 1001,
          total: 1001,
        },
        queueAfterReconciliation: {
          queued: 1001,
          sent: 0,
          skipped: 0,
          total: 1001,
        },
      },
      claimed: 50,
      processed: 50,
      reconciliation: {
        checked: 1001,
        enqueued: 101,
        processedPosts: 75,
        remainingPosts: 0,
      },
    });

    expect(processPostEmailQueueBatchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps scanning reconciliation pages when the queue is idle and the first page enqueues nothing', async () => {
    mockQueueStatusSnapshots([
      makeQueueRows({ skipped: 5 }),
      makeQueueRows({ queued: 3 }),
      makeQueueRows({ sent: 3, skipped: 5 }),
    ]);

    reconcileOrphanedApprovedPostsMock
      .mockResolvedValueOnce({
        checked: 120,
        diagnostics: {
          alreadySent: 10,
          checked: 120,
          coveredByExistingQueue: 80,
          coveredBySentEmail: 10,
          eligibleRecipients: 0,
          existingProcessing: 0,
          existingQueued: 0,
          existingSkipped: 0,
          missingCompletion: 0,
          missingEmail: 30,
          missingSenderPlatformUser: 0,
          missingUserRecord: 0,
          notApproved: 0,
          orphaned: 30,
          upserted: 0,
        },
        enqueued: 0,
        processedPosts: 50,
        remainingPosts: 20,
      })
      .mockResolvedValueOnce({
        checked: 120,
        diagnostics: {
          alreadySent: 10,
          checked: 120,
          coveredByExistingQueue: 80,
          coveredBySentEmail: 10,
          eligibleRecipients: 3,
          existingProcessing: 0,
          existingQueued: 0,
          existingSkipped: 0,
          missingCompletion: 0,
          missingEmail: 2,
          missingSenderPlatformUser: 0,
          missingUserRecord: 0,
          notApproved: 0,
          orphaned: 30,
          upserted: 3,
        },
        enqueued: 3,
        processedPosts: 20,
        remainingPosts: 0,
      });

    processPostEmailQueueBatchMock.mockResolvedValue({
      claimed: 3,
      failed: 0,
      processed: 3,
      results: [],
      timedOut: false,
    });

    const response = await GET(
      new NextRequest('http://localhost/api/cron/process-post-email-queue', {
        headers: {
          Authorization: 'Bearer cron-secret',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      diagnostics: {
        phase4SkippedReason: null,
        queueAfterReconciliation: {
          queued: 3,
          sent: 0,
          skipped: 0,
          total: 3,
        },
        reconciliationDiagnostics: {
          alreadySent: 10,
          coveredByExistingQueue: 80,
          coveredBySentEmail: 10,
          eligibleRecipients: 3,
          missingEmail: 32,
          orphaned: 30,
          upserted: 3,
        },
      },
      reconciliation: {
        checked: 120,
        enqueued: 3,
        processedPosts: 70,
        remainingPosts: 0,
      },
      processed: 3,
    });

    expect(reconcileOrphanedApprovedPostsMock).toHaveBeenCalledTimes(2);
    expect(reconcileOrphanedApprovedPostsMock).toHaveBeenNthCalledWith(
      1,
      adminClientMock,
      {
        maxPosts: 250,
      }
    );
    expect(reconcileOrphanedApprovedPostsMock).toHaveBeenNthCalledWith(
      2,
      adminClientMock,
      {
        maxPosts: 250,
        skipPosts: 50,
      }
    );
    expect(processPostEmailQueueBatchMock).toHaveBeenCalledTimes(1);
  });
});
