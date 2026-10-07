import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('@tuturuuu/internal-api/reports', () => ({
  getPeriodicReportSchedules: mocks.get,
  listWorkspaceReportGroups: vi.fn().mockResolvedValue({ data: [] }),
  updatePeriodicReportAutoSend: vi.fn(),
  upsertPeriodicReportSchedule: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/workspace-configs', () => ({
  updateWorkspaceFeatureSecret: mocks.update,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { toast } from '@tuturuuu/ui/sonner';
import AutomationsPanel from './automations-panel';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue({ message: 'success' });
});
async function show(canConfigureReportEmailGate = true, enabled = false) {
  mocks.get.mockResolvedValue({
    canManage: false,
    defaults: [],
    overrides: [],
    recentRuns: [],
    recentDeliveries: [],
    workspaceTimezone: 'UTC',
    emailDelivery: {
      canConfigureReportEmailGate,
      periodicGateEnabled: enabled,
      globalGateEnabled: true,
      senderConfigured: true,
      ready: false,
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="actor-a">
        <AutomationsPanel canManage={false} wsId="workspace-1" />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  await screen.findByText('delivery_readiness');
  return client;
}
it('requires an explicit confirmation before a separately authorized administrator enables report email', async () => {
  const client = await show();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  fireEvent.click(screen.getByRole('button', { name: 'report_email_enable' }));
  expect(mocks.update).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole('button', { name: 'report_email_confirm' })
  );
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledWith(
      'workspace-1',
      'ENABLE_REPORT_EMAIL_SENDING',
      true
    )
  );
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['periodic-report-schedules', 'workspace-1'],
    })
  );
  client.clear();
});
it('offers no gate administration when the server denies configuration permission', async () => {
  const client = await show(false);
  expect(
    screen.queryByRole('button', { name: 'report_email_enable' })
  ).not.toBeInTheDocument();
  expect(mocks.update).not.toHaveBeenCalled();
  client.clear();
});

it('cancelling the confirmation performs no configuration write', async () => {
  const client = await show();
  fireEvent.click(screen.getByRole('button', { name: 'report_email_enable' }));
  fireEvent.click(await screen.findByRole('button', { name: 'cancel' }));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  client.clear();
});
it('invalidates readiness and reports, not an unrelated workspace, after confirmation', async () => {
  const client = await show();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  fireEvent.click(screen.getByRole('button', { name: 'report_email_enable' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'report_email_confirm' })
  );
  await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(3));
  expect(invalidate.mock.calls.map(([arg]) => arg?.queryKey)).toEqual([
    ['periodic-report-schedules', 'workspace-1'],
    ['periodic-reports', 'workspace-1'],
    ['periodic-report-delivery', 'workspace-1'],
  ]);
  client.clear();
});

