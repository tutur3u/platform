export type ReportReviewTransition = 'pending' | null;

/** Legacy approval settings never turn an ordinary edit into human review. */
export function resolveReportReviewTransition({
  approvalTouched,
  reviewableFieldsChanged,
}: {
  approvalEnabled: boolean;
  approvalTouched: boolean;
  canApproveReports: boolean;
  isAiReport: boolean;
  reviewableFieldsChanged: boolean;
}): ReportReviewTransition {
  return !approvalTouched && reviewableFieldsChanged ? 'pending' : null;
}
