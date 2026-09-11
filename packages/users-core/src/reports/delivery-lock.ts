/** PostgreSQL lock conflict raised by the processing-report snapshot guard. */
export function isReportDeliveryLocked(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '55P03'
  );
}
export const REPORT_DELIVERY_LOCKED_MESSAGE =
  'Report delivery is in progress. Try again after it finishes.';
