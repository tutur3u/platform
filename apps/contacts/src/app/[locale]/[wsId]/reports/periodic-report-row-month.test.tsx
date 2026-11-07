import { fireEvent, render, screen } from '@testing-library/react';
import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import { expect, it, vi } from 'vitest';
import { PeriodicReportRow } from './periodic-report-row';

vi.mock('next-intl', () => ({
  useTranslations:
    () => (key: string, values?: Record<string, string | number>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
}));

// Synthetic fixture: a manual monthly report written on 2 Nov (GMT+7).
const report: PeriodicReport = {
  id: 'report-1',
  title: 'Monthly report',
  approved_at: null,
  report_approval_status: 'PENDING',
  cadence: 'monthly',
  content: '',
  feedback: '',
  created_at: '2026-11-02T03:00:00Z',
  updated_at: '2026-11-02T03:00:00Z',
  delivery_status: 'draft',
  generation_mode: 'manual',
  generation_status: 'ready',
  group_id: 'group-1',
  group_name: 'Class',
  last_delivery_error: null,
  manager_instruction: null,
  period_start: null,
  period_end: null,
  report_month: '2026-10',
  report_month_estimated: true,
  score: null,
  user_email: 'student@example.test',
  user_id: 'user-1',
  user_name: 'Student',
};

function renderRow(
  overrides: Partial<PeriodicReport>,
  onSetMonth?: (month: string) => void,
  canApproveReports = false
) {
  return render(
    <PeriodicReportRow
      report={{ ...report, ...overrides }}
      wsId="workspace"
      permissions={{ canApproveReports, canSendReports: false }}
      approvalPending={false}
      generationPending={false}
      onApprove={vi.fn()}
      onGenerate={vi.fn()}
      onPreview={vi.fn()}
      onEmailPreview={vi.fn()}
      onDeliveryIntent={vi.fn()}
      onSetMonth={onSetMonth}
    />
  );
}

it('marks a report without a saved month as estimated and saves that month in one click', () => {
  const setMonth = vi.fn();
  renderRow({}, setMonth);
  expect(
    screen.getByText('month_option:{"month":"10/2026"}')
  ).toBeInTheDocument();
  expect(screen.getByText('estimated_month')).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'set_month:{"month":"10/2026"}' })
  );
  expect(setMonth).toHaveBeenCalledWith('2026-10');
});

it('shows a saved month without the estimate hint or the set-month action', () => {
  renderRow(
    {
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      report_month_estimated: false,
    },
    vi.fn()
  );
  expect(
    screen.getByText('month_option:{"month":"10/2026"}')
  ).toBeInTheDocument();
  expect(screen.queryByText('estimated_month')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /set_month/ })
  ).not.toBeInTheDocument();
});

it('offers no set-month action without the edit permission', () => {
  renderRow({});
  expect(screen.getByText('estimated_month')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /set_month/ })
  ).not.toBeInTheDocument();
});

it.each([
  { delivery_status: 'sent' as const },
  { delivered_at: '2026-11-03T02:00:00Z' },
])('offers Set month on a sent report only to approvers %j', (sent) => {
  const { unmount } = renderRow(sent, vi.fn());
  expect(
    screen.queryByRole('button', { name: /set_month/ })
  ).not.toBeInTheDocument();
  unmount();
  renderRow(sent, vi.fn(), true);
  expect(
    screen.getByRole('button', { name: 'set_month:{"month":"10/2026"}' })
  ).toBeInTheDocument();
});
