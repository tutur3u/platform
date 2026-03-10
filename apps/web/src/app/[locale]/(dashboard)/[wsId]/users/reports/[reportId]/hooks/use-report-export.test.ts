import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizePrintAfterExportPreference,
  useReportExport,
} from './use-report-export';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('normalizePrintAfterExportPreference', () => {
  it('only enables print-after-export for boolean true', () => {
    expect(normalizePrintAfterExportPreference(true)).toBe(true);
    expect(normalizePrintAfterExportPreference(false)).toBe(false);
    expect(normalizePrintAfterExportPreference('true')).toBe(false);
    expect(normalizePrintAfterExportPreference('false')).toBe(false);
    expect(normalizePrintAfterExportPreference(1)).toBe(false);
    expect(normalizePrintAfterExportPreference(null)).toBe(false);
  });
});

describe('useReportExport', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('repairs malformed stored print-after-export values back to false', async () => {
    window.localStorage.setItem(
      'report-print-after-export',
      JSON.stringify('false')
    );

    const { result } = renderHook(() =>
      useReportExport({
        previewTitle: 'Progress report',
        isDarkPreview: false,
        isPaginationReady: true,
      })
    );

    await waitFor(() => {
      expect(result.current.printAfterExport).toBe(false);
      expect(window.localStorage.getItem('report-print-after-export')).toBe(
        'false'
      );
    });
  });
});
