import type { ApprovalStatus } from '../../approvals/utils';

export function isWorkspaceBooleanEnabled(value?: string | null): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function shouldBlockReportExport({
  approvalStatus,
  canApproveReports,
  restrictReportExportToApproved,
}: {
  approvalStatus?: ApprovalStatus | null;
  canApproveReports: boolean;
  restrictReportExportToApproved: boolean;
}): boolean {
  const isPendingApproval = approvalStatus === 'PENDING' && !canApproveReports;

  return (
    isPendingApproval ||
    (restrictReportExportToApproved && approvalStatus !== 'APPROVED')
  );
}

export function shouldShowPendingWatermark({
  approvalStatus,
  enablePendingWatermark,
}: {
  approvalStatus?: ApprovalStatus | null;
  enablePendingWatermark: boolean;
}): boolean {
  return enablePendingWatermark && approvalStatus === 'PENDING';
}
