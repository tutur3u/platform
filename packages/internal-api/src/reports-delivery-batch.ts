import type { PeriodicReportDeliveryStatus } from './reports';

export const MAX_PERIODIC_DELIVERY_BATCH_SIZE = 100;

export interface PeriodicReportDeliveryBatchItem {
  reportId: string;
  queued: boolean;
  outcome: 'queued' | 'not-queued' | 'uncertain';
  status?: PeriodicReportDeliveryStatus;
  error?: string;
}

export interface PeriodicReportDeliveryBatchProgress {
  total: number;
  completed: number;
  queued: number;
  currentReportId: string | null;
  items: PeriodicReportDeliveryBatchItem[];
}

export interface PeriodicReportDeliveryBatchControls {
  assertActive: () => void;
  onProgress?: (progress: PeriodicReportDeliveryBatchProgress) => void;
}

export interface PeriodicReportDeliveryBatchResult {
  items: PeriodicReportDeliveryBatchItem[];
  stopped: boolean;
  stopReason: 'complete' | 'cancelled' | 'rejected' | 'uncertain';
  remainingReportIds: string[];
}

type QueueResponse = {
  queued: boolean;
  status: PeriodicReportDeliveryStatus;
  message: string;
};

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Uses the existing per-report endpoint, sequentially and without retries. */
export async function queuePeriodicReportDeliveryBatch(
  workspaceId: string,
  reportIds: readonly string[],
  controls: PeriodicReportDeliveryBatchControls,
  request: (reportId: string) => Promise<QueueResponse>
): Promise<PeriodicReportDeliveryBatchResult> {
  if (
    !UUID.test(workspaceId) ||
    !Array.isArray(reportIds) ||
    reportIds.length === 0 ||
    reportIds.length > MAX_PERIODIC_DELIVERY_BATCH_SIZE ||
    reportIds.some((id) => typeof id !== 'string' || !UUID.test(id))
  ) {
    throw new Error('Invalid report delivery batch.');
  }
  const ids = [...new Set(reportIds)];
  const items: PeriodicReportDeliveryBatchItem[] = [];
  const result = (
    stopReason: PeriodicReportDeliveryBatchResult['stopReason'],
    remainingReportIds: string[]
  ): PeriodicReportDeliveryBatchResult => ({
    items: items.map((item) => ({ ...item })),
    stopped: stopReason !== 'complete',
    stopReason,
    remainingReportIds,
  });
  const publish = (currentReportId: string | null) => {
    // Never publish captured report data to a superseded actor/workspace.
    controls.assertActive();
    controls.onProgress?.({
      total: ids.length,
      completed: items.length,
      queued: items.filter((item) => item.queued).length,
      currentReportId,
      items: items.map((item) => ({ ...item })),
    });
    controls.assertActive();
  };

  for (const [index, reportId] of ids.entries()) {
    try {
      publish(reportId);
    } catch {
      return result('cancelled', ids.slice(index));
    }
    let stopReason: PeriodicReportDeliveryBatchResult['stopReason'] =
      'complete';
    try {
      const response = await request(reportId);
      if (response?.queued === true && response.status === 'queued') {
        items.push({
          reportId,
          queued: true,
          outcome: 'queued',
          status: 'queued',
        });
      } else if (response?.queued === false && response.status === 'blocked') {
        items.push({
          reportId,
          queued: false,
          outcome: 'not-queued',
          status: response.status,
          error: response.message,
        });
        stopReason = 'rejected';
      } else {
        items.push({ reportId, queued: false, outcome: 'uncertain' });
        stopReason = 'uncertain';
      }
    } catch (error) {
      // A transport error/409 cannot establish whether the mutation committed.
      items.push({
        reportId,
        queued: false,
        outcome: 'uncertain',
        error: error instanceof Error ? error.message : undefined,
      });
      stopReason = 'uncertain';
    }
    try {
      publish(null);
    } catch {
      return result('cancelled', ids.slice(index + 1));
    }
    if (stopReason !== 'complete')
      return result(stopReason, ids.slice(index + 1));
  }
  return result('complete', []);
}
