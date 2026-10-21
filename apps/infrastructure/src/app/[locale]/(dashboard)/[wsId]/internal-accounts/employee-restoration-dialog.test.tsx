import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../messages/en.json';
import vn from '../../../../../../messages/vi.json';

const api = vi.hoisted(() => ({
  inspect: vi.fn(),
  restore: vi.fn(),
  reconcile: vi.fn(),
  refresh: vi.fn(),
}));
const session = vi.hoisted(() => ({
  actor: { actorId: 'admin', assertActive: vi.fn() },
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => session.actor,
}));
vi.mock(
  '@tuturuuu/internal-api/infrastructure/employee-management',
  async (original) => ({
    ...(await original<
      Pick<
        typeof import('@tuturuuu/internal-api/infrastructure'),
        'getInternalEmployeeManagement' | 'reconcileInternalEmployee'
      >
    >()),
    getInternalEmployeeManagement: api.inspect,
    reconcileInternalEmployee: api.reconcile,
  })
);
vi.mock(
  '@tuturuuu/internal-api/infrastructure/employee-restoration',
  async (original) => ({
    ...(await original<
      Pick<
        typeof import('@tuturuuu/internal-api/infrastructure'),
        'restoreInternalEmployee'
      >
    >()),
    restoreInternalEmployee: api.restore,
  })
);

import { InternalApiError } from '@tuturuuu/internal-api/client';
import { EmployeeRestorationDialog } from './employee-restoration-dialog';

