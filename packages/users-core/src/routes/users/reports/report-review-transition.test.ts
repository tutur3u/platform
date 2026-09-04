import { describe, expect, it } from 'vitest';
import { resolveReportReviewTransition } from './report-review-transition';

describe('resolveReportReviewTransition', () => {
  it('returns a rejected teacher revision to pending review', () => {
    expect(
      resolveReportReviewTransition({
        approvalEnabled: true,
        approvalTouched: false,
        canApproveReports: false,
        isAiReport: false,
        reviewableFieldsChanged: true,
      })
    ).toBe('pending');
  });

  it('keeps explicit reviewer decisions authoritative', () => {
    expect(
      resolveReportReviewTransition({
        approvalEnabled: true,
        approvalTouched: true,
        canApproveReports: true,
        isAiReport: false,
        reviewableFieldsChanged: true,
      })
    ).toBeNull();
  });

  it('approves manual revisions when report approval is disabled', () => {
    expect(
      resolveReportReviewTransition({
        approvalEnabled: false,
        approvalTouched: false,
        canApproveReports: false,
        isAiReport: false,
        reviewableFieldsChanged: true,
      })
    ).toBe('approved');
  });

  it('does not change review state for unrelated updates', () => {
    expect(
      resolveReportReviewTransition({
        approvalEnabled: true,
        approvalTouched: false,
        canApproveReports: false,
        isAiReport: false,
        reviewableFieldsChanged: false,
      })
    ).toBeNull();
  });
});
