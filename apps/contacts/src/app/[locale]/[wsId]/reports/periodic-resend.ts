import {
  PERIODIC_RESEND_STUCK_AFTER_MINUTES,
  type PeriodicReport,
} from '@tuturuuu/internal-api/reports';
import {
  isHeldPeriodicReport,
  periodicDeliveryCategory,
} from './periodic-delivery-category';

export type ResendRowReason = 'failed' | 'stuck' | 'held';

// Mirrors the server rule for showing actions only. The server re-checks
// every report, including its queue row, before anything is resent.
export function periodicResendReason(
  report: PeriodicReport,
  now: number
): ResendRowReason | null {
  if (report.report_approval_status !== 'APPROVED') return null;
  if (!report.user_email?.trim()) return null;
  const category = periodicDeliveryCategory(report);
  if (category === 'unknown') return null;
  if (report.delivery_status === 'queued') {
    const requested = report.delivery_requested_at
      ? Date.parse(report.delivery_requested_at)
      : Number.NaN;
    return Number.isFinite(requested) &&
      now - requested >= PERIODIC_RESEND_STUCK_AFTER_MINUTES * 60_000
      ? 'stuck'
      : null;
  }
  if (
    report.delivery_status === 'failed' ||
    report.delivery_status === 'blocked'
  )
    return category === 'failure' ? 'failed' : null;
  if (report.delivery_status === 'draft' && isHeldPeriodicReport(report))
    return 'held';
  return null;
}
