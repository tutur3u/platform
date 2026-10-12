import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ create: vi.fn(), availability: vi.fn() }));
vi.mock('@tuturuuu/internal-api/infrastructure', async (original) => ({
  ...(await original<typeof import('@tuturuuu/internal-api/infrastructure')>()),
  createInternalEmployee: api.create,
  getEmployeeCreationAvailability: api.availability,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import { EmployeeCreationDialog } from './employee-creation-dialog';

beforeEach(() => {
  vi.clearAllMocks();
  api.availability.mockResolvedValue({ available: true });
});
async function mount() {
  const refresh = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <EmployeeCreationDialog onDirectoryRefresh={refresh} />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'open' }));
  await waitFor(() => expect(api.availability).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('email'), {
    target: { value: 'staff@tuturuuu.com' },
  });
  fireEvent.change(screen.getByLabelText('name'), {
    target: { value: 'Staff' },
  });
  fireEvent.change(screen.getByLabelText('password'), {
    target: { value: 'temporary-pass-123' },
  });
  return refresh;
}
describe('employee creation form', () => {
  it('keeps creation disabled when runtime is unavailable', async () => {
    api.availability.mockResolvedValue({ available: false });
    await mount();
    await screen.findByText('unavailable');
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(api.create).not.toHaveBeenCalled();
  });
  it('admits once and locks pending outcome through close/reopen without retaining password', async () => {
    let finish: (value: unknown) => void = () => {};
    api.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const refresh = await mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    fireEvent.click(screen.getByRole('button', { name: 'submitting' }));
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'close' })).toBeDisabled();
    const key = api.create.mock.calls[0]?.[1].operationId;
    expect(key).toMatch(/^[a-f0-9-]{36}$/);
    finish({
      status: 'pending',
      operationId: key,
      code: 'account_creation_outcome_unknown',
      nextAction: 'inspect',
    });
    await screen.findByText('inspect');
    expect(screen.getByLabelText('password')).toHaveValue('');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByText('inspect');
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    expect(api.create).toHaveBeenCalledTimes(1);
  });
  it('treats uncertain network rejection as inspection, never an automatic retry', async () => {
    api.create.mockRejectedValue(new Error('network outcome unknown'));
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText('inspect');
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
  });
  it('does not turn confirmed creation into retry when directory refresh fails', async () => {
    api.create.mockResolvedValue({ status: 'created' });
    const refresh = await mount();
    refresh.mockRejectedValue(new Error('refresh failed'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText('created');
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    expect(api.create).toHaveBeenCalledTimes(1);
  });
});
