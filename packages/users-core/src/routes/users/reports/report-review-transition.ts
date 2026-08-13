export type ReportReviewTransition = 'approved' | 'pending' | null;

export function resolveReportReviewTransition({
  approvalEnabled,
  approvalTouched,
  canApproveReports,
  isAiReport,
  reviewableFieldsChanged,
}: {
  approvalEnabled: boolean;
  approvalTouched: boolean;
  canApproveReports: boolean;
  isAiReport: boolean;
  reviewableFieldsChanged: boolean;
}): ReportReviewTransition {
  if (approvalTouched || !reviewableFieldsChanged) {
    return null;
  }

  if (isAiReport || (approvalEnabled && !canApproveReports)) {
    return 'pending';
  }

  if (!approvalEnabled) {
    return 'approved';
  }

  return null;
}
