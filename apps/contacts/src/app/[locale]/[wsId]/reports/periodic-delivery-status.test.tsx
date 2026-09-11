import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PeriodicDeliveryStatus } from './periodic-delivery-status';

const load = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/reports', () => ({
  getPeriodicReportDeliveryDiagnostics: load,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    [key, ...Object.values(values ?? {})].join(' '),
  useFormatter: () => ({ dateTime: (date: Date) => date.toISOString() }),
}));
const data = {
  report: {
    user_email: 'member@example.com',
    delivery_status: 'sent',
    delivered_at: '2026-09-01T01:00:00Z',
    delivery_requested_at: null,
    last_delivery_error: null,
  },
  queue: {
    status: 'sent',
    recipient_email: 'original@example.com',
    delivery_kind: 'send',
    attempt_count: 2,
    next_attempt_at: '2026-09-01T01:00:00Z',
    sent_at: '2026-09-01T01:00:00Z',
    last_error: null,
    provider_message_id: 'provider-1',
  },
  attempts: [
    {
      id: 'attempt-1',
      status: 'sent',
      attempted_at: '2026-09-01T01:00:00Z',
      error_message: null,
      provider_message_id: 'provider-1',
    },
  ],
};
function renderStatus() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PeriodicDeliveryStatus wsId="workspace-1" reportId="report-1" />
    </QueryClientProvider>
  );
}

describe('monthly delivery status', () => {
  beforeEach(() => {
    load.mockReset();
    load.mockResolvedValue(data);
  });
  it('shows the actual recipient, attempts, acceptance explanation, and sent time', async () => {
    renderStatus();
    expect(
      await screen.findByText('delivery_recipient original@example.com')
    ).toBeInTheDocument();
    expect(screen.getByText('delivery_attempt_count 2')).toBeInTheDocument();
    expect(screen.getByText('sent_explanation')).toBeInTheDocument();
    expect(
      screen.getByText('delivery_sent_at 2026-09-01T01:00:00.000Z')
    ).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith('workspace-1', 'report-1');
  });
  it('shows a successful test while the real report remains not sent', async () => {
    load.mockResolvedValue({
      ...data,
      report: { ...data.report, delivery_status: 'draft', delivered_at: null },
      queue: { ...data.queue, delivery_kind: 'test' },
    });
    renderStatus();
    expect(await screen.findByText('test_send')).toBeInTheDocument();
    expect(
      screen.getByText('test_sent_at 2026-09-01T01:00:00.000Z')
    ).toBeInTheDocument();
    expect(screen.getByText('not_sent')).toBeInTheDocument();
  });
  it('shows a missing address before any delivery attempt', async () => {
    load.mockResolvedValue({
      report: {
        ...data.report,
        user_email: null,
        delivery_status: 'draft',
        delivered_at: null,
      },
      queue: null,
      attempts: [],
    });
    renderStatus();
    expect(
      await screen.findByText('delivery_recipient missing_email')
    ).toBeInTheDocument();
    expect(screen.queryByText('delivery_history')).not.toBeInTheDocument();
  });
  it('shows retry time and failure details', async () => {
    load.mockResolvedValue({
      ...data,
      report: {
        ...data.report,
        delivery_status: 'failed',
        last_delivery_error: 'Sender unavailable',
        delivered_at: null,
      },
      queue: {
        ...data.queue,
        status: 'failed',
        last_error: 'Outdated failure',
      },
    });
    renderStatus();
    expect(await screen.findByText('Sender unavailable')).toBeInTheDocument();
    expect(screen.queryByText('Outdated failure')).not.toBeInTheDocument();
    expect(
      screen.getByText('delivery_next_attempt 2026-09-01T01:00:00.000Z')
    ).toBeInTheDocument();
  });
  it('recovers after a failed status request', async () => {
    load.mockRejectedValueOnce(new Error('offline'));
    renderStatus();
    fireEvent.click(await screen.findByRole('button', { name: 'retry' }));
    expect(
      await screen.findByText('delivery_recipient original@example.com')
    ).toBeInTheDocument();
  });
  it('labels test emails separately from normal delivery', async () => {
    load.mockResolvedValue({
      ...data,
      queue: { ...data.queue, delivery_kind: 'test' },
    });
    renderStatus();
    expect(await screen.findByText('test_send')).toBeInTheDocument();
  });
});
