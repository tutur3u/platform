export const DELIVERY_CATEGORIES = [
  'missing_email',
  'suppression',
  'infrastructure',
  'unknown',
  'approval',
  'failure',
] as const;
export type DeliveryCategory = (typeof DELIVERY_CATEGORIES)[number];

// Categories describe recorded evidence, not a fresh provider or suppression check.
export function periodicDeliveryCategory(report: {
  delivery_status: string | null;
  user_email: string | null;
  last_delivery_error: string | null;
}): DeliveryCategory | null {
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
  return null;
}
