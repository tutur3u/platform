/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

import { ReportActions } from '@/app/[locale]/(dashboard)/[wsId]/users/reports/[reportId]/components/report-actions';

describe('ReportActions', () => {
  it('keeps print-after-export settings hidden until the settings trigger is opened', () => {
    render(
      <ReportActions
        isExportBlockedByStatus={false}
        isExporting={false}
        isPaginationReady={true}
        paginationPageCount={2}
        handlePdfExport={vi.fn()}
        handlePrintExport={vi.fn()}
        handlePngExport={vi.fn()}
        reportTheme="auto"
        setReportTheme={vi.fn()}
        defaultExportType="pdf"
        setDefaultExportType={vi.fn()}
        printAfterExport={false}
        setPrintAfterExport={vi.fn()}
      />
    );

    expect(
      screen.queryByText('ws-reports.print_after_pdf_export')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'common.settings' }));

    expect(
      screen.getByText('ws-reports.print_after_pdf_export')
    ).toBeInTheDocument();
    expect(
      screen.getByText('ws-reports.print_after_pdf_export_description')
    ).toBeInTheDocument();
  });
});
