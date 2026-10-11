import {
  MAX_PERIODIC_DELIVERY_BATCH_SIZE,
  type PeriodicReport,
} from '@tuturuuu/internal-api/reports';

export const MAX_SELECTED_DELIVERIES = MAX_PERIODIC_DELIVERY_BATCH_SIZE;

// A retry, cancelled delivery, or intentionally skipped report is never a new batch send.
export function canSelectPeriodicDelivery(report: PeriodicReport) {
  return (
    report.report_approval_status === 'APPROVED' &&
    report.generation_status === 'ready' &&
    report.delivery_status === 'draft' &&
    Boolean(report.user_email?.trim()) &&
    !report.last_delivery_error &&
    (!report.report_stage || report.report_stage === 'approved')
  );
}

export function samePeriodicRecipient(a: PeriodicReport, b: PeriodicReport) {
  return (
    a.id === b.id &&
    a.user_id === b.user_id &&
    a.user_email?.trim().toLowerCase() === b.user_email?.trim().toLowerCase() &&
    canSelectPeriodicDelivery(b)
  );
}
