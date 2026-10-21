import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { EmployeeCreationPasswordSchema } from '@tuturuuu/internal-api/infrastructure';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
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
  inspectEmployeeRejection: api.inspectRejection,
  adjudicateEmployeeRejection: api.adjudicateRejection,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const scope = vi.hoisted(() => ({
  actorId: '10000000-0000-4000-8000-000000000001',
  lifetime: { active: true },
  assertActive: vi.fn(),
}));
const ports = vi.hoisted<{
  wsId: string;
  actor: typeof scope | null | undefined;
}>(() => ({
  wsId: '00000000-0000-0000-0000-000000000000',
  actor: undefined,
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => (ports.actor === undefined ? scope : ports.actor),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ wsId: ports.wsId }),
}));

import { EmployeeCreationDialog } from './employee-creation-dialog';

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  ports.wsId = ROOT_WORKSPACE_ID;
  ports.actor = undefined;
  scope.lifetime = { active: true };
  scope.assertActive.mockImplementation(() => undefined);
  api.observe.mockImplementation(async (value) => ({
    status: 'stopped',
    operationId: value.operationId,
    code: 'employee_operation_halted',
  }));
  api.availability.mockResolvedValue({ available: true });
});
function renderDialog() {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <EmployeeCreationDialog onDirectoryRefresh={refresh} />
    </QueryClientProvider>
  );
  const view = render(tree());
  return {
    refresh,
    client,
    ...view,
    rerenderDialog: () => view.rerender(tree()),
  };
}
async function mount() {
  const { refresh } = renderDialog();
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
  it('generates a valid password without dispatch or persistence', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'generate_password' }));
    const input = screen.getByLabelText<HTMLInputElement>('password');
    expect(input.value).toHaveLength(20);
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled();
    expect(api.create).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByLabelText('password')).toHaveValue('');
  });
  it('copies a password only after an explicit action through the secure clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      await mount();
      expect(writeText).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'copy_password' }));
      await waitFor(() =>
        expect(writeText).toHaveBeenCalledExactlyOnceWith('Synthetic-Pass-123!')
      );
      vi.stubGlobal('isSecureContext', false);
      fireEvent.click(screen.getByRole('button', { name: 'copy_password' }));
      expect(await screen.findByText('copy_password_failed')).toBeVisible();
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(api.create).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
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

it('recovers precommit adjudication failure through explicit same-event retry before one same-operation CREATE', async () => {
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
  api.adjudicateRejection.mockRejectedValueOnce(
    new Error('precommit unavailable')
  );
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
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('evidence')).not.toBeInTheDocument();
  expect(api.adjudicateRejection).toHaveBeenCalledTimes(1);
  expect(screen.getByText('fenced')).toBeInTheDocument();
  api.inspectRejection.mockResolvedValueOnce({
    status: 'fenced',
    operationId: saved.operationId,
  });
  fireEvent.click(screen.getByRole('button', { name: 'inspect' }));
  await waitFor(() => expect(api.inspectRejection).toHaveBeenCalledTimes(3));
  expect(screen.getByText('fenced')).toBeInTheDocument();
  expect(screen.queryByLabelText('evidence')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'inspect' }));
  await screen.findByLabelText('evidence');
  expect(screen.queryByText('fenced')).not.toBeInTheDocument();
  expect(screen.getByLabelText('evidence')).toHaveValue('a'.repeat(64));
  expect(screen.getByLabelText('evidence')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'adjudicate' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: 'attestation' }));
  fireEvent.click(screen.getByRole('button', { name: 'adjudicate' }));
  await waitFor(() => expect(screen.getByLabelText('password')).toBeEnabled());
  expect(api.adjudicateRejection.mock.calls[1]?.[0]).toEqual(
    api.adjudicateRejection.mock.calls[0]?.[0]
  );
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

