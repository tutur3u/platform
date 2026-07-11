import { describe, expect, it } from 'vitest';
import {
  getReportSelectionRecovery,
  getReportsDashboardErrorKind,
} from './group-report-dashboard';

describe('group report dashboard helpers', () => {
  it('keeps a valid selected report unchanged', () => {
    expect(
      getReportSelectionRecovery({
        canCreateReports: true,
        reportDetail: { id: 'report-1' },
        reportId: 'report-1',
        reports: [{ id: 'report-1' }],
      })
    ).toEqual({ action: 'none' });
  });

  it('selects the first available report when the requested report is stale', () => {
    expect(
      getReportSelectionRecovery({
        canCreateReports: true,
        reportDetail: null,
        reportId: 'stale-report',
        reports: [{ id: 'report-1' }, { id: 'report-2' }],
      })
    ).toEqual({ action: 'set-report', reportId: 'report-1' });
  });

  it('switches to a new report when no reports exist and creation is allowed', () => {
    expect(
      getReportSelectionRecovery({
        canCreateReports: true,
        reportDetail: null,
        reportId: 'stale-report',
        reports: [],
      })
    ).toEqual({ action: 'set-report', reportId: 'new' });
  });

  it('clears the stale report when no reports exist and creation is blocked', () => {
    expect(
      getReportSelectionRecovery({
        canCreateReports: false,
        reportDetail: null,
        reportId: 'stale-report',
        reports: [],
      })
    ).toEqual({ action: 'clear-report' });
  });

  it('categorizes troubleshooting errors by status and code', () => {
    expect(
      getReportsDashboardErrorKind({
        code: 'REPORTS_PERMISSION_DENIED',
        status: 403,
      })
    ).toBe('permission');

    expect(
      getReportsDashboardErrorKind({
        code: 'REPORTS_RATE_LIMITED',
        status: 429,
      })
    ).toBe('rate-limit');

    expect(
      getReportsDashboardErrorKind({
        code: 'REPORTS_GROUP_NOT_FOUND',
        status: 404,
      })
    ).toBe('not-found');
  });
});
