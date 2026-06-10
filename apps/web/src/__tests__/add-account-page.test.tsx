// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AddAccountPage from '@/app/[locale]/(auth)/add-account/page';

const mockAddAccount = vi.fn();
const mockPush = vi.fn();
const mockSearchParamsGet = vi.fn();
const mockLocationAssign = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
}));

vi.mock('@/context/account-switcher-context', () => ({
  useAccountSwitcher: () => ({
    addAccount: mockAddAccount,
    isInitialized: true,
  }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/icons', () => ({
  Loader2: () => <div>Loading Icon</div>,
}));

vi.mock('@tuturuuu/icons/lucide', () => ({
  Check: () => <div>Check Icon</div>,
}));

describe('AddAccountPage', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...window.location,
        assign: mockLocationAssign,
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'returnUrl') return '/en/personal/tasks';
      return null;
    });
  });

  it('renders the loading state while saving the account', () => {
    mockAddAccount.mockImplementation(() => new Promise(() => {}));

    render(<AddAccountPage />);

    expect(screen.getByText('account_switcher.adding_account')).toBeDefined();
    expect(screen.getByText('account_switcher.please_wait')).toBeDefined();
  });

  it('saves the current server session and redirects to the server-approved target', async () => {
    mockAddAccount.mockResolvedValue({
      redirectTo: '/en/personal/tasks',
      success: true,
    });

    render(<AddAccountPage />);

    await waitFor(() => {
      expect(mockAddAccount).toHaveBeenCalledWith({
        returnUrl: '/en/personal/tasks',
      });
    });
    await waitFor(() => {
      expect(mockLocationAssign).toHaveBeenCalledWith('/en/personal/tasks');
    });
  });

  it('falls back to home when the server save succeeds without a redirect', async () => {
    mockSearchParamsGet.mockImplementation(() => null);
    mockAddAccount.mockResolvedValue({ success: true });

    render(<AddAccountPage />);

    await waitFor(() => {
      expect(mockAddAccount).toHaveBeenCalledWith({
        returnUrl: null,
      });
    });
    await waitFor(() => {
      expect(mockLocationAssign).toHaveBeenCalledWith('/');
    });
  });

  it('shows the returned error when the server cannot save the account', async () => {
    mockAddAccount.mockResolvedValue({
      error: 'Session not found',
      success: false,
    });

    render(<AddAccountPage />);

    await waitFor(() => {
      expect(
        screen.getByText('account_switcher.account_added_error')
      ).toBeDefined();
    });
    expect(screen.getByText('Session not found')).toBeDefined();
    expect(mockLocationAssign).not.toHaveBeenCalled();
  });
});
