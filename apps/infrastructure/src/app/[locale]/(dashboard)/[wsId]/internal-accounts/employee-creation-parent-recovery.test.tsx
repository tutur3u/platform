import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { EmployeeRejectionRecoveryState } from '@tuturuuu/internal-api/infrastructure';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  create:
    vi.fn<
      typeof import('@tuturuuu/internal-api/infrastructure').createInternalEmployee
    >(),
  availability:
    vi.fn<
      typeof import('@tuturuuu/internal-api/infrastructure').getEmployeeCreationAvailability
    >(),
  observe:
    vi.fn<
      typeof import('@tuturuuu/internal-api/infrastructure').getInternalEmployeeCreationOperation
    >(),
  inspectRejection:
    vi.fn<
      typeof import('@tuturuuu/internal-api/infrastructure').inspectEmployeeRejection
    >(),
  adjudicateRejection:
    vi.fn<
      typeof import('@tuturuuu/internal-api/infrastructure').adjudicateEmployeeRejection
    >(),
}));
vi.mock('@tuturuuu/internal-api/infrastructure', async (original) => ({
  ...(await original<typeof import('@tuturuuu/internal-api/infrastructure')>()),
  createInternalEmployee: api.create,
  getEmployeeCreationAvailability: api.availability,
  getInternalEmployeeCreationOperation: api.observe,
  inspectEmployeeRejection: api.inspectRejection,
  adjudicateEmployeeRejection: api.adjudicateRejection,
}));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
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

