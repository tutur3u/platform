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
        { operationId: expect.any(String), actorUserId: scope.actorId }
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
