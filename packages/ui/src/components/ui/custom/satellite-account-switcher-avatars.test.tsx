import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { SatelliteAccountSwitcherMenu } from './satellite-account-switcher-menu';

vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@tuturuuu/internal-api/auth', () => ({
  listWebAccountsWithInternalApi: async () => ({
    activeAccountId: 'active',
    accounts: [
      {
        id: 'active',
        email: 'ada@example.test',
        metadata: { displayName: 'Ada Lovelace', avatarUrl: null },
      },
      {
        id: 'other',
        email: 'grace@example.test',
        metadata: {
          displayName: 'Grace Hopper',
          avatarUrl: 'https://example.test/grace.png',
        },
      },
    ],
  }),
  switchWebAccountWithInternalApi: vi.fn(),
  removeWebAccountWithInternalApi: vi.fn(),
}));
vi.mock('@tuturuuu/ui/dropdown-menu', () => {
  const Container = ({ children }: { children: ReactNode }) => <>{children}</>;
  return {
    DropdownMenuItem: ({
      children,
      onSelect,
      disabled,
      asChild,
    }: {
      children: ReactNode;
      onSelect?: () => void;
      disabled?: boolean;
      asChild?: boolean;
    }) =>
      asChild ? (
        children
      ) : (
        <button type="button" disabled={disabled} onClick={onSelect}>
          {children}
        </button>
      ),
    DropdownMenuLabel: Container,
    DropdownMenuPortal: Container,
    DropdownMenuSeparator: () => null,
    DropdownMenuSub: Container,
    DropdownMenuSubContent: Container,
    DropdownMenuSubTrigger: Container,
  };
});

afterEach(cleanup);

function renderMenu(onManageAccounts?: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SatelliteAccountSwitcherMenu
        centralUrl="https://tuturuuu.test"
        t={(key) => key}
        onManageAccounts={onManageAccounts}
      />
    </QueryClientProvider>
  );
}

it('shows each account avatar with an initials fallback, current one included', async () => {
  const { container } = renderMenu();

  expect(await screen.findByText('Ada Lovelace')).toBeTruthy();
  const avatars = container.querySelectorAll('[data-slot="account-avatar"]');
  expect(avatars).toHaveLength(2);
  expect(avatars[0]?.textContent).toBe('AL');
  expect(avatars[1]?.textContent).toBe('GH');
});

it('opens in-app account management when the host provides it', async () => {
  const onManageAccounts = vi.fn();
  renderMenu(onManageAccounts);

  fireEvent.click(
    await screen.findByRole('button', { name: 'manage_accounts' })
  );

  expect(onManageAccounts).toHaveBeenCalledTimes(1);
});

it('links to central account management by default', async () => {
  renderMenu();

  const link = await screen.findByRole('link', { name: 'manage_accounts' });
  expect(link.getAttribute('href')).toBe('https://tuturuuu.test/add-account');
});
