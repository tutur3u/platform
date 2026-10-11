import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@tuturuuu/internal-api/reports', () => ({
  getPeriodicReportSchedules: mocks.get,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { PeriodicEmailReadiness } from './periodic-email-readiness';

async function show(overrides: Record<string, boolean>) {
  const delivery = {
    ready: true,
    globalGateEnabled: true,
    periodicGateEnabled: true,
    senderConfigured: true,
    autoSendAfterApproval: false,
    ...overrides,
  };
  mocks.get.mockResolvedValue({ emailDelivery: delivery });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="actor-a">
        <PeriodicEmailReadiness wsId="workspace-1" />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  await screen.findByRole('link', { name: 'email_settings' });
  return client;
}
it.each([
  ['globalGateEnabled', 'email_global_gate_off'],
  ['periodicGateEnabled', 'email_periodic_gate_off'],
  ['senderConfigured', 'email_sender_missing'],
])(
  'identifies missing %s without advertising an unavailable setup URL',
  async (key, reason) => {
    const client = await show({ ready: false, [key]: false });
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
    expect(screen.getByText('email_contact_admin')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'email_settings' })
    ).toHaveAttribute('href', '/workspace-1/reports?view=automations');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    client.clear();
  }
);
it('shows every missing prerequisite rather than hiding gates behind missing sender', async () => {
  const client = await show({
    ready: false,
    globalGateEnabled: false,
    periodicGateEnabled: false,
    senderConfigured: false,
  });
  expect(screen.getByText('email_global_gate_off')).toBeInTheDocument();
  expect(screen.getByText('email_periodic_gate_off')).toBeInTheDocument();
  expect(screen.getAllByText('email_sender_missing')).toHaveLength(2);
  client.clear();
});
it.each([
  [false, 'email_manual_ready'],
  [true, 'email_automatic_ready'],
] as const)(
  'distinguishes ready manual and automatic delivery',
  async (autoSendAfterApproval, label) => {
    const client = await show({ autoSendAfterApproval });
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('email_contact_admin')).not.toBeInTheDocument();
    client.clear();
  }
);

it('keeps unavailable readiness visible and recovers on retry', async () => {
  mocks.get.mockRejectedValueOnce(new Error('Forbidden')).mockResolvedValue({
    emailDelivery: {
      ready: true,
      globalGateEnabled: true,
      periodicGateEnabled: true,
      senderConfigured: true,
      autoSendAfterApproval: true,
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="actor-a">
        <PeriodicEmailReadiness wsId="workspace" />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  expect(await screen.findByText('readiness_unavailable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  expect(await screen.findByText('email_automatic_ready')).toBeInTheDocument();
  client.clear();
});

it('hides prior account settings until the new account load is authorized', async () => {
  mocks.get.mockResolvedValueOnce({
    emailDelivery: {
      ready: true,
      globalGateEnabled: true,
      periodicGateEnabled: true,
      senderConfigured: true,
      autoSendAfterApproval: false,
    },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = (actorId: string) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId={actorId}>
        <PeriodicEmailReadiness wsId="workspace" />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const result = render(view('actor-a'));
  await screen.findByText('email_manual_ready');
  mocks.get.mockImplementation(() => new Promise(() => {}));
  result.rerender(view('actor-b'));
  expect(screen.queryByText('email_manual_ready')).not.toBeInTheDocument();
  result.unmount();
  client.clear();
});
