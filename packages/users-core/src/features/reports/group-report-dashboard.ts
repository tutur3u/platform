type ReportOption = {
  id?: string | null;
};

type SelectionRecoveryInput = {
  canCreateReports: boolean;
  reportDetail: unknown | null | undefined;
  reportId: string | null | undefined;
  reports: readonly ReportOption[] | null | undefined;
};

export type ReportSelectionRecovery =
  | { action: 'none' }
  | { action: 'set-report'; reportId: string }
  | { action: 'clear-report' };

export function getReportSelectionRecovery({
  canCreateReports,
  reportDetail,
  reportId,
  reports,
}: SelectionRecoveryInput): ReportSelectionRecovery {
  if (!reportId || reportId === 'new' || reportDetail) {
    return { action: 'none' };
  }

  const firstReportId = reports?.find((report) => report.id)?.id;

  if (firstReportId) {
    return { action: 'set-report', reportId: firstReportId };
  }

  if (canCreateReports) {
    return { action: 'set-report', reportId: 'new' };
  }

  return { action: 'clear-report' };
}

export type ReportsDashboardErrorKind =
  | 'permission'
  | 'rate-limit'
  | 'not-found'
  | 'generic';

export function getReportsDashboardErrorKind({
  code,
  status,
}: {
  code?: string | null;
  status?: number | null;
}): ReportsDashboardErrorKind {
  if (status === 403 || code === 'REPORTS_PERMISSION_DENIED') {
    return 'permission';
  }

  if (status === 429 || code === 'REPORTS_RATE_LIMITED') {
    return 'rate-limit';
  }

  if (status === 404 || code === 'REPORTS_GROUP_NOT_FOUND') {
    return 'not-found';
  }

  return 'generic';
}
