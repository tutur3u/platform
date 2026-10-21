import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  availability: vi.fn(),
  observe: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/infrastructure', async (original) => ({
  ...(await original<typeof import('@tuturuuu/internal-api/infrastructure')>()),
  createInternalEmployee: api.create,
  getEmployeeCreationAvailability: api.availability,
  getInternalEmployeeCreationOperation: api.observe,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const scope = vi.hoisted(() => ({
  actorId: '10000000-0000-4000-8000-000000000001',
  lifetime: { active: true },
  assertActive: vi.fn(),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => scope,
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ wsId: '00000000-0000-0000-0000-000000000000' }),
}));

import { EmployeeCreationDialog } from './employee-creation-dialog';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  scope.assertActive.mockImplementation(() => undefined);
  api.observe.mockImplementation(async (value) => ({
    status: 'stopped',
    operationId: value.operationId,
    code: 'employee_operation_halted',
  }));
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
    target: { value: 'Synthetic-Pass-123!' },
  });
  return refresh;
}
describe('employee creation form', () => {
  it('gives inline password guidance and disables creation before operation admission', async () => {
    await mount();
    fireEvent.change(screen.getByLabelText('password'), {
      target: { value: 'lowercase-only-123!' },
    });
    expect(await screen.findByText('password_strength')).toBeVisible();
    expect(screen.getByLabelText('password')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(api.create).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });
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
    await screen.findByText('stopped');
    expect(screen.getByLabelText('password')).toHaveValue('');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await screen.findByText('stopped');
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
    await screen.findByText('stopped');
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
  });
  it('automatically confirms a lost POST response with a read and no second POST', async () => {
    api.create.mockRejectedValue(new Error('response lost'));
    api.observe.mockImplementation(async (value) => ({
      status: 'created',
      operationId: value.operationId,
      account: {
        id: '10000000-0000-4000-8000-000000000003',
        email: value.email,
        displayName: value.displayName,
      },
    }));
    const refresh = await mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText('created');
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.observe).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sessionStorage.length).toBe(0);
  });
  it('does not dispatch when storage refuses the original operation', async () => {
    const storage = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota');
      });
    await mount();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    await screen.findByText('stopped');
    expect(api.create).not.toHaveBeenCalled();
    storage.mockRestore();
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