describe('canonical root workspace creation', () => {
  const recoveryKey = () =>
    `infra:employee-create:v1:${scope.actorId}:${ROOT_WORKSPACE_ID}`;
  const identity = { email: 'staff@tuturuuu.com', displayName: 'Staff' };
  const password = 'Synthetic-Pass-123!';
  async function fillAndSubmit() {
    fireEvent.click(screen.getByRole('button', { name: 'open' }));
    await waitFor(() => expect(api.availability).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('email'), {
      target: { value: identity.email },
    });
    fireEvent.change(screen.getByLabelText('name'), {
      target: { value: identity.displayName },
    });
    expect(EmployeeCreationPasswordSchema.safeParse(password).success).toBe(
      true
    );
    fireEvent.change(screen.getByLabelText('password'), {
      target: { value: password },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'submit' })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: 'submit' }));
  }
  function deferCreate() {
    let finish: (value: unknown) => void = () => {
      throw new Error('POST not started');
    };
    api.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    return (value: unknown) =>
      act(async () => {
        finish(value);
      });
  }
  it.each(['internal', 'INTERNAL', 'InTeRnAl', ROOT_WORKSPACE_ID])(
    'offers the same control and canonical query/recovery scope for %s',
    async (wsId) => {
      ports.wsId = wsId;
      const finish = deferCreate();
      const { client } = renderDialog();
      await fillAndSubmit();
      expect(api.create).toHaveBeenCalledExactlyOnceWith(
        { ...identity, temporaryPassword: password },
        { operationId: expect.any(String) }
      );
      const saved = JSON.parse(sessionStorage.getItem(recoveryKey()) ?? '{}');
      expect(saved).toMatchObject({
        ...identity,
        actorId: scope.actorId,
        workspaceId: ROOT_WORKSPACE_ID,
        operationId: api.create.mock.calls[0]?.[1].operationId,
      });
      expect(sessionStorage.length).toBe(1);
      expect(sessionStorage.getItem(recoveryKey())).not.toContain(password);
      expect(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey)
      ).toEqual([
        [
          'employee-create-observation',
          scope.actorId,
          ROOT_WORKSPACE_ID,
          undefined,
        ],
        [
          'infrastructure',
          'employee-creation-availability',
          scope.actorId,
          ROOT_WORKSPACE_ID,
        ],
        [
          'employee-create-observation',
          scope.actorId,
          ROOT_WORKSPACE_ID,
          saved.operationId,
        ],
      ]);
      await finish({ status: 'created' });
      await screen.findByText('created');
    }
  );
  it.each(['10000000-0000-4000-8000-000000000009', 'personal', 'PERSONAL'])(
    'does not offer creation or dispatch availability/POST for %s',
    (wsId) => {
      ports.wsId = wsId;
      renderDialog();
      expect(
        screen.queryByRole('button', { name: 'open' })
      ).not.toBeInTheDocument();
      expect(api.availability).not.toHaveBeenCalled();
      expect(api.create).not.toHaveBeenCalled();
      expect(sessionStorage.length).toBe(0);
    }
  );
  it('does not offer creation or dispatch without an actor', () => {
    ports.wsId = 'internal';
    ports.actor = null;
    renderDialog();
    expect(
      screen.queryByRole('button', { name: 'open' })
    ).not.toBeInTheDocument();
    expect(api.availability).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
  });
  it.each([
    ['internal', ROOT_WORKSPACE_ID],
    [ROOT_WORKSPACE_ID, 'internal'],
  ])(
    'retains the unknown original tuple across %s to %s without a second POST',
    async (from, to) => {
      ports.wsId = from;
      api.create.mockRejectedValue(new Error('response lost'));
      const { rerenderDialog } = renderDialog();
      await fillAndSubmit();
      await screen.findByText('stopped');
      const original = sessionStorage.getItem(recoveryKey());
      const saved = JSON.parse(original ?? '{}');
      ports.wsId = to;
      rerenderDialog();
      expect(screen.getByText('stopped')).toBeVisible();
      expect(screen.getByLabelText('email')).toHaveValue(identity.email);
      expect(screen.getByLabelText('name')).toHaveValue(identity.displayName);
      expect(screen.getByLabelText('password')).toHaveValue('');
      fireEvent.click(screen.getByRole('button', { name: 'close' }));
      fireEvent.click(screen.getByRole('button', { name: 'open' }));
      expect(screen.getByRole('button', { name: 'submit' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'submit' }));
      expect(sessionStorage.getItem(recoveryKey())).toBe(original);
      expect(api.observe).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          operationId: saved.operationId,
          actorId: scope.actorId,
          workspaceId: ROOT_WORKSPACE_ID,
          ...identity,
        }),
        { signal: expect.any(AbortSignal) }
      );
      expect(api.create).toHaveBeenCalledTimes(1);
    }
  );
  it.each([
    ['replacement', 'POST'],
    ['retired', 'POST'],
    ['renewed', 'POST'],
    ['replacement', 'observation'],
    ['retired', 'observation'],
    ['renewed', 'observation'],
  ])(
    'ignores a deferred %s actor lifetime result from %s',
    async (kind, transport) => {
      ports.wsId = 'internal';
      let finish: (value: unknown) => Promise<void>;
      if (transport === 'POST') finish = deferCreate();
      else {
        api.create.mockRejectedValue(new Error('response lost'));
        let resolveObservation: (value: unknown) => void = () => {
          throw new Error('Read not started');
        };
        api.observe.mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveObservation = resolve;
            })
        );
        finish = (value) =>
          act(async () => {
            resolveObservation(value);
          });
      }
      const view = renderDialog();
      await fillAndSubmit();
      if (transport === 'observation')
        await waitFor(() => expect(api.observe).toHaveBeenCalledTimes(1));
      const refreshCount = view.refresh.mock.calls.length;
      const original = sessionStorage.getItem(recoveryKey());
      const saved = JSON.parse(original ?? '{}');
      if (kind === 'replacement' || kind === 'renewed') {
        ports.actor = {
          actorId:
            kind === 'renewed'
              ? scope.actorId
              : '10000000-0000-4000-8000-000000000002',
          lifetime: { active: true },
          assertActive: vi.fn(),
        };
        view.rerenderDialog();
        if (kind === 'replacement')
          fireEvent.click(screen.getByRole('button', { name: 'open' }));
      } else {
        scope.assertActive.mockImplementation(() => {
          throw new Error('Actor retired');
        });
      }
      await finish({
        status: 'created',
        operationId: saved.operationId,
        account: { id: '10000000-0000-4000-8000-000000000003', ...identity },
      });
      expect(screen.queryByText('created')).not.toBeInTheDocument();
      expect(view.refresh).toHaveBeenCalledTimes(refreshCount);
      expect(sessionStorage.getItem(recoveryKey())).toBe(original);
      expect(api.create).toHaveBeenCalledTimes(1);
      expect(api.observe).toHaveBeenCalledTimes(transport === 'POST' ? 0 : 1);
      if (kind === 'replacement') {
        expect(screen.getByLabelText('email')).toHaveValue('');
        expect(screen.getByLabelText('name')).toHaveValue('');
        expect(screen.getByLabelText('password')).toHaveValue('');
      }
    }
  );
});
