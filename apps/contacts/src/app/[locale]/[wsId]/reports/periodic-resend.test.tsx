import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import type { PeriodicReport } from '@tuturuuu/internal-api/reports';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en.json';
import vi_ from '../../../../../messages/vi.json';
import { PeriodicDeliveryWorklist } from './periodic-delivery-worklist';
import { PeriodicReportRow } from './periodic-report-row';
import { periodicResendReason } from './periodic-resend';
import { PeriodicResendDialog } from './periodic-resend-dialog';

// Synthetic reports only. The resend API is mocked: nothing here can count,
// queue or send a real report.
const api = vi.hoisted(() => ({
  preview: vi.fn(),
  resend: vi.fn(),
  groups: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api/reports')>()),
  previewResendPeriodicReports: api.preview,
  resendPeriodicReports: api.resend,
  listWorkspaceReportGroups: api.groups,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const NOW = Date.now();
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
function report(change: Partial<PeriodicReport> = {}): PeriodicReport {
  return {
    id: 'report-1',
    approved_at: ago(600),
    cadence: 'monthly',
    content: '',
    created_at: ago(900),
    delivery_status: 'draft',
    delivery_requested_at: null,
    feedback: '',
    generation_mode: 'manual',
    generation_status: 'ready',
    group_id: 'class-a',
    group_name: 'Class A',
    last_delivery_error: null,
    manager_instruction: null,
    period_end: '2026-09-30',
    period_start: '2026-09-01',
    report_approval_status: 'APPROVED',
    report_stage: 'approved',
    score: null,
    title: 'September report',
    updated_at: ago(600),
    user_email: 'learner@example.com',
    user_id: 'learner-1',
    user_name: 'Learner',
    ...change,
  };
}
const failed = report({
  delivery_status: 'failed',
  report_stage: 'failed',
  last_delivery_error: 'Email provider rejected the delivery.',
});
const stuck = report({
  delivery_status: 'queued',
  report_stage: 'queued',
  delivery_requested_at: ago(90),
});

const wrap = (node: ReactNode, messages = en, locale = 'en') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );

function row(value: PeriodicReport, onResend?: () => void) {
  return wrap(
    <PeriodicReportRow
      report={value}
      wsId="workspace-a"
      permissions={{ canApproveReports: false, canSendReports: true }}
      approvalPending={false}
      generationPending={false}
      onApprove={vi.fn()}
      onDeliveryIntent={vi.fn()}
      onEmailPreview={vi.fn()}
      onGenerate={vi.fn()}
      onPreview={vi.fn()}
      onResend={onResend}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.preview.mockResolvedValue({
    count: 2,
    reasons: { failed: 1, stuck: 1, held: 0 },
    limits: {
      maxReportsPerAction: 100,
      actionsPerWindow: 10,
      actionWindowMinutes: 10,
      reportsPerHour: 300,
      stuckAfterMinutes: 60,
    },
  });
  api.resend.mockImplementation(async (_ws, payload) => ({
    requested: payload.expectedCount,
    affected: payload.expectedCount,
    replayed: false,
  }));
  api.groups.mockResolvedValue({
    groups: [{ id: 'class-a', name: 'Class A' }],
    groupStatusSummary: [],
    hasMore: false,
    selectedGroup: null,
    selectedGroupManagers: [],
  });
});

describe('client resend hint', () => {
  it('mirrors the server rule: failed, stuck and approved-unsent only', () => {
    expect(periodicResendReason(failed, NOW)).toBe('failed');
    expect(periodicResendReason(stuck, NOW)).toBe('stuck');
    expect(periodicResendReason(report(), NOW)).toBe('held');
    for (const value of [
      report({ delivery_status: 'sent', report_stage: 'sent' }),
      report({ delivery_status: 'processing', report_stage: 'processing' }),
      report({ ...stuck, delivery_requested_at: ago(10) }),
      report({ delivery_status: 'skipped', report_stage: 'skipped' }),
      report({
        delivery_status: 'blocked',
        last_delivery_error:
          'Email delivery outcome is unknown. Check provider logs before retrying.',
      }),
      report({
        delivery_status: 'blocked',
        last_delivery_error: 'Recipient is unsubscribed or blocked.',
      }),
      report({ report_approval_status: 'PENDING' }),
    ])
      expect(periodicResendReason(value, NOW)).toBeNull();
  });

  it('never offers resend for a stuck or failed test delivery', () => {
    for (const value of [
      report({ ...stuck, test_delivery: { status: 'queued', sent_at: null } }),
      report({ ...failed, test_delivery: { status: 'failed', sent_at: null } }),
    ])
      expect(periodicResendReason(value, NOW)).toBeNull();
  });
});

describe('per-row Resend', () => {
  it('shows for failed and stuck rows when the admin handler is given', () => {
    const onResend = vi.fn();
    row(failed, onResend);
    fireEvent.click(screen.getByRole('button', { name: 'Resend this report' }));
    expect(onResend).toHaveBeenCalledOnce();
  });

  it('shows for a stuck queued row', () => {
    row(stuck, vi.fn());
    expect(
      screen.getByRole('button', { name: 'Resend this report' })
    ).toBeTruthy();
  });

  it('is hidden for non-admins, held rows (they keep Send), and sent or in-flight rows', () => {
    const { unmount } = row(failed);
    expect(
      screen.queryByRole('button', { name: 'Resend this report' })
    ).toBeNull();
    unmount();
    for (const value of [
      report(),
      report({ delivery_status: 'sent', report_stage: 'sent' }),
      report({ ...stuck, delivery_requested_at: ago(5) }),
    ]) {
      const view = row(value, vi.fn());
      expect(
        screen.queryByRole('button', { name: 'Resend this report' })
      ).toBeNull();
      view.unmount();
    }
  });

  it('uses the Vietnamese label', () => {
    wrap(
      <PeriodicReportRow
        report={failed}
        wsId="workspace-a"
        permissions={{ canApproveReports: false, canSendReports: true }}
        approvalPending={false}
        generationPending={false}
        onApprove={vi.fn()}
        onDeliveryIntent={vi.fn()}
        onEmailPreview={vi.fn()}
        onGenerate={vi.fn()}
        onPreview={vi.fn()}
        onResend={vi.fn()}
      />,
      vi_,
      'vi'
    );
    expect(
      screen.getByRole('button', { name: 'Gửi lại báo cáo này' })
    ).toBeTruthy();
  });
});

describe('bulk Resend', () => {
  function worklist(canResend: boolean, messages = en, locale = 'en') {
    const handlers = { selected: vi.fn(), scope: vi.fn() };
    wrap(
      <PeriodicDeliveryWorklist
        reports={[failed, stuck]}
        eligibleCount={2}
        selectedCount={0}
        canSend
        currentRows
        pending={false}
        categoryFilter={null}
        onCategoryChange={vi.fn()}
        onSelectAll={vi.fn()}
        onClear={vi.fn()}
        onReview={vi.fn()}
        canResend={canResend}
        resendSelectedCount={2}
        onResendSelected={handlers.selected}
        onResendScope={handlers.scope}
      />,
      messages,
      locale
    );
    return handlers;
  }

  it('offers resend for the selection and for a period or class to admins', () => {
    const handlers = worklist(true);
    fireEvent.click(screen.getByRole('button', { name: /Resend 2 selected/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Resend by period or class…' })
    );
    expect(handlers.selected).toHaveBeenCalledOnce();
    expect(handlers.scope).toHaveBeenCalledOnce();
  });

  it('is hidden from non-admins', () => {
    worklist(false);
    expect(screen.queryByRole('button', { name: /Resend/ })).toBeNull();
  });

  it('uses the Vietnamese labels', () => {
    worklist(true, vi_, 'vi');
    expect(
      screen.getByRole('button', { name: /Gửi lại các mục đã chọn \(2\)/ })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Gửi lại theo kỳ hoặc lớp…' })
    ).toBeTruthy();
  });
});

describe('resend confirmation', () => {
  function dialog(
    intent: Parameters<typeof PeriodicResendDialog>[0]['intent'] = {
      kind: 'selection',
      reportIds: ['report-1', 'report-2'],
    }
  ) {
    const resolved = vi.fn();
    const close = vi.fn();
    wrap(
      <PeriodicResendDialog
        intent={intent}
        wsId="workspace-a"
        onClose={close}
        onResolved={resolved}
      />
    );
    return { resolved, close };
  }

  it('shows the exact server count and resends once on a double click', async () => {
    const { resolved } = dialog();
    expect(await screen.findByText('2 reports can be resent.')).toBeTruthy();
    expect(
      screen.getByText('1 failed · 1 stuck in queue · 0 approved, not sent')
    ).toBeTruthy();
    expect(api.preview).toHaveBeenCalledWith('workspace-a', {
      target: 'selection',
      reportIds: ['report-1', 'report-2'],
    });
    const confirm = screen.getByRole('button', { name: 'Resend 2 reports' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(resolved).toHaveBeenCalled());
    expect(api.resend).toHaveBeenCalledOnce();
    expect(api.resend).toHaveBeenCalledWith('workspace-a', {
      target: 'selection',
      reportIds: ['report-1', 'report-2'],
      expectedCount: 2,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    expect(toast.success).toHaveBeenCalledWith('2 reports queued again.');
  });

  it('previews a period scope with the viewer timezone', async () => {
    dialog({
      kind: 'scope',
      cadence: 'monthly',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    expect(await screen.findByText('2 reports can be resent.')).toBeTruthy();
    expect(api.preview).toHaveBeenCalledWith('workspace-a', {
      target: 'scope',
      cadence: 'monthly',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      groupId: undefined,
      timezone: expect.any(String),
    });
  });

  it('cannot confirm when nothing is eligible', async () => {
    api.preview.mockResolvedValueOnce({
      count: 0,
      reasons: { failed: 0, stuck: 0, held: 0 },
      limits: {
        maxReportsPerAction: 100,
        actionsPerWindow: 10,
        actionWindowMinutes: 10,
        reportsPerHour: 300,
        stuckAfterMinutes: 60,
      },
    });
    dialog();
    expect(await screen.findByText('Nothing here can be resent.')).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Resend 0 reports',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('explains the rate limit with the server wait time', async () => {
    api.resend.mockRejectedValueOnce(
      new InternalApiError('Too many', 429, 'RESEND_RATE_LIMITED', 120)
    );
    dialog();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Resend 2 reports' })
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Too many resends in this workspace. Try again in 120 seconds.'
      )
    );
  });
});

describe('resend messages', () => {
  it('has the same resend keys in English and Vietnamese', () => {
    const keys = (messages: typeof en) =>
      Object.keys(messages['reports-hub'])
        .filter((key) => key.startsWith('resend'))
        .sort();
    expect(keys(vi_ as typeof en)).toEqual(keys(en));
    expect(keys(en).length).toBeGreaterThan(10);
  });
});
