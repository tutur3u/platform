import { fireEvent, render, screen } from '@testing-library/react';
import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import { expect, it, vi } from 'vitest';
import { PeriodicReportRow } from './periodic-report-row';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
it('labels legacy approval as pending and keeps successful tests distinct from report delivery', () => {
  const approve = vi.fn();
  const report: PeriodicReport = {
    id: 'report-1',
    title: 'Monthly report',
    approved_at: null,
    report_approval_status: null,
    cadence: 'monthly',
    content: '',
    feedback: '',
    created_at: '2026-09-01',
    updated_at: '2026-09-01',
    delivery_status: 'draft',
    test_delivery: { status: 'sent', sent_at: '2026-09-11T15:20:00Z' },
    generation_mode: 'manual',
    generation_status: 'ready',
    group_id: 'group-1',
    group_name: 'Class',
    last_delivery_error: null,
    manager_instruction: null,
    period_start: null,
    period_end: null,
    score: null,
    user_email: 'test@example.com',
    user_id: 'user-1',
    user_name: 'Test student',
  };
  const { rerender } = render(
    <PeriodicReportRow
      report={report}
      wsId="workspace"
      permissions={{ canApproveReports: true, canSendReports: false }}
      approvalPending={false}
      generationPending={false}
      onApprove={approve}
      onGenerate={vi.fn()}
      onPreview={vi.fn()}
      onEmailPreview={vi.fn()}
      onDeliveryIntent={vi.fn()}
    />
  );
  expect(screen.getByText('status_pending')).toBeInTheDocument();
  expect(screen.getByText('live_delivery')).toBeInTheDocument();
  expect(screen.getByText('not_sent')).toBeInTheDocument();
  expect(screen.getByText('test_send')).toBeInTheDocument();
  expect(screen.getByText('status_sent')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'approve' }));
  expect(approve).toHaveBeenCalledOnce();
  rerender(
    <PeriodicReportRow
      report={{
        ...report,
        report_stage: 'skipped',
        delivery_status: 'skipped',
      }}
      wsId="workspace"
      permissions={{ canApproveReports: true, canSendReports: false }}
      approvalPending={false}
      generationPending={false}
      onApprove={approve}
      onGenerate={vi.fn()}
      onPreview={vi.fn()}
      onEmailPreview={vi.fn()}
      onDeliveryIntent={vi.fn()}
    />
  );
  expect(screen.getAllByText('status_skipped')).toHaveLength(1);
  expect(screen.queryByText('live_delivery')).not.toBeInTheDocument();
  expect(screen.queryByText('not_sent')).not.toBeInTheDocument();
  expect(screen.getByText('test_send')).toBeInTheDocument();
});
