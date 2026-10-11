import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  approve: vi.fn(),
  edit: vi.fn(),
  list: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/reports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tuturuuu/internal-api/reports')>()),
  PERIODIC_REPORT_STAGES: [
    'draft',
    'pending',
    'approved',
    'blocked',
    'queued',
    'processing',
    'sent',
    'failed',
    'skipped',
    'rejected',
  ],
  listPeriodicReports: mocks.list,
  updatePeriodicReport: mocks.edit,
  requestPeriodicReportDelivery: vi.fn(),
  requestPeriodicReportGeneration: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/users', () => ({
  updateWorkspaceUserApproval: mocks.approve,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('nuqs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('nuqs')>()),
  useQueryStates: () => [
    {
      stage: 'pending',
      cadence: 'monthly',
      query: '',
      approval: 'all',
      delivery: 'all',
      generation: 'all',
      sort: 'period',
      direction: 'desc',
      start: '',
      end: '',
    },
    vi.fn(),
  ],
}));
vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));
vi.mock('../users/reports/group-reports-selector', () => ({
  default: () => null,
}));
vi.mock('./periodic-delivery-batch-dialog', () => ({
  PeriodicDeliveryBatchDialog: () => null,
}));
vi.mock('./periodic-recipient-remediation', () => ({
  PeriodicRecipientRemediation: () => null,
}));
vi.mock('./periodic-email-readiness', () => ({
  PeriodicEmailReadiness: () => null,
}));
vi.mock('./periodic-reports-toolbar', () => ({
  PeriodicReportsToolbar: () => null,
}));
vi.mock('./periodic-status-summary', () => ({
  PERIODIC_STAGES: [['pending', 'pending']],
  PeriodicStatusSummary: () => null,
}));
vi.mock('./periodic-report-preview-dialog', () => ({
  PeriodicReportPreviewDialog: () => null,
}));

import PeriodicReportsPanel from './periodic-reports-panel';

const permissions = {
  canApproveReports: true,
  canCheckUserAttendance: false,
  canCreateReports: false,
  canDeleteReports: false,
  canSendReports: false,
  canUpdateReports: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.approve.mockResolvedValue({ success: true });
  mocks.edit.mockRejectedValue(
    new Error('Unauthorized: content edit permission required')
  );
  mocks.list.mockResolvedValue({
    page: 1,
    pageSize: 100,
    total: 1,
    data: [
      {
        id: 'report-1',
        title: 'Synthetic monthly report',
        report_approval_status: 'PENDING',
        delivery_status: 'draft',
        generation_mode: 'manual',
        generation_status: 'ready',
      },
    ],
  });
});
it('approval-only supervisor uses the dedicated approval operation without content-edit authority', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="supervisor-a">
        <PeriodicReportsPanel permissions={permissions} wsId="workspace-1" />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'approve' }));
  expect(mocks.list).toHaveBeenCalledWith(
    'workspace-1',
    expect.objectContaining({ pageSize: 100 })
  );
  await waitFor(() =>
    expect(mocks.approve).toHaveBeenCalledWith('workspace-1', {
      action: 'approve',
      kind: 'reports',
      itemId: 'report-1',
    })
  );
  expect(mocks.edit).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['periodic-reports', 'workspace-1'],
    })
  );
  client.clear();
});
it('does not render approval action for a supervisor without approval permission', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="supervisor-a">
        <PeriodicReportsPanel
          permissions={{ ...permissions, canApproveReports: false }}
          wsId="workspace-1"
        />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  await screen.findByText('Synthetic monthly report');
  expect(
    screen.queryByRole('button', { name: 'approve' })
  ).not.toBeInTheDocument();
  expect(mocks.approve).not.toHaveBeenCalled();
  client.clear();
});

it('does not render previous actor reports while the new authorized load is pending', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (actorId: string) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId={actorId}>
        <PeriodicReportsPanel permissions={permissions} wsId="workspace-1" />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const result = render(view('supervisor-a'));
  await screen.findByText('Synthetic monthly report');
  mocks.list.mockImplementation(() => new Promise(() => {}));
  result.rerender(view('supervisor-b'));
  expect(
    screen.queryByText('Synthetic monthly report')
  ).not.toBeInTheDocument();
  result.unmount();
  client.clear();
});