it('confirms disabling independently of enabling', async () => {
  const client = await show(true, true);
  fireEvent.click(screen.getByRole('button', { name: 'report_email_disable' }));
  expect(mocks.update).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole('button', { name: 'report_email_confirm' })
  );
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledWith(
      'workspace-1',
      'ENABLE_REPORT_EMAIL_SENDING',
      false
    )
  );
  client.clear();
});
it('discards a retained dialog after account replacement and return to the same actor', async () => {
  mocks.get.mockResolvedValue({
    canManage: false,
    defaults: [],
    overrides: [],
    recentRuns: [],
    recentDeliveries: [],
    workspaceTimezone: 'UTC',
    emailDelivery: {
      canConfigureReportEmailGate: true,
      periodicGateEnabled: false,
      globalGateEnabled: true,
      senderConfigured: true,
      ready: false,
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (actorId: string) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId={actorId}>
        <AutomationsPanel canManage={false} wsId="workspace-1" />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const rendered = render(view('actor-a'));
  fireEvent.click(
    await screen.findByRole('button', { name: 'report_email_enable' })
  );
  await screen.findByRole('alertdialog');
  rendered.rerender(view('actor-b'));
  rendered.rerender(view('actor-a'));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  client.clear();
});

it('does not publish a held prior-actor success after actor ABA', async () => {
  mocks.get.mockResolvedValue({
    canManage: false,
    defaults: [],
    overrides: [],
    recentRuns: [],
    recentDeliveries: [],
    workspaceTimezone: 'UTC',
    emailDelivery: {
      canConfigureReportEmailGate: true,
      periodicGateEnabled: false,
      globalGateEnabled: true,
      senderConfigured: true,
      ready: false,
    },
  });
  let finish: (value: { message: string }) => void = () => {};
  mocks.update.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const success = vi.spyOn(toast, 'success');
  const view = (actorId: string) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId={actorId}>
        <AutomationsPanel canManage={false} wsId="workspace-1" />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const rendered = render(view('actor-a'));
  fireEvent.click(
    await screen.findByRole('button', { name: 'report_email_enable' })
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'report_email_confirm' })
  );
  await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
  expect(
    screen.getByRole('button', { name: 'report_email_confirm' })
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'cancel' })).toBeDisabled();
  rendered.rerender(view('actor-b'));
  rendered.rerender(view('actor-a'));
  await act(async () => {
    finish({ message: 'success' });
    await Promise.resolve();
  });
  expect(invalidate).not.toHaveBeenCalled();
  expect(success).not.toHaveBeenCalled();
  success.mockRestore();
  client.clear();
});
it('reports a fixed failure and lets the user explicitly retry the retained confirmation', async () => {
  mocks.update
    .mockRejectedValueOnce(new Error('private provider credential detail'))
    .mockResolvedValueOnce({ message: 'success' });
  const error = vi.spyOn(toast, 'error');
  const client = await show();
  fireEvent.click(screen.getByRole('button', { name: 'report_email_enable' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'report_email_confirm' })
  );
  await waitFor(() =>
    expect(error).toHaveBeenCalledWith('report_email_gate_failed')
  );
  expect(error).not.toHaveBeenCalledWith(expect.stringContaining('private'));
  fireEvent.click(screen.getByRole('button', { name: 'report_email_confirm' }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(2));
  error.mockRestore();
  client.clear();
});

it('discards confirmation across workspace ABA without writing either workspace', async () => {
  mocks.get.mockResolvedValue({
    canManage: false,
    defaults: [],
    overrides: [],
    recentRuns: [],
    recentDeliveries: [],
    workspaceTimezone: 'UTC',
    emailDelivery: {
      canConfigureReportEmailGate: true,
      periodicGateEnabled: false,
      globalGateEnabled: true,
      senderConfigured: true,
      ready: false,
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (wsId: string) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="actor-a">
        <AutomationsPanel canManage={false} wsId={wsId} />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const rendered = render(view('workspace-1'));
  fireEvent.click(
    await screen.findByRole('button', { name: 'report_email_enable' })
  );
  await screen.findByRole('alertdialog');
  rendered.rerender(view('workspace-2'));
  await screen.findByRole('button', { name: 'report_email_enable' });
  rendered.rerender(view('workspace-1'));
  await screen.findByRole('button', { name: 'report_email_enable' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(mocks.update).not.toHaveBeenCalled();
  client.clear();
});
it('does not revive an old dialog when server capability is revoked and restored', async () => {
  const client = await show();
  fireEvent.click(screen.getByRole('button', { name: 'report_email_enable' }));
  await screen.findByRole('alertdialog');
  const key = ['periodic-report-schedules', 'workspace-1'];
  const saved = client.getQueryData<{ emailDelivery: Record<string, unknown> }>(
    key
  )!;
  await act(async () => {
    client.setQueryData(key, {
      ...saved,
      emailDelivery: {
        ...saved.emailDelivery,
        canConfigureReportEmailGate: false,
      },
    });
  });
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
  await act(async () => {
    client.setQueryData(key, saved);
  });
  await screen.findByRole('button', { name: 'report_email_enable' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(mocks.update).not.toHaveBeenCalled();
  client.clear();
});
