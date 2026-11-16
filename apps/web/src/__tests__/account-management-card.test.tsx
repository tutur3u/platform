// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountManagementCard } from '@/components/settings/account/account-management-card';

const mocks = vi.hoisted(() => ({ switchAccount: vi.fn(), error: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: mocks.error } }));
vi.mock('@/components/account-switcher', () => ({
  AddAccountButton: () => null,
}));
vi.mock('@/components/settings/account/remove-account-dialog', () => ({
  RemoveAccountDialog: () => null,
}));
vi.mock('@/context/account-switcher-context', () => ({
  useAccountSwitcher: () => ({
    accounts: [
      { id: 'fixture-target', email: 'target@example.test', metadata: {} },
    ],
    activeAccountId: 'fixture-active',
    isLoading: false,
    switchAccount: mocks.switchAccount,
    logoutAll: vi.fn(),
    refreshAccounts: vi.fn(),
  }),
}));

describe('Accounts settings switching', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(['returned failure', 'rejected request'])(
    'recovers from %s',
    async (mode) => {
      if (mode === 'returned failure') {
        mocks.switchAccount.mockResolvedValue({
          success: false,
          error: 'Session expired',
        });
      } else {
        mocks.switchAccount.mockRejectedValue(new Error('Session expired'));
      }
      render(<AccountManagementCard />);
      const button = screen.getByRole('button', {
        name: 'account_switcher.switch',
      });
      fireEvent.click(button);
      await waitFor(() =>
        expect(mocks.error).toHaveBeenCalledWith(
          'account_switcher.switch_account_error',
          { description: 'Session expired' }
        )
      );
      await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
      expect(button.querySelector('.animate-spin')).toBeNull();
    }
  );
});
