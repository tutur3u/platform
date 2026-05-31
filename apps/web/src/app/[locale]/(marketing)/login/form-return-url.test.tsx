import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginForm from './form';

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  createCrossAppReturnUrlWithInternalApi: vi.fn(),
  getOtpSettings: vi.fn(),
  getUser: vi.fn(),
  mfaAssuranceLevel: vi.fn(),
  refreshSession: vi.fn(),
  reload: vi.fn(),
  resolveCrossAppReturnUrlWithInternalApi: vi.fn(),
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
  searchParams: new URLSearchParams(),
  signInWithOAuth: vi.fn(),
  switchAccount: vi.fn(),
}));

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: () => <div data-testid="turnstile" />,
}));

vi.mock('@tuturuuu/internal-api/auth', () => ({
  createCrossAppReturnUrlWithInternalApi: (
    ...args: Parameters<typeof mocks.createCrossAppReturnUrlWithInternalApi>
  ) => mocks.createCrossAppReturnUrlWithInternalApi(...args),
  createMfaMobileApprovalChallengeWithInternalApi: vi.fn(),
  getOtpSettings: (...args: Parameters<typeof mocks.getOtpSettings>) =>
    mocks.getOtpSettings(...args),
  pollMfaMobileApprovalChallengeWithInternalApi: vi.fn(),
  resolveCrossAppReturnUrlWithInternalApi: (
    ...args: Parameters<typeof mocks.resolveCrossAppReturnUrlWithInternalApi>
  ) => mocks.resolveCrossAppReturnUrlWithInternalApi(...args),
  sendOtpWithInternalApi: vi.fn(),
  verifyOtpWithInternalApi: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
      mfa: {
        getAuthenticatorAssuranceLevel: mocks.mfaAssuranceLevel,
      },
      refreshSession: mocks.refreshSession,
      signInWithOAuth: mocks.signInWithOAuth,
    },
  }),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/constants/common', () => ({
  DEV_MODE: true,
}));

vi.mock('@/context/account-switcher-context', () => ({
  useAccountSwitcher: () => ({
    accounts: [],
    activeAccountId: 'user-1',
    isInitialized: true,
    switchAccount: mocks.switchAccount,
  }),
}));

vi.mock('@/hooks/use-current-user-profile', () => ({
  useCurrentUserProfile: () => ({
    data: null,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.routerPush,
    refresh: mocks.routerRefresh,
  }),
  useSearchParams: () => mocks.searchParams,
}));

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

vi.mock('framer-motion', () => {
  const createMotionComponent =
    (tag: keyof React.JSX.IntrinsicElements) =>
    ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement(tag, props, children);

  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => (
      <>{children}</>
    ),
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) =>
          createMotionComponent(tag as keyof React.JSX.IntrinsicElements),
      }
    ),
  };
});

function setWindowLocation(search = '') {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      assign: mocks.assign,
      href: `https://tuturuuu.com/login${search}`,
      origin: 'https://tuturuuu.com',
      pathname: '/login',
      reload: mocks.reload,
      search,
    },
  });
}

function renderLoginForm(returnUrl: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  const search = `?returnUrl=${encodeURIComponent(returnUrl)}`;

  mocks.searchParams = new URLSearchParams(search);
  setWindowLocation(search);

  render(
    <QueryClientProvider client={queryClient}>
      <LoginForm />
    </QueryClientProvider>
  );

  return queryClient;
}

describe('LoginForm returnUrl navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOtpSettings.mockResolvedValue({ otpEnabled: true });
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          email: 'person@example.com',
          id: 'user-1',
        },
      },
    });
    mocks.mfaAssuranceLevel.mockResolvedValue({
      data: {
        currentLevel: 'aal1',
        nextLevel: 'aal1',
      },
    });
    mocks.resolveCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      error: 'Invalid returnUrl',
    });
  });

  it('keeps a single-slash returnUrl inside the web app', async () => {
    const queryClient = renderLoginForm('/workspace?tab=1');

    await waitFor(() => {
      expect(mocks.routerPush).toHaveBeenCalledWith('/workspace?tab=1');
    });

    expect(mocks.assign).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it('rejects a protocol-relative returnUrl instead of assigning external navigation', async () => {
    const queryClient = renderLoginForm('//evil.test/phish');

    await screen.findByText('login.invalid_return_url_title');

    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalledWith(
      expect.stringContaining('evil.test')
    );
    queryClient.clear();
  });

  it('rejects a backslash-prefixed returnUrl instead of normalizing it as local', async () => {
    const queryClient = renderLoginForm('/\\evil.test/phish');

    await screen.findByText('login.invalid_return_url_title');

    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalledWith(
      expect.stringContaining('evil.test')
    );
    queryClient.clear();
  });
});
