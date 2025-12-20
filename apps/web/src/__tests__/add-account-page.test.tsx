import { render, screen, waitFor } from '@testing-library/react';
import type { SupabaseSession } from '@tuturuuu/supabase/next/user';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AddAccountPage from '@/app/[locale]/(auth)/add-account/page';

const mockSession: SupabaseSession = {
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    user_metadata: {
      full_name: 'Test User',
      avatar_url: 'https://avatar.test/user.jpg',
    },
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  },
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
};

const mockAddAccount = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockLocationHref = '';
const mockGetSession = vi.fn();
const mockSearchParamsGet = vi.fn();

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
}));

// Mock account switcher context
vi.mock('@/context/account-switcher-context', () => ({
  useAccountSwitcher: () => ({
    addAccount: mockAddAccount,
    isInitialized: true,
  }),
}));

// Mock Supabase
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      getSession: mockGetSession,
    },
  }),
}));

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock icons
vi.mock('@tuturuuu/icons', () => ({
  Loader2: () => <div>Loading Icon</div>,
}));

describe('AddAccountPage', () => {
  beforeAll(() => {
    // Mock window.location.href setter
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...window.location,
        href: '',
      },
    });

    Object.defineProperty(window.location, 'href', {
      get: () => mockLocationHref,
      set: (value) => {
        mockLocationHref = value;
      },
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationHref = '';

    // Set up default mock behaviors
    mockGetSession.mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'returnUrl') return '/test-workspace';
      return null;
    });
  });

  it('should render loading state initially', () => {
    mockAddAccount.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<AddAccountPage />);

    expect(screen.getByText('account_switcher.adding_account')).toBeDefined();
    expect(screen.getByText('account_switcher.please_wait')).toBeDefined();
  });

  it('should add account and redirect on success', async () => {
    mockAddAccount.mockResolvedValue({ success: true });

    render(<AddAccountPage />);

    await waitFor(
      () => {
        expect(mockAddAccount).toHaveBeenCalledWith(mockSession, {
          switchImmediately: true,
        });
      },
      { timeout: 2000 }
    );

    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith('/test-workspace');
      },
      { timeout: 2000 }
    );
  });

  it('should redirect immediately if account already exists', async () => {
    mockAddAccount.mockResolvedValue({
      success: false,
      error: 'Account already exists',
    });

    render(<AddAccountPage />);

    await waitFor(
      () => {
        expect(mockAddAccount).toHaveBeenCalled();
      },
      { timeout: 1000 }
    );

    // Should redirect without showing error
    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith('/test-workspace');
      },
      { timeout: 2000 }
    );
  });

  it('should show error for non-duplicate failures', async () => {
    mockAddAccount.mockResolvedValue({
      success: false,
      error: 'Network error',
    });

    render(<AddAccountPage />);

    await waitFor(() => {
      expect(
        screen.getByText('account_switcher.account_added_error')
      ).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });

    // Should not redirect
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should handle missing session error', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'No session' },
    });

    render(<AddAccountPage />);

    await waitFor(() => {
      expect(
        screen.getByText('account_switcher.account_added_error')
      ).toBeDefined();
    });
  });

  it('should use returnUrl from query params', async () => {
    const customReturnUrl = '/custom-workspace/settings';

    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'returnUrl') return encodeURIComponent(customReturnUrl);
      return null;
    });

    mockAddAccount.mockResolvedValue({ success: true });

    render(<AddAccountPage />);

    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith(customReturnUrl);
      },
      { timeout: 2000 }
    );
  });

  it('should redirect to root if no returnUrl provided', async () => {
    mockSearchParamsGet.mockImplementation(() => null);

    mockAddAccount.mockResolvedValue({ success: true });

    render(<AddAccountPage />);

    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      },
      { timeout: 2000 }
    );
  });

  it('should fall back to root for cross-origin returnUrl', async () => {
    const unsafeReturnUrl = 'https://evil.com/path';

    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'returnUrl') return encodeURIComponent(unsafeReturnUrl);
      return null;
    });

    mockAddAccount.mockResolvedValue({ success: true });

    render(<AddAccountPage />);

    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      },
      { timeout: 2000 }
    );
  });

  it('should fall back to root for protocol-relative returnUrl', async () => {
    const unsafeReturnUrl = '//evil.com/path';

    mockSearchParamsGet.mockImplementation((key: string) => {
      if (key === 'returnUrl') return encodeURIComponent(unsafeReturnUrl);
      return null;
    });

    mockAddAccount.mockResolvedValue({ success: true });

    render(<AddAccountPage />);

    await waitFor(
      () => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      },
      { timeout: 2000 }
    );
  });

  it('should handle unexpected errors gracefully', async () => {
    mockAddAccount.mockRejectedValue(new Error('Unexpected error'));

    render(<AddAccountPage />);

    await waitFor(() => {
      const errorElements = screen.getAllByText(
        'account_switcher.account_added_error'
      );
      expect(errorElements.length).toBeGreaterThan(0);
    });

    await waitFor(() => {
      const unexpectedErrorElements = screen.getAllByText(
        'An unexpected error occurred'
      );
      expect(unexpectedErrorElements.length).toBeGreaterThan(0);
    });
  });
});
