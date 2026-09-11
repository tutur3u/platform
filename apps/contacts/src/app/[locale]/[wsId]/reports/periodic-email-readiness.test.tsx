import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PeriodicEmailReadiness } from './periodic-email-readiness';

const load = vi.hoisted(() => vi.fn());
vi.mock('@tuturuuu/internal-api/reports', () => ({
  getPeriodicReportSchedules: load,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
it('keeps unavailable readiness visible and recovers on retry', async () => {
  load
    .mockRejectedValueOnce(new Error('Forbidden'))
    .mockResolvedValue({
      emailDelivery: {
        ready: true,
        senderConfigured: true,
        autoSendAfterApproval: true,
      },
    });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <PeriodicEmailReadiness wsId="workspace" />
    </QueryClientProvider>
  );
  expect(await screen.findByText('readiness_unavailable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  expect(await screen.findByText('email_automatic_ready')).toBeInTheDocument();
});
