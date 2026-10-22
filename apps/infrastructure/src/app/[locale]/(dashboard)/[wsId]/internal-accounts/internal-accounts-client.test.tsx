import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InternalAccount } from '@tuturuuu/internal-api/infrastructure';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';
import en from '../../../../../../messages/en.json';
import viMessages from '../../../../../../messages/vi.json';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  inspect: vi.fn(),
  restore: vi.fn(),
  reconcile: vi.fn(),
}));
const actor = vi.hoisted(() => ({
  actorId: '10000000-0000-4000-8000-000000000001',
  lifetime: {},
  assertActive: vi.fn(),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => actor,
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ wsId: '00000000-0000-0000-0000-000000000000' }),
}));
vi.mock('@tuturuuu/internal-api/infrastructure', async (original) => {
  const actual =
    await original<typeof import('@tuturuuu/internal-api/infrastructure')>();
  return {
    ...actual,
    listInternalAccounts: api.list,
    updateInternalAccount: api.update,
    listReviewAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
  };
});

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

import { InternalAccountsClient } from './internal-accounts-client';

const account = {
  id: '10000000-0000-4000-8000-000000000002',
  email: 'disabled@tuturuuu.com',
  displayName: 'Disabled staff',
  username: null,
  isDisabled: true,
  isSelf: false,
  createdAt: '2026-10-01T00:00:00Z',
  emailConfirmedAt: '2026-10-01T00:00:00Z',
  lastSignInAt: null,
  personalWorkspaceId: null,
  storageUsedBytes: null,
  storageLimitBytes: null,
  bannedUntil: '2099-01-01T00:00:00Z',
} satisfies InternalAccount;
const readiness = {
  id: account.id,
  email: account.email,
  registryState: 'active',
  managedName: 'Disabled staff',
  managementRoleLabel: null,
  revision: 7,
  mailboxReady: true,
  readinessCode: 'ready',
  reservation: 'exact_intent',
  managed: true,
  operation: null,
  recovery: null,
  providerState: 'confirmed_banned',
  providerReadAt: '2026-10-22T00:00:00Z',
  nextAction: 'restore',
};
beforeEach(() => {
  vi.resetAllMocks();
  api.list.mockImplementation(async ({ activeOnly }) => ({
    accounts: activeOnly ? [] : [account],
    count: activeOnly ? 0 : 1,
    nextCursor: null,
  }));
  api.inspect.mockResolvedValue(readiness);
});
function mount(locale: 'en' | 'vi' = 'en') {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'en' ? en : viMessages}
      >
        <InternalAccountsClient />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
it.each(['en', 'vi'] as const)(
  'discovers disabled accounts through the visible %s affordance and authoritative inspection',
  async (locale) => {
    mount(locale);
    const labels = (locale === 'en' ? en : viMessages)['internal-accounts'];
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
    expect(api.list.mock.calls[0]?.[0]).toMatchObject({
      activeOnly: true,
      verifiedOnly: true,
    });
    expect(screen.queryByText(account.email)).not.toBeInTheDocument();
    const include = screen.getByRole('button', {
      name:
        locale === 'en'
          ? 'Include disabled accounts'
          : 'Hiển thị cả tài khoản bị vô hiệu hóa',
    });
    fireEvent.click(include);
    await screen.findByText(account.email);
    expect(api.list.mock.calls[1]?.[0]).toMatchObject({
      activeOnly: false,
      verifiedOnly: true,
    });
    fireEvent.pointerDown(
      screen.getByRole('button', { name: labels.actions.open_menu }),
      { button: 0, ctrlKey: false, pointerType: 'mouse' }
    );
    fireEvent.click(
      await screen.findByText(labels.restoration.open, {
        selector: '[role="menuitem"]:not([data-testid])',
      })
    );
    await screen.findByText(labels.restoration.next.restore);
    expect(api.inspect).toHaveBeenCalledExactlyOnceWith(account.id);
    expect(
      screen.getByRole('button', { name: labels.restoration.restore })
    ).toBeDisabled();
    expect(api.restore).not.toHaveBeenCalled();
    expect(api.reconcile).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(labels.restoration.confirmation), {
      target: { value: 'different@tuturuuu.com' },
    });
    expect(
      screen.getByRole('button', { name: labels.restoration.restore })
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText(labels.restoration.confirmation), {
      target: { value: account.email },
    });
    expect(
      screen.getByRole('button', { name: labels.restoration.restore })
    ).toBeEnabled();
    expect(api.restore).not.toHaveBeenCalled();
  }
);
it('does not infer restoration eligibility from a disabled directory row', async () => {
  api.inspect.mockResolvedValue({
    ...readiness,
    managed: false,
    readinessCode: 'not_managed',
    nextAction: 'none',
  });
  mount();
  fireEvent.click(
    screen.getByRole('button', { name: 'Include disabled accounts' })
  );
  await screen.findByText(account.email);
  fireEvent.pointerDown(
    screen.getByRole('button', {
      name: en['internal-accounts'].actions.open_menu,
    }),
    { button: 0, ctrlKey: false, pointerType: 'mouse' }
  );
  fireEvent.click(
    await screen.findByRole('menuitem', {
      name: en['internal-accounts'].restoration.open,
    })
  );
  await screen.findByText(en['internal-accounts'].restoration.next.none);
  expect(
    screen.queryByRole('button', {
      name: en['internal-accounts'].restoration.restore,
    })
  ).not.toBeInTheDocument();
  expect(api.restore).not.toHaveBeenCalled();
  expect(api.reconcile).not.toHaveBeenCalled();
  expect(api.update).not.toHaveBeenCalled();
});
