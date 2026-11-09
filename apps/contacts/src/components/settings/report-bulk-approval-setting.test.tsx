import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  getOptionalWorkspaceConfig: mocks.get,
  updateWorkspaceConfig: mocks.update,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
import { ReportBulkApprovalSetting } from './report-bulk-approval-setting';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue(null);
  mocks.update.mockResolvedValue({ message: 'success' });
});
function mount(canManage = true, wsId = 'workspace-a') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReportBulkApprovalSetting wsId={wsId} canManage={canManage} />
    </QueryClientProvider>
  );
}
it('defaults off and saves an explicit opt-in for the current workspace', async () => {
  mount();
  const control = screen.getByRole('switch');
  await waitFor(() => expect(control).not.toBeDisabled());
  expect(control).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(control);
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledWith(
      'workspace-a',
      'ALLOW_BULK_REPORT_APPROVAL',
      'true'
    )
  );
});
it('shows the saved enabled policy and allows switching it off', async () => {
  mocks.get.mockResolvedValue({ value: 'true' });
  mount(true, 'workspace-b');
  const control = screen.getByRole('switch');
  await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'true'));
  fireEvent.click(control);
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledWith(
      'workspace-b',
      'ALLOW_BULK_REPORT_APPROVAL',
      'false'
    )
  );
});
it('offers no setting or read to a non-admin', () => {
  mount(false);
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
it('cannot overwrite an unreadable saved policy', async () => {
  mocks.get.mockRejectedValue(new Error('unavailable'));
  mount();
  await screen.findByText('bulk_report_setting_load_error');
  expect(screen.getByRole('switch')).toBeDisabled();
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  expect(mocks.update).not.toHaveBeenCalled();
});