const workspaceId = '00000000-0000-0000-0000-000000000000';
const operationId = '10000000-0000-4000-8000-000000000002';
const storageKey = `infra:employee-create:v1:${scope.actorId}:${workspaceId}`;
const eligible = {
  status: 'eligible',
  expectedVersion: 2,
  actorUserId: scope.actorId,
  operationId,
  targetUserId: '10000000-0000-4000-8000-000000000003',
  originalLeaseId: '10000000-0000-4000-8000-000000000004',
  originalAttemptEventId: '10000000-0000-4000-8000-000000000005',
  email: 'recovered.staff@tuturuuu.com',
  displayName: 'Recovered Staff',
} satisfies EmployeeRejectionRecoveryState;
const retryReady = {
  ...eligible,
  status: 'retry_ready',
  expectedVersion: 3,
  eventId: '10000000-0000-4000-8000-000000000006',
  evidenceReferenceSha256: 'a'.repeat(64),
} satisfies EmployeeRejectionRecoveryState;
const draftPassword = 'Draft-Password-123!';

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  api.availability.mockResolvedValue({ available: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function mount() {
  const refresh = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
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
  await waitFor(() => expect(api.availability).toHaveBeenCalledTimes(1));
  return refresh;
}
function fillDraft() {
  fireEvent.change(screen.getByLabelText('email'), {
    target: { value: 'draft@tuturuuu.com' },
  });
  fireEvent.change(screen.getByLabelText('name'), {
    target: { value: 'Unsaved Draft' },
  });
  fireEvent.change(screen.getByLabelText('password'), {
    target: { value: draftPassword },
  });
}
function submitForm() {
  const form = screen.getByLabelText('password').closest('form');
  if (!form) throw new Error('Missing CREATE form');
  fireEvent.submit(form);
}
function expectNoDispatch() {
  expect(api.create).not.toHaveBeenCalled();
  expect(api.observe).not.toHaveBeenCalled();
  expect(api.adjudicateRejection).not.toHaveBeenCalled();
}
function readStored(): unknown {
  const raw = sessionStorage.getItem(storageKey);
  if (raw === null) throw new Error('Missing original operation reference');
  expect(raw).not.toContain(draftPassword);
  expect(raw).not.toContain('temporaryPassword');
  return JSON.parse(raw);
}
function expectedReference(state: 'stopped' | 'retry_ready') {
  return {
    actorId: scope.actorId,
    workspaceId,
    operationId,
    email: eligible.email,
    displayName: eligible.displayName,
    startedAt: null,
    reads: 0,
    state,
    rejection:
      state === 'retry_ready'
        ? {
            targetUserId: retryReady.targetUserId,
            originalLeaseId: retryReady.originalLeaseId,
            originalAttemptEventId: retryReady.originalAttemptEventId,
            eventId: retryReady.eventId,
            evidenceReferenceSha256: retryReady.evidenceReferenceSha256,
          }
        : null,
  };
}
async function beginInspection(result: EmployeeRejectionRecoveryState) {
  let finish = (_result: EmployeeRejectionRecoveryState): void => {
    throw new Error('Inspection has not started');
  };
  api.inspectRejection.mockImplementationOnce(
    () =>
      new Promise<EmployeeRejectionRecoveryState>((resolve) => {
        finish = resolve;
      })
  );
  const refresh = await mount();
  fillDraft();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
  );
  fireEvent.change(screen.getByLabelText('name'), {
    target: { value: '' },
  });
  submitForm();
  expect(screen.getByText('problems.invalid_input')).toHaveAttribute(
    'role',
    'alert'
  );
  expectNoDispatch();
  fillDraft();
  expect(screen.getByText('problems.invalid_input')).toBeVisible();
  expect(api.inspectRejection).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('advanced'));
  fireEvent.change(screen.getByLabelText('operation'), {
    target: { value: ` ${operationId} ` },
  });
  fireEvent.click(screen.getByRole('button', { name: 'load' }));
  expect(api.inspectRejection).toHaveBeenCalledExactlyOnceWith(operationId);
  expect(screen.getByRole('button', { name: 'load' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
  expect(screen.getByLabelText('email')).toBeDisabled();
  expect(screen.getByLabelText('name')).toBeDisabled();
  expect(screen.getByLabelText('password')).toBeDisabled();
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  submitForm();
  expectNoDispatch();
  await act(async () => finish(result));
  expect(screen.getByLabelText('email')).toHaveValue(eligible.email);
  expect(screen.getByLabelText('name')).toHaveValue(eligible.displayName);
  expect(screen.getByLabelText('email')).toBeDisabled();
  expect(screen.getByLabelText('name')).toBeDisabled();
  expect(screen.getByLabelText('password')).toHaveValue('');
  expect(screen.queryByLabelText('operation')).not.toBeInTheDocument();
  expect(screen.queryByText('problems.invalid_input')).not.toBeInTheDocument();
  expect(api.inspectRejection).toHaveBeenCalledTimes(1);
  expectNoDispatch();
  expect(refresh).not.toHaveBeenCalled();
  return refresh;
}

describe('employee creation parent recovery integration', () => {
  it('stops with the storage problem when opening cannot read the recovery key', async () => {
    const getItem = Storage.prototype.getItem;
    const read = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(function (this: Storage, key: string) {
        if (this === sessionStorage && key === storageKey)
          throw new Error('PRIVATE storage read failure');
        return getItem.call(this, key);
      });
    const refresh = await mount();
    expect(read).toHaveBeenCalledWith(storageKey);
    expect(screen.getByText('problems.storage')).toHaveAttribute(
      'role',
      'alert'
    );
    expect(screen.getByText('stopped')).toBeVisible();
    expect(screen.queryByText('problems.unknown')).not.toBeInTheDocument();
    expect(screen.queryByText('failed')).not.toBeInTheDocument();
    expect(
      screen.queryByText('PRIVATE storage read failure')
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('email')).toBeDisabled();
    expect(screen.getByLabelText('name')).toBeDisabled();
    expect(screen.getByLabelText('password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    submitForm();
    expectNoDispatch();
    expect(api.inspectRejection).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it('restores an eligible original identity with unknown outcome and keeps CREATE stopped', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID');
    await beginInspection(eligible);
    expect(screen.getByText('problems.unknown')).toHaveAttribute(
      'role',
      'alert'
    );
    expect(screen.getByText('stopped')).toBeVisible();
    expect(screen.getByLabelText('password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    expect(readStored()).toEqual(expectedReference('stopped'));
    submitForm();
    expectNoDispatch();
    expect(uuid).not.toHaveBeenCalled();
    expect(readStored()).toEqual(expectedReference('stopped'));
  });

  it('restores retry_ready without unknown and requires a fresh valid password for one explicit same-operation CREATE', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID');
    const refresh = await beginInspection(retryReady);
    expect(screen.queryByText('problems.unknown')).not.toBeInTheDocument();
    expect(screen.queryByText('stopped')).not.toBeInTheDocument();
    expect(screen.getByLabelText('password')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    expect(readStored()).toEqual(expectedReference('retry_ready'));
    expectNoDispatch();
    fireEvent.change(screen.getByLabelText('password'), {
      target: { value: 'lowercase-only-123!' },
    });
    expect(screen.getByText('password_strength')).toBeVisible();
    expect(screen.getByLabelText('password')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
    submitForm();
    expectNoDispatch();
    const freshPassword = 'Fresh-Password-456!';
    fireEvent.change(screen.getByLabelText('password'), {
      target: { value: freshPassword },
    });
    expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled();
    expectNoDispatch();
    api.create.mockResolvedValueOnce({
      status: 'created',
      operationId,
      account: {
        id: retryReady.targetUserId,
        email: retryReady.email,
        displayName: retryReady.displayName,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
    expect(await screen.findByText('created')).toBeVisible();
    expect(api.create).toHaveBeenCalledExactlyOnceWith(
      {
        email: retryReady.email,
        displayName: retryReady.displayName,
        temporaryPassword: freshPassword,
      },
      { operationId, actorUserId: scope.actorId }
    );
    expect(api.inspectRejection).toHaveBeenCalledExactlyOnceWith(operationId);
    expect(api.observe).not.toHaveBeenCalled();
    expect(api.adjudicateRejection).not.toHaveBeenCalled();
    expect(uuid).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(storageKey)).toBeNull();
    expect(screen.getByLabelText('password')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
  });
});
