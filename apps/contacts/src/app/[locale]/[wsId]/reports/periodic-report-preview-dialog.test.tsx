import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  PeriodicReport,
  PeriodicReportEmailPreview,
} from '@tuturuuu/internal-api/reports';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PeriodicReportPreviewDialog } from './periodic-report-preview-dialog';

const load = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/reports', () => ({
  getPeriodicReportEmailPreview: load,
}));
vi.mock('./periodic-delivery-status', () => ({
  PeriodicDeliveryStatus: () => <div>Delivery history</div>,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const report = {
  id: 'report-1',
  title: 'August report',
  updated_at: '2026-09-11',
  user_name: 'Learner',
  user_email: 'learner@example.com',
  group_name: 'Class',
  report_approval_status: 'APPROVED',
  delivery_status: 'sent',
} as PeriodicReport;
function mount(
  selected: PeriodicReport | null = report,
  emailPreview?: PeriodicReportEmailPreview
) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PeriodicReportPreviewDialog
        wsId="workspace"
        report={selected}
        emailPreview={emailPreview}
        onOpenChange={() => {}}
      />
    </QueryClientProvider>
  );
}
describe('monthly recipient preview', () => {
  beforeEach(() => {
    load.mockReset().mockResolvedValue({
      html: '<html><body>Branded saved report</body></html>',
      title: 'August report',
      recipient: report.user_email,
    });
  });
  it('displays server-rendered email HTML in an isolated frame and retains full report navigation', async () => {
    mount();
    const frame = await screen.findByTitle('preview');
    expect(frame).toHaveAttribute(
      'srcdoc',
      '<html><body>Branded saved report</body></html>'
    );
    expect(frame).toHaveAttribute('sandbox', '');
    expect(
      screen.getByRole('link', { name: 'open_full_report' })
    ).toHaveAttribute('href', '/workspace/users/reports/report-1');
    expect(load).toHaveBeenCalledWith('workspace', 'report-1');
    expect(
      screen.queryByText(/Nothing has been queued/)
    ).not.toBeInTheDocument();
  });
  it('offers retry on preview failure without showing stale simplified content', async () => {
    load.mockRejectedValueOnce(new Error('Unavailable'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'retry' }));
    expect(await screen.findByTitle('preview')).toBeInTheDocument();
  });
  it('retains a supplied authorized preview without a second read', async () => {
    mount(report, {
      html: '<html>Supplied preview</html>',
      title: 'August',
      recipient: 'learner@example.com',
    } as PeriodicReportEmailPreview);
    expect(await screen.findByTitle('preview')).toHaveAttribute(
      'srcdoc',
      '<html>Supplied preview</html>'
    );
    expect(load).not.toHaveBeenCalled();
  });
  it('does not request a report when closed', () => {
    mount(null);
    expect(load).not.toHaveBeenCalled();
  });
});
