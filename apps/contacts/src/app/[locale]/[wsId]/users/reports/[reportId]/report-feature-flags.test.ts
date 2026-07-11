import { describe, expect, it } from 'vitest';
import {
  isWorkspaceBooleanEnabled,
  shouldBlockReportExport,
  shouldShowPendingWatermark,
} from './report-feature-flags';

describe('report feature flags', () => {
  describe('shouldBlockReportExport', () => {
    it('blocks export for pending reports when creator cannot approve', () => {
      expect(
        shouldBlockReportExport({
          approvalStatus: 'PENDING',
          canApproveReports: false,
          restrictReportExportToApproved: false,
        })
      ).toBe(true);
    });

    it('blocks export for non-approved reports when strict export flag is enabled', () => {
      expect(
        shouldBlockReportExport({
          approvalStatus: 'REJECTED',
          canApproveReports: true,
          restrictReportExportToApproved: true,
        })
      ).toBe(true);

      expect(
        shouldBlockReportExport({
          approvalStatus: 'PENDING',
          canApproveReports: true,
          restrictReportExportToApproved: true,
        })
      ).toBe(true);
    });

    it('allows export for approved reports when strict export flag is enabled', () => {
      expect(
        shouldBlockReportExport({
          approvalStatus: 'APPROVED',
          canApproveReports: true,
          restrictReportExportToApproved: true,
        })
      ).toBe(false);
    });
  });

  describe('shouldShowPendingWatermark', () => {
    it('shows watermark only when pending watermark flag is enabled and status is pending', () => {
      expect(
        shouldShowPendingWatermark({
          approvalStatus: 'PENDING',
          enablePendingWatermark: true,
        })
      ).toBe(true);

      expect(
        shouldShowPendingWatermark({
          approvalStatus: 'APPROVED',
          enablePendingWatermark: true,
        })
      ).toBe(false);

      expect(
        shouldShowPendingWatermark({
          approvalStatus: 'PENDING',
          enablePendingWatermark: false,
        })
      ).toBe(false);
    });
  });

  describe('isWorkspaceBooleanEnabled', () => {
    it('parses truthy and falsy workspace config values', () => {
      expect(isWorkspaceBooleanEnabled('true')).toBe(true);
      expect(isWorkspaceBooleanEnabled(' TRUE ')).toBe(true);
      expect(isWorkspaceBooleanEnabled('false')).toBe(false);
      expect(isWorkspaceBooleanEnabled(undefined)).toBe(false);
    });
  });
});