const id = '10000000-0000-4000-8000-000000000001';
const operationId = '20000000-0000-4000-8000-000000000001';
const email = 'staff@tuturuuu.com';
const detail = {
  id,
  email,
  registryState: 'active',
  managedName: 'Staff',
  managementRoleLabel: null,
  revision: 7,
  mailboxReady: true,
  readinessCode: 'ready',
  reservation: 'exact_intent',
  managed: true,
  operation: null,
  recovery: null,
  providerState: 'confirmed_banned',
  providerReadAt: '2026-10-16T00:00:00Z',
  nextAction: 'restore',
};
function Harness({ locale = 'en' }: { locale?: 'en' | 'vi' }) {
  const [open, setOpen] = useState(true);
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'en' ? en : vn}
      >
        <button type="button" onClick={() => setOpen(true)}>
          Reopen
        </button>
        <EmployeeRestorationDialog
          userId={id}
          email={email}
          open={open}
          onOpenChange={setOpen}
          onDirectoryRefresh={api.refresh}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  session.actor = { actorId: 'admin', assertActive: vi.fn() };
  api.inspect.mockResolvedValue(detail);
  api.refresh.mockResolvedValue(undefined);
});
async function inspect() {
  await screen.findByText(en['internal-accounts'].restoration.next.restore);
}
async function submit() {
  fireEvent.change(screen.getByLabelText('Confirm account email'), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Restore access' }));
}
describe('managed employee access dialog', () => {
  it.each(['en', 'vi'] as const)(
    'renders translated controls and migration boundary in %s',
    async (locale) => {
      render(<Harness locale={locale} />);
      const labels = (locale === 'en' ? en : vn)['internal-accounts']
        .restoration;
      expect(screen.getByRole('heading', { name: labels.title })).toBeVisible();
      expect(screen.getByText(labels.migration_separate)).toBeVisible();
      await screen.findByText(labels.next.restore);
      expect(screen.getByText(labels.advanced)).toBeVisible();
      expect(
        screen.getByRole('button', { name: labels.inspect, hidden: true })
      ).not.toBeVisible();
      expect(api.inspect).toHaveBeenCalledTimes(1);
      expect(api.restore).not.toHaveBeenCalled();
    }
  );
  it('checks readiness and retains a pending operation through reopen using reads only', async () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', { name: 'Restore access' })
    ).not.toBeInTheDocument();
    await inspect();
    expect(
      screen.getByRole('button', { name: 'Restore access' })
    ).toBeDisabled();
    api.reconcile.mockResolvedValue({
      status: 'pending',
      operationId,
      code: 'employee_restore_outcome_unknown',
      nextAction: 'inspect',
      message: 'pending',
    });
    api.restore.mockResolvedValue({
      status: 'pending',
      operationId,
      code: 'employee_restore_outcome_unknown',
      nextAction: 'inspect',
      message: 'pending',
    });
    api.inspect.mockResolvedValueOnce(detail).mockResolvedValue({
      ...detail,
      nextAction: 'inspect',
      operation: { operationId, revision: 7, phase: 'unknown' },
    });
    await submit();
    await screen.findByText(
      en['internal-accounts'].restoration.outcomes.pending
    );
    expect(api.reconcile).not.toHaveBeenCalled();
    expect(screen.getByText(operationId)).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(api.inspect).toHaveBeenCalledTimes(4));
    expect(
      screen.queryByRole('button', { name: 'Restore access' })
    ).not.toBeInTheDocument();
    expect(api.restore).toHaveBeenCalledTimes(1);
  });
  it('confirms a pending restore by explicit read without reconciling', async () => {
    render(<Harness />);
    await inspect();
    const pending = {
      ...detail,
      nextAction: 'inspect',
      operation: { operationId, revision: 7, phase: 'unknown' },
    };
    const completed = {
      ...detail,
      revision: 8,
      nextAction: 'none',
      providerState: 'confirmed_active',
      operation: { operationId, revision: 7, phase: 'completed' },
    };
    api.inspect
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(completed);
    api.restore.mockResolvedValue({
      status: 'pending',
      operationId,
      code: 'employee_restore_outcome_unknown',
      nextAction: 'inspect',
      message: 'pending',
    });
    api.reconcile.mockResolvedValue({
      status: 'restored',
      operationId,
      revision: 8,
      account: { id, email, displayName: 'Staff' },
    });
    await submit();
    await screen.findByText(
      en['internal-accounts'].restoration.outcomes.pending
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Check original result' })
    );
    await screen.findByText(
      en['internal-accounts'].restoration.outcomes.restored
    );
    expect(api.restore).toHaveBeenCalledExactlyOnceWith(id, {
      confirmationEmail: email,
      expectedRevision: 7,
    });
    expect(api.reconcile).not.toHaveBeenCalled();
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });
  it('does not reconcile a replacement operation or claim success', async () => {
    render(<Harness />);
    await inspect();
    api.inspect.mockResolvedValueOnce(detail).mockResolvedValue({
      ...detail,
      nextAction: 'inspect',
      operation: {
        operationId: '30000000-0000-4000-8000-000000000001',
        revision: 7,
        phase: 'unknown',
      },
    });
    api.restore.mockResolvedValue({
      status: 'pending',
      operationId,
      code: 'employee_restore_outcome_unknown',
      nextAction: 'inspect',
      message: 'pending',
    });
    await submit();
    await screen.findByText(
      en['internal-accounts'].restoration.outcomes.pending
    );
    expect(api.reconcile).not.toHaveBeenCalled();
    expect(api.refresh).not.toHaveBeenCalled();
    expect(
      screen.queryByText(en['internal-accounts'].restoration.outcomes.restored)
    ).not.toBeInTheDocument();
  });
  it('shows default-off unavailability without inferring absence or offering replay', async () => {
    render(<Harness />);
    await inspect();
    api.restore.mockRejectedValue(
      new InternalApiError(
        'Unavailable',
        503,
        'employee_management_unavailable'
      )
    );
    await submit();
    await screen.findByText(
      en['internal-accounts'].restoration.outcomes.unavailable
    );
    expect(
      screen.queryByRole('button', { name: 'Restore access' })
    ).not.toBeInTheDocument();
    expect(api.restore).toHaveBeenCalledTimes(1);
  });
  it('only reports restored after a matching independent GET', async () => {
    render(<Harness />);
    await inspect();
    api.restore.mockResolvedValue({
      status: 'restored',
      operationId,
      revision: 8,
      account: { id, email, displayName: 'Staff' },
    });
    await submit();
    await screen.findByText(
      en['internal-accounts'].restoration.outcomes.pending
    );
    expect(
      screen.queryByText(en['internal-accounts'].restoration.outcomes.restored)
    ).not.toBeInTheDocument();
    api.inspect.mockResolvedValue({
      ...detail,
      revision: 8,
      nextAction: 'none',
      providerState: 'confirmed_active',
      operation: { operationId, revision: 7, phase: 'completed' },
    });
    fireEvent.click(screen.getByText('Advanced recovery'));
    fireEvent.click(screen.getByRole('button', { name: 'Read current state' }));
    await screen.findByText(
      en['internal-accounts'].restoration.outcomes.restored
    );
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });
  it('does not display stale private detail after the actor epoch is replaced', async () => {
    const ui = render(<Harness />);
    await inspect();
    session.actor = { actorId: 'replacement', assertActive: vi.fn() };
    ui.rerender(<Harness />);
    expect(
      screen.queryByRole('heading', {
        name: en['internal-accounts'].restoration.title,
      })
    ).not.toBeInTheDocument();
    expect(api.restore).not.toHaveBeenCalled();
  });
  it('locks close and duplicate submissions while the mutation is unresolved', async () => {
    render(<Harness />);
    await inspect();
    api.restore.mockImplementation(() => new Promise(() => {}));
    await submit();
    await waitFor(() => expect(api.restore).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Restore access' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Checking access…', hidden: true })
    ).toBeDisabled();
  });
  it('discards an in-flight result after unmount without another private read', async () => {
    const ui = render(<Harness />);
    await inspect();
    let finish: (value: unknown) => void = () => {};
    api.restore.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await submit();
    await waitFor(() => expect(api.restore).toHaveBeenCalledTimes(1));
    const reads = api.inspect.mock.calls.length;
    ui.unmount();
    finish({
      status: 'pending',
      operationId,
      code: 'employee_restore_outcome_unknown',
      nextAction: 'inspect',
      message: 'pending',
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.inspect).toHaveBeenCalledTimes(reads);
    expect(api.refresh).not.toHaveBeenCalled();
  });
});

