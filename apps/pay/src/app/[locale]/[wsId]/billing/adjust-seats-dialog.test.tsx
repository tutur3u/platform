import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  updatePaySubscriptionSeats: mocks.update,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { success: mocks.success, error: vi.fn() },
}));

import AdjustSeatsDialog from './adjust-seats-dialog';

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <AdjustSeatsDialog
        open={open}
        onOpenChange={setOpen}
        wsId="workspace"
        currentSeats={5}
        currentMembers={2}
        requiredSeats={4}
        minPlanSeats={1}
        pricePerSeat={900}
        billingCycle="month"
      />
    </>
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it('retains pending reconciliation across dismissal and prevents another confirmation', async () => {
  mocks.update.mockResolvedValue({ newSeats: 4, syncPending: true });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Harness />
    </QueryClientProvider>
  );
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } });
  fireEvent.click(screen.getByRole('button', { name: 'confirm-seat-change' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toBe('billing-syncing')
  );
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /^cancel$/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
  expect(screen.getByRole('status').textContent).toBe('billing-syncing');
  expect(
    (
      screen.getByRole('button', {
        name: 'confirm-seat-change',
      }) as HTMLButtonElement
    ).disabled
  ).toBe(true);
  expect(mocks.update).toHaveBeenCalledOnce();
});
