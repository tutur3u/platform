import type { PeriodicReport } from '@tuturuuu/internal-api/reports';

export const DELIVERY_CATEGORIES = [
  'missing_email',
  'suppression',
  'infrastructure',
  'unknown',
  'approval',
  'failure',
  'held',
] as const;
export type DeliveryCategory = (typeof DELIVERY_CATEGORIES)[number];

// Approved, but no delivery was ever requested. Approval queues a send only
// while auto-send is on at that moment, so these wait for an explicit admin
// choice. Mirrors the server classification in users-core.
export function isHeldPeriodicReport(report: PeriodicReport) {
  return (
    (report.report_stage
      ? report.report_stage === 'approved'
      : report.generation_status === 'ready') &&
    report.report_approval_status === 'APPROVED' &&
    report.delivery_status === 'draft' &&
    !report.last_delivery_error?.trim()
  );
}

// Categories describe recorded evidence, not a fresh provider or suppression check.
export function periodicDeliveryCategory(
  report: PeriodicReport
): DeliveryCategory | null {
  if (report.delivery_status === 'sent') return null;
  const error = report.last_delivery_error?.toLowerCase() ?? '';
  if (
    error.includes('outcome is unknown') ||
    error.includes('provider accepted')
  )
    return 'unknown';
  if (error.includes('suppression lookup unavailable')) return 'infrastructure';
  if (
    error.includes('unsubscribed') ||
    error.includes('suppression') ||
    error.includes('recipient is blocked')
  )
    return 'suppression';
  if (!report.user_email?.trim() || error.includes('profile email is missing'))
    return 'missing_email';
  if (
    error.includes('delivery gate blocked') ||
    error.includes('contract') ||
    error.includes('migration') ||
    error.includes('not configured')
  )
    return 'infrastructure';
  if (
    error.includes('approval changed') ||
    error.includes('not approved') ||
    error.includes('subject changed')
  )
    return 'approval';
  if (
    report.delivery_status === 'failed' ||
    report.delivery_status === 'blocked' ||
    error
  )
    return 'failure';
  if (isHeldPeriodicReport(report)) return 'held';
  return null;
}

// Held is a waiting state, not a recorded blocker: it keeps manual Send and Test.
export function isBlockingDeliveryCategory(category: DeliveryCategory | null) {
  return category !== null && category !== 'held';
}
