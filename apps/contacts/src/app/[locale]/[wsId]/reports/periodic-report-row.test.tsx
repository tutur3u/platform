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

it.each([
  ['Recipient is unsubscribed or blocked.', 'category_suppression'],
  ['Subject profile email is missing.', 'category_missing_email'],
  [
    'Email delivery outcome is unknown. Check provider logs before retrying.',
    'category_unknown',
  ],
  ['Delivery gate blocked: sender_not_configured', 'category_infrastructure'],
])(
  'shows %s without an unsafe send or Retry action',
  (last_delivery_error, category) => {
    render(
      <PeriodicReportRow
        report={
          {
            id: 'blocked',
            title: 'Monthly report',
            user_id: 'user',
            user_name: 'Recipient',
            user_email: 'recipient@example.com',
            report_approval_status: 'APPROVED',
            delivery_status: 'blocked',
            generation_status: 'ready',
            last_delivery_error,
          } as PeriodicReport
        }
        wsId="workspace"
        permissions={{ canApproveReports: false, canSendReports: true }}
        approvalPending={false}
        generationPending={false}
        onApprove={vi.fn()}
        onGenerate={vi.fn()}
        onPreview={vi.fn()}
        onEmailPreview={vi.fn()}
        onDeliveryIntent={vi.fn()}
      />
    );
    expect(screen.getByText(category)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'send' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'retry_delivery' })
    ).not.toBeInTheDocument();
  }
);
it('offers permitted inline remediation without sending or approving', () => {
  const edit = vi.fn();
  const delivery = vi.fn();
  render(
    <PeriodicReportRow
      report={
        {
          id: 'missing',
          title: 'Monthly report',
          user_id: 'user',
          user_name: 'Recipient',
          user_email: null,
          report_approval_status: 'APPROVED',
          delivery_status: 'draft',
          generation_status: 'ready',
          last_delivery_error: null,
        } as PeriodicReport
      }
      wsId="workspace"
      permissions={{
        canApproveReports: false,
        canSendReports: true,
        canUpdateUsers: true,
      }}
      approvalPending={false}
      generationPending={false}
      onApprove={vi.fn()}
      onGenerate={vi.fn()}
      onPreview={vi.fn()}
      onEmailPreview={vi.fn()}
      onDeliveryIntent={delivery}
      onEditRecipient={edit}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'edit_recipient' }));
  expect(edit).toHaveBeenCalledOnce();
  expect(delivery).not.toHaveBeenCalled();
  expect(screen.getByRole('checkbox')).toBeDisabled();
});
