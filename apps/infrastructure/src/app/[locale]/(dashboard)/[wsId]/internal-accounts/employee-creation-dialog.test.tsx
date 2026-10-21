import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  availability: vi.fn(),
  observe: vi.fn(),
  inspectRejection: vi.fn(),
  adjudicateRejection: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/infrastructure', async (original) => ({
  ...(await original<typeof import('@tuturuuu/internal-api/infrastructure')>()),
  createInternalEmployee: api.create,
  getEmployeeCreationAvailability: api.availability,
  getInternalEmployeeCreationOperation: api.observe,
}));
vi.mock(
  '@tuturuuu/internal-api/infrastructure/employee-rejection-recovery',
  async (original) => ({
    ...(await original<
      typeof import('@tuturuuu/internal-api/infrastructure/employee-rejection-recovery')
    >()),
    inspectEmployeeRejection: api.inspectRejection,
    adjudicateEmployeeRejection: api.adjudicateRejection,
  })
);
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

it('requires explicit adjudication and a fresh password before one same-operation CREATE', async () => {
  api.create.mockImplementationOnce(async (_payload, options) => ({
    status: 'pending',
    operationId: options.operationId,
    code: 'account_creation_outcome_unknown',
    nextAction: 'inspect',
  }));
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'submit' }));
  await screen.findByRole('button', { name: 'inspect' });
  const key = `infra:employee-create:v1:${scope.actorId}:00000000-0000-0000-0000-000000000000`;
  const saved = JSON.parse(sessionStorage.getItem(key) ?? '{}');
  const candidate = {
    status: 'eligible',
    actorUserId: scope.actorId,
    operationId: saved.operationId,
    targetUserId: '10000000-0000-4000-8000-000000000003',
    email: 'staff@tuturuuu.com',
    displayName: 'Staff',
    originalLeaseId: '10000000-0000-4000-8000-000000000004',
    originalAttemptEventId: '10000000-0000-4000-8000-000000000005',
    expectedVersion: 2,
  };
  api.inspectRejection.mockResolvedValue(candidate);
  api.adjudicateRejection.mockImplementation(async (body) => ({
    ...candidate,
    status: 'retry_ready',
    expectedVersion: 3,
    eventId: body.adjudication.eventId,
    evidenceReferenceSha256: body.adjudication.evidenceReferenceSha256,
  }));
  fireEvent.click(screen.getByRole('button', { name: 'inspect' }));
  await screen.findByLabelText('evidence');
  fireEvent.change(screen.getByLabelText('evidence'), {
    target: { value: 'a'.repeat(64) },
  });
  expect(screen.getByRole('button', { name: 'adjudicate' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'attestation' }));
  fireEvent.click(screen.getByRole('button', { name: 'adjudicate' }));
  await waitFor(() => expect(screen.getByLabelText('password')).toBeEnabled());
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('email')).toBeDisabled();
  expect(screen.getByLabelText('name')).toBeDisabled();
  expect(screen.getByLabelText('password')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('password'), {
    target: { value: 'Fresh-Password-456!' },
  });
  api.create.mockImplementationOnce(async (payload, options) => ({
    status: 'created',
    operationId: options.operationId,
    account: {
      id: candidate.targetUserId,
      email: payload.email,
      displayName: payload.displayName,
    },
  }));
  fireEvent.click(screen.getByRole('button', { name: 'submit' }));
  await screen.findByText('created');
  expect(api.create.mock.calls[1]?.[1].operationId).toBe(saved.operationId);
  expect(api.create.mock.calls[1]?.[0].temporaryPassword).toBe(
    'Fresh-Password-456!'
  );
  expect(sessionStorage.getItem(key)).toBeNull();
});