it('shows a revision conflict and never mutates again after a fresh inspection', async () => {
  render(<Harness />);
  await inspect();
  api.inspect
    .mockResolvedValueOnce(detail)
    .mockRejectedValueOnce(
      new InternalApiError(
        'PRIVATE provider conflict',
        409,
        'employee_revision_or_operation_conflict'
      )
    );
  api.restore.mockResolvedValue({
    status: 'pending',
    operationId,
    code: 'employee_restore_outcome_unknown',
    nextAction: 'inspect',
    message: 'Unconfirmed',
  });
  await submit();
  await screen.findByText(
    'The account revision or operation changed. Your original request is retained. Read the current state; this form cannot submit another restoration.'
  );
  expect(api.restore).toHaveBeenCalledExactlyOnceWith(id, {
    confirmationEmail: email,
    expectedRevision: 7,
  });
  expect(
    screen.queryByText('PRIVATE provider conflict')
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(`Retained operation: ${operationId}`)
  ).not.toBeVisible();
  api.inspect.mockResolvedValue({
    ...detail,
    revision: 9,
    operation: { operationId, revision: 9, phase: 'reserved' },
    nextAction: 'inspect',
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Check original result' })
  );
  await waitFor(() => expect(api.inspect).toHaveBeenCalledTimes(4));
  expect(
    screen.queryByRole('button', { name: 'Restore access' })
  ).not.toBeInTheDocument();
  const form = screen.getByRole('button', { name: 'Close' }).closest('form');
  if (!form) throw new Error('Missing RESTORE form');
  fireEvent.submit(form);
  expect(api.restore).toHaveBeenCalledTimes(1);
  expect(api.reconcile).not.toHaveBeenCalled();
});
it.each(['network', 'begin ACK', 'attempt ACK'])(
  'keeps %s uncertainty inspection-only without automatic reconciliation',
  async (stage) => {
    render(<Harness />);
    await inspect();
    const pending = {
      ...detail,
      nextAction: 'inspect',
      operation: { operationId, revision: 7, phase: 'unknown' },
    };
    api.inspect.mockResolvedValueOnce(detail).mockResolvedValue(pending);
    if (stage === 'network')
      api.restore.mockRejectedValue(new Error('POST response lost'));
    else
      api.restore.mockResolvedValue({
        status: 'pending',
        operationId,
        code: 'employee_restore_outcome_unknown',
        nextAction: 'inspect',
        message: stage,
      });
    await submit();
    await screen.findByText(
      en['internal-accounts'].restoration.outcomes.pending
    );
    expect(
      screen.queryByRole('button', { name: 'Restore access' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check original result' })
    );
    await waitFor(() =>
      expect(api.inspect).toHaveBeenCalledTimes(stage === 'network' ? 3 : 4)
    );
    expect(api.restore).toHaveBeenCalledTimes(1);
    expect(api.reconcile).not.toHaveBeenCalled();
    expect(api.refresh).not.toHaveBeenCalled();
  }
);

it('opens an existing unknown operation for read-only inspection without reconciliation', async () => {
  api.inspect.mockResolvedValue({
    ...detail,
    nextAction: 'inspect',
    operation: { operationId, revision: 7, phase: 'unknown' },
  });
  render(<Harness />);
  await screen.findByText(en['internal-accounts'].restoration.next.inspect);
  expect(
    screen.queryByRole('button', { name: 'Restore access' })
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Check original result' })
  );
  await waitFor(() => expect(api.inspect).toHaveBeenCalledTimes(2));
  expect(screen.getByText(operationId)).not.toBeVisible();
  expect(api.restore).not.toHaveBeenCalled();
  expect(api.reconcile).not.toHaveBeenCalled();
});
