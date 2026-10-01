import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { vi } from 'vitest';
import LoginForm from './form';

const mocks = vi.hoisted(() => ({
  assign: vi.fn(),
  createCrossAppReturnUrlWithInternalApi: vi.fn(),
  createMfaMobileApprovalChallengeWithInternalApi: vi.fn(),
  currentUserProfile: null as {
    avatar_url: string | null;
    display_name: string | null;
    email: string | null;
    full_name: string | null;
    id: string;
  } | null,
  getOtpSettings: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  mfaAssuranceLevel: vi.fn(),
  mfaChallenge: vi.fn(),
  mfaListFactors: vi.fn(),
  mfaVerify: vi.fn(),
  passwordLoginWithInternalApi: vi.fn(),
  pollMfaMobileApprovalChallengeWithInternalApi: vi.fn(),
  refreshSession: vi.fn(),
  reload: vi.fn(),
  replace: vi.fn(),
  resolveCrossAppReturnUrlWithInternalApi: vi.fn(),
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
  searchParams: new URLSearchParams(),
  sendOtpWithInternalApi: vi.fn(),
  signInWithOAuth: vi.fn(),
  switchAccount: vi.fn(),
  verifyOtpWithInternalApi: vi.fn(),
}));

vi.mock('@marsidev/react-turnstile', () => ({
  Turnstile: () => <div data-testid="turnstile" />,
}));

vi.mock('@tuturuuu/ui/input-otp', () => ({
  InputOTP: ({
    disabled,
    maxLength,
    onChange,
    value,
  }: {
    disabled?: boolean;
    maxLength?: number;
    onChange?: (value: string) => void;
    value?: string;
  }) => (
    <input
      aria-label="otp-input"
      disabled={disabled}
      maxLength={maxLength}
      onChange={(event) => onChange?.(event.target.value)}
      value={value ?? ''}
    />
  ),
  InputOTPGroup: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  InputOTPSlot: () => null,
}));

vi.mock('@tuturuuu/internal-api/auth', () => ({
  createCrossAppReturnUrlWithInternalApi: (
    ...args: Parameters<typeof mocks.createCrossAppReturnUrlWithInternalApi>
  ) => mocks.createCrossAppReturnUrlWithInternalApi(...args),
  createMfaMobileApprovalChallengeWithInternalApi: (
    ...args: Parameters<
      typeof mocks.createMfaMobileApprovalChallengeWithInternalApi
    >
  ) => mocks.createMfaMobileApprovalChallengeWithInternalApi(...args),
  getOtpSettings: (...args: Parameters<typeof mocks.getOtpSettings>) =>
    mocks.getOtpSettings(...args),
  passwordLoginWithInternalApi: (
    ...args: Parameters<typeof mocks.passwordLoginWithInternalApi>
  ) => mocks.passwordLoginWithInternalApi(...args),
  pollMfaMobileApprovalChallengeWithInternalApi: (
    ...args: Parameters<
      typeof mocks.pollMfaMobileApprovalChallengeWithInternalApi
    >
  ) => mocks.pollMfaMobileApprovalChallengeWithInternalApi(...args),
  resolveCrossAppReturnUrlWithInternalApi: (
    ...args: Parameters<typeof mocks.resolveCrossAppReturnUrlWithInternalApi>
  ) => mocks.resolveCrossAppReturnUrlWithInternalApi(...args),
  sendOtpWithInternalApi: (
    ...args: Parameters<typeof mocks.sendOtpWithInternalApi>
  ) => mocks.sendOtpWithInternalApi(...args),
  verifyOtpWithInternalApi: (
    ...args: Parameters<typeof mocks.verifyOtpWithInternalApi>
  ) => mocks.verifyOtpWithInternalApi(...args),
}));

vi.mock('@tuturuuu/supabase/next/auth-browser', () => ({
  createAuthClient: () => ({
    auth: {
      getUser: mocks.getUser,
      mfa: {
        challenge: mocks.mfaChallenge,
        getAuthenticatorAssuranceLevel: mocks.mfaAssuranceLevel,
        listFactors: mocks.mfaListFactors,
        verify: mocks.mfaVerify,
      },
      refreshSession: mocks.refreshSession,
      signInWithOAuth: mocks.signInWithOAuth,
    },
  }),
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({
    auth: {
      getClaims: mocks.getClaims,
      getUser: mocks.getUser,
      mfa: { listFactors: mocks.mfaListFactors },
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

function setWindowLocation(search = '', origin = 'https://tuturuuu.com') {
  const url = new URL(`/login${search}`, origin);

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      assign: mocks.assign,
      href: url.toString(),
      origin: url.origin,
      pathname: '/login',
      reload: mocks.reload,
      replace: mocks.replace,
      search,
    },
  });
}

export const queryClients = new Set<QueryClient>();

export function renderLoginFormSearch(
  search = '',
  options: {
    deferAuthSurfaceUntilSessionCheck?: boolean;
    origin?: string;
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  });
  queryClients.add(queryClient);

  mocks.searchParams = new URLSearchParams(search);
  setWindowLocation(search, options.origin);

  render(
    <QueryClientProvider client={queryClient}>
      <LoginForm
        deferAuthSurfaceUntilSessionCheck={
          options.deferAuthSurfaceUntilSessionCheck
        }
      />
    </QueryClientProvider>
  );

  return queryClient;
}

export function renderLoginForm(
  returnUrl: string,
  options: {
    deferAuthSurfaceUntilSessionCheck?: boolean;
    origin?: string;
  } = {}
) {
  return renderLoginFormSearch(`?returnUrl=${encodeURIComponent(returnUrl)}`, {
    deferAuthSurfaceUntilSessionCheck:
      options.deferAuthSurfaceUntilSessionCheck,
    origin: options.origin,
  });
}

export function mockPrimarySignInSession(method: 'password' | 'otp') {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  const signIn =
    method === 'password'
      ? mocks.passwordLoginWithInternalApi
      : mocks.verifyOtpWithInternalApi;
  signIn.mockImplementation(async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'person@example.com', id: 'user-1' } },
      error: null,
    });
    return method === 'password' ? { success: true } : {};
  });
}

export { mocks };
