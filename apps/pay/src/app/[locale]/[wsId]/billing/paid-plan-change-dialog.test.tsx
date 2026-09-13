import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  refresh: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  changePaySubscriptionPlan: mocks.change,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}: ${Object.values(params).join(' ')}` : key,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: mocks.error } }));

import { PaidPlanChangeDialog } from './paid-plan-change-dialog';

function setup() {
  const onClose = vi.fn(),
    onChanged = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <PaidPlanChangeDialog
        subscriptionId="subscription"
        plan={{
          id: 'pro',
          name: 'Pro',
          seats: 3,
          amount: 5700,
          cycle: 'month',
        }}
        onClose={onClose}
        onChanged={onChanged}
      />
    </QueryClientProvider>
  );
  return { onClose, onChanged };
}
describe('paid plan confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.change.mockResolvedValue({ success: true });
  });
  afterEach(cleanup);
  it('requires explicit confirmation and explains estimated charges first', async () => {
    const callbacks = setup();
    expect(screen.getByText('paid-plan-charge-note')).toBeTruthy();
    expect(screen.getByText('estimated-total: 57.00 per-month 3')).toBeTruthy();
    expect(mocks.change).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'confirm-paid-plan-change' })
    );
    await waitFor(() =>
      expect(mocks.change).toHaveBeenCalledWith('subscription', 'pro', {
        expectedSeats: 3,
        expectedPricePerSeat: 1900,
      })
    );
    await waitFor(() => expect(callbacks.onChanged).toHaveBeenCalledOnce());
  });
  it('keeps the flow open and shows billing failures', async () => {
    mocks.change.mockRejectedValue(new Error('Price changed; reload billing'));
    const callbacks = setup();
    fireEvent.click(
      screen.getByRole('button', { name: 'confirm-paid-plan-change' })
    );
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith('plan-update-failed', {
        description: 'Price changed; reload billing',
      })
    );
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.onChanged).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('shows successful-but-pending projection without allowing a billing retry', async () => {
    mocks.change.mockResolvedValue({ success: true, syncPending: true });
    const callbacks = setup();
    fireEvent.click(
      screen.getByRole('button', { name: 'confirm-paid-plan-change' })
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('plan-sync-pending')
    );
    expect(
      screen
        .getByRole('button', { name: 'confirm-paid-plan-change' })
        .getAttribute('disabled')
    ).not.toBeNull();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.onChanged).not.toHaveBeenCalled();
  });
  it('cancels without a billing mutation', () => {
    const callbacks = setup();
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(callbacks.onClose).toHaveBeenCalledOnce();
    expect(mocks.change).not.toHaveBeenCalled();
  });
});
