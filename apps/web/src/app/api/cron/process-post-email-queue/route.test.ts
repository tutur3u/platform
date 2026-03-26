import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  adminClientMock,
  autoSkipOldApprovedPostChecksMock,
  autoSkipOldPostEmailsMock,
  autoSkipRejectedPostsMock,
  cleanupStaleProcessingRowsMock,
  createAdminClientMock,
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
  processPostEmailQueueBatch: processPostEmailQueueBatchMock,
  reconcileOrphanedApprovedPosts: reconcileOrphanedApprovedPostsMock,
  reEnqueueSkippedPostEmails: reEnqueueSkippedPostEmailsMock,
}));

import { GET } from './route';

function makeQueueRows(summary: {
  failed?: number;
  processing?: number;
  queued?: number;
  sent?: number;
  skipped?: number;
}) {
  return [
    ...Array.from({ length: summary.queued ?? 0 }, () => ({
      status: 'queued',
    })),
    ...Array.from({ length: summary.processing ?? 0 }, () => ({
      status: 'processing',
    })),
    ...Array.from({ length: summary.failed ?? 0 }, () => ({
      status: 'failed',
    })),
    ...Array.from({ length: summary.sent ?? 0 }, () => ({ status: 'sent' })),
    ...Array.from({ length: summary.skipped ?? 0 }, () => ({
      status: 'skipped',
    })),
  ];
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
    const queueSnapshots = [
      makeQueueRows({ processing: 1, queued: 2, sent: 1 }),
      makeQueueRows({ processing: 1, sent: 1, skipped: 2 }),
      makeQueueRows({ processing: 1, sent: 1, skipped: 2 }),
    ];

    adminClientMock.from.mockImplementation((table: string) => {
      expect(table).toBe('post_email_queue');

      return {
        select: vi.fn(async () => ({
          data: queueSnapshots.shift() ?? [],
          error: null,
        })),
      };
    });

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
      },
    });

    expect(processPostEmailQueueBatchMock).not.toHaveBeenCalled();
  });
});
