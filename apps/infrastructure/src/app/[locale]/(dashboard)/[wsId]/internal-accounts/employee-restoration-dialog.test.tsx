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
vi.mock('@tuturuuu/internal-api/infrastructure', async (original) => {
  const actual =
    await original<typeof import('@tuturuuu/internal-api/infrastructure')>();
  return {
    ...actual,
    EmployeeRestorationConsumer: class extends actual.EmployeeRestorationConsumer {
      constructor(
        input: ConstructorParameters<
          typeof actual.EmployeeRestorationConsumer
        >[0]
      ) {
        super({
          ...input,
          transport: {
            inspect: api.inspect,
            restore: api.restore,
            reconcile: api.reconcile,
          },
        });
      }
    },
  };
});

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
  return (
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
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  session.actor = { actorId: 'admin', assertActive: vi.fn() };
  api.inspect.mockResolvedValue(detail);
  api.refresh.mockResolvedValue(undefined);
});
async function inspect() {
  fireEvent.click(screen.getByRole('button', { name: 'Read current state' }));
  await screen.findByText(
    'This managed account is eligible for access restoration.'
  );
}
async function submit() {
  fireEvent.change(screen.getByLabelText('Confirm account email'), {
    target: { value: email },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Restore managed access' })
  );
}
describe('managed employee access dialog', () => {
  it.each(['en', 'vi'] as const)(
    'renders translated controls and migration boundary in %s',
    (locale) => {
      render(<Harness locale={locale} />);
      const labels = (locale === 'en' ? en : vn)['internal-accounts']
        .restoration;
      expect(screen.getByRole('heading', { name: labels.title })).toBeVisible();
      expect(screen.getByText(labels.migration_separate)).toBeVisible();
      expect(
        screen.getByRole('button', { name: labels.inspect })
      ).toBeEnabled();
      expect(api.inspect).not.toHaveBeenCalled();
      expect(api.restore).not.toHaveBeenCalled();
    }
  );
  it('requires inspection and exact email, then retains pending UUID through close/reopen', async () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', { name: 'Restore managed access' })
    ).not.toBeInTheDocument();
    await inspect();
    expect(
      screen.getByRole('button', { name: 'Restore managed access' })
    ).toBeDisabled();
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
    await screen.findByRole('button', { name: 'Reconcile retained operation' });
    expect(screen.getByText(operationId)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await screen.findByRole('button', { name: 'Reconcile retained operation' });
    expect(screen.getByLabelText('Confirm account email')).toHaveValue('');
    expect(api.restore).toHaveBeenCalledTimes(1);
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
      screen.queryByRole('button', { name: 'Restore managed access' })
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
      screen.queryByRole('heading', { name: 'Managed employee access' })
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
      screen.queryByRole('button', { name: 'Restore managed access' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Checking access…' })
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
