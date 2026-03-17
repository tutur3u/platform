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
  // Missing approvalStatus (null/undefined) is treated as a safe default: it does
  // not satisfy isPendingApproval, but it is still blocked when
  // restrictReportExportToApproved is true because approvalStatus !== 'APPROVED'.
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
