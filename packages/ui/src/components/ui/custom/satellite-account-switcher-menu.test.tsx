import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SatelliteAccountSwitcherMenu } from './satellite-account-switcher-menu';

const mocks = vi.hoisted(() => ({ switchAccount: vi.fn(), error: vi.fn() }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: mocks.error } }));
vi.mock('@tuturuuu/internal-api/auth', () => ({
  listWebAccountsWithInternalApi: async () => ({
    activeAccountId: 'active',
    accounts: [
      {
        id: 'target',
        email: 'target@example.test',
        metadata: { displayName: 'Fixture target' },
      },
    ],
  }),
  switchWebAccountWithInternalApi: mocks.switchAccount,
  removeWebAccountWithInternalApi: vi.fn(),
}));
vi.mock('@tuturuuu/ui/dropdown-menu', () => {
  const Container = ({ children }: { children: ReactNode }) => <>{children}</>;
  return {
    DropdownMenuItem: ({
      children,
      onSelect,
      disabled,
    }: {
      children: ReactNode;
      onSelect?: () => void;
      disabled?: boolean;
    }) => (
      <button disabled={disabled} onClick={onSelect}>
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

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(['returned failure', 'rejected request'])(
  'reports %s and releases account controls without waiting for refetch',
  async (mode) => {
    if (mode === 'returned failure') {
      mocks.switchAccount.mockResolvedValue({
        success: false,
        error: 'Session expired',
      });
    } else {
      mocks.switchAccount.mockRejectedValue(new Error('Session expired'));
    }
    const onAccountChanged = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(
      () => new Promise(() => {})
    );
    render(
      <QueryClientProvider client={queryClient}>
        <SatelliteAccountSwitcherMenu
          centralUrl="https://example.test"
          currentRoute="/calendar/personal"
          t={(key) => key}
          onAccountChanged={onAccountChanged}
        />
      </QueryClientProvider>
    );
    const button = await screen.findByRole('button', {
      name: /Fixture target\s*target@example\.test/,
    });
    fireEvent.click(button);
    await waitFor(() => expect(mocks.switchAccount).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith('switch_account_error', {
        description: 'Session expired',
      })
    );
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    expect(onAccountChanged).not.toHaveBeenCalled();
    queryClient.clear();
  }
);
