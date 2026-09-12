import { FileText } from '@tuturuuu/icons';
import {
  PERIODIC_REPORT_STAGES,
  type PeriodicReportStage,
} from '@tuturuuu/internal-api/reports';
import { getPostReviewStageAppearance } from '@tuturuuu/users-ui/components/post-status-meta';

const metadata = {
  draft: ['drafts', 'missing_check'],
  pending: ['status_pending', 'pending_approval'],
  approved: ['approved_awaiting_delivery', 'approved_awaiting_delivery'],
  blocked: ['undeliverable', 'undeliverable'],
  queued: ['status_queued', 'queued'],
  processing: ['status_processing', 'processing'],
  sent: ['status_sent', 'sent'],
  failed: ['failed', 'delivery_failed'],
  skipped: ['status_skipped', 'skipped'],
  rejected: ['status_rejected', 'rejected'],
} as const satisfies Record<
  PeriodicReportStage,
  readonly [string, Parameters<typeof getPostReviewStageAppearance>[0]]
>;
export const PERIODIC_STAGES = PERIODIC_REPORT_STAGES.map(
  (stage) => [stage, ...metadata[stage]] as const
);
export function getPeriodicStageAppearance(stage: PeriodicReportStage) {
  const appearance = getPostReviewStageAppearance(metadata[stage][1]);
  return stage === 'draft' ? { ...appearance, icon: FileText } : appearance;
}
