import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginForm from './form';

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  createCrossAppReturnUrlWithInternalApi: vi.fn(),
  currentUserProfile: null as {
    avatar_url: string | null;
    display_name: string | null;
    email: string | null;
    full_name: string | null;
    id: string;
  } | null,
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
  passwordLoginWithInternalApi: vi.fn(),
  pollMfaMobileApprovalChallengeWithInternalApi: vi.fn(),
  resolveCrossAppReturnUrlWithInternalApi: (
    ...args: Parameters<typeof mocks.resolveCrossAppReturnUrlWithInternalApi>
  ) => mocks.resolveCrossAppReturnUrlWithInternalApi(...args),
  sendOtpWithInternalApi: vi.fn(),
  verifyOtpWithInternalApi: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-browser', () => ({
  createAuthClient: () => ({
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
    data: mocks.currentUserProfile,
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
    mocks.currentUserProfile = {
      avatar_url: null,
      display_name: 'Person Example',
      email: 'person@example.com',
      full_name: null,
      id: 'user-1',
    };
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

  it('does not expose authenticated QR handoff on the public login form', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const queryClient = renderLoginForm('/');

    await screen.findByRole('button', {
      name: 'login.continue_with_email',
    });

    expect(
      screen.queryByRole('button', { name: 'login.qr_title' })
    ).not.toBeInTheDocument();
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

  it('creates a tokenized Chat verifier return URL for authenticated Chat returns', async () => {
    const chatReturnUrl =
      'https://chat.tuturuuu.com/verify-token?nextUrl=%2Fpersonal';
    const tokenizedChatReturnUrl =
      'https://chat.tuturuuu.com/verify-token?nextUrl=%2Fpersonal&token=cross-app-token&originApp=web&targetApp=chat';
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      returnUrl: tokenizedChatReturnUrl,
      targetApp: 'chat',
    });

    const queryClient = renderLoginForm(chatReturnUrl);

    await waitFor(() => {
      expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledWith(
        {
          returnUrl: chatReturnUrl,
        }
      );
    });

    expect(
      mocks.resolveCrossAppReturnUrlWithInternalApi
    ).not.toHaveBeenCalled();
    expect(mocks.refreshSession).toHaveBeenCalled();
    expect(mocks.assign).toHaveBeenCalledWith(tokenizedChatReturnUrl);
    queryClient.clear();
  });

  it('requires confirmation for configured external app returnUrls', async () => {
    const originalPublicExternalDomains =
      process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS;
    const originalServerExternalDomains =
      process.env.TUTURUUU_EXTERNAL_APP_DOMAINS;

    try {
      process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS =
        'partner:https://partner.example';
      delete process.env.TUTURUUU_EXTERNAL_APP_DOMAINS;
      mocks.resolveCrossAppReturnUrlWithInternalApi.mockResolvedValue({
        appName: 'Partner Portal',
        targetApp: 'partner',
      });

      const queryClient = renderLoginForm('https://partner.example/launch');

      await screen.findByText('login.confirm_internal_app_account_title');

      expect(
        mocks.resolveCrossAppReturnUrlWithInternalApi
      ).toHaveBeenCalledWith({
        returnUrl: 'https://partner.example/launch',
      });
      expect(
        mocks.createCrossAppReturnUrlWithInternalApi
      ).not.toHaveBeenCalled();
      expect(mocks.assign).not.toHaveBeenCalled();
      queryClient.clear();
    } finally {
      if (originalPublicExternalDomains === undefined) {
        delete process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS;
      } else {
        process.env.NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS =
          originalPublicExternalDomains;
      }

      if (originalServerExternalDomains === undefined) {
        delete process.env.TUTURUUU_EXTERNAL_APP_DOMAINS;
      } else {
        process.env.TUTURUUU_EXTERNAL_APP_DOMAINS =
          originalServerExternalDomains;
      }
    }
  });
});
