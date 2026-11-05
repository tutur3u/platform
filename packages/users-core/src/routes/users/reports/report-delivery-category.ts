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

interface HeldCandidate {
  delivery_status: string | null;
  delivered_at?: string | null;
  generation_status?: string | null;
  last_delivery_error: string | null;
  report_approval_status?: string | null;
  report_stage?: string | null;
}

// Approved, but no delivery was ever requested: not queued, processing, sent,
// failed, blocked, skipped or cancelled. Approval queues a send only while
// auto-send is on at that moment, so these wait for an explicit choice.
// Classification only: nothing here, or anywhere automatic, requests them.
export function isHeldPeriodicReport(report: HeldCandidate) {
  const approvedStage = report.report_stage
    ? report.report_stage === 'approved'
    : report.generation_status === 'ready';
  return (
    approvedStage &&
    report.report_approval_status === 'APPROVED' &&
    report.delivery_status === 'draft' &&
    !report.delivered_at &&
    !report.last_delivery_error?.trim()
  );
}

// Categories describe recorded evidence, not a fresh provider or suppression check.
// Resend treats only 'failure' as retryable; private.request_periodic_report_resend
// (20261104121500_periodic_report_resend_action.sql) mirrors these error
// phrases under the row lock. Keep both lists in sync.
export function periodicDeliveryCategory(
  report: HeldCandidate & { user_email: string | null }
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
