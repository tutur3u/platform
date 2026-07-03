import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function renderLoginFormSearch(
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

function renderLoginForm(
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

const platformVerifyTokenReturnUrl =
  'http://tuturuuu.com/verify-token?nextUrl=%2F';
const localPortlessPlatformVerifyTokenReturnUrl =
  'https://tuturuuu.localhost:1355/verify-token?nextUrl=%2Fen%2Fpersonal%2Ftasks';

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
    mocks.mfaListFactors.mockResolvedValue({
      data: {
        totp: [
          {
            id: 'factor-1',
            status: 'verified',
          },
        ],
      },
      error: null,
    });
    mocks.mfaChallenge.mockResolvedValue({
      data: {
        id: 'challenge-1',
      },
      error: null,
    });
    mocks.mfaVerify.mockResolvedValue({ error: null });
    mocks.resolveCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      error: 'Invalid returnUrl',
    });
    mocks.createMfaMobileApprovalChallengeWithInternalApi.mockResolvedValue({
      challenge: {
        expiresAt: '2026-06-11T03:10:00.000Z',
        id: 'mobile-challenge-1',
        pairCode: '123456',
      },
      secret: 'mobile-secret',
    });
    mocks.pollMfaMobileApprovalChallengeWithInternalApi.mockResolvedValue({
      mobileMfaVerified: false,
      status: 'pending',
    });
    mocks.passwordLoginWithInternalApi.mockResolvedValue({ success: true });
    mocks.refreshSession.mockResolvedValue({ error: null });
    mocks.sendOtpWithInternalApi.mockResolvedValue({});
    mocks.signInWithOAuth.mockResolvedValue({ error: null });
    mocks.verifyOtpWithInternalApi.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it('renders the public auth controls while Supabase user bootstrap is pending', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockReturnValue(new Promise(() => undefined));

    const queryClient = renderLoginForm('/');

    await screen.findByRole('button', {
      name: 'login.continue_with_email',
    });
    expect(
      screen.getByPlaceholderText('login.email_username_placeholder')
    ).toBeInTheDocument();
    queryClient.clear();
  });

  it('renders the profile loading card while deferred internal app bootstrap is pending', () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockReturnValue(new Promise(() => undefined));

    const queryClient = renderLoginForm('https://partner.example/launch', {
      deferAuthSurfaceUntilSessionCheck: true,
    });

    expect(
      screen.getByText('login.loading_account_profile_title')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /login\.loading_profile/u })
    ).toBeDisabled();
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('shows redirecting instead of the public form for authenticated login hard loads', async () => {
    const queryClient = renderLoginFormSearch();

    await screen.findByText('account_switcher.redirecting');

    expect(mocks.routerPush).toHaveBeenCalledWith('/');
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('hard redirects authenticated bootstrap for platform verify-token returnUrls', async () => {
    const queryClient = renderLoginForm(platformVerifyTokenReturnUrl);

    await screen.findByText('account_switcher.redirecting');

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/');
    });
    expect(mocks.routerPush).not.toHaveBeenCalledWith(
      '/verify-token?nextUrl=%2F'
    );
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('falls back for platform verify-token nextUrl values with control characters', async () => {
    const queryClient = renderLoginForm(
      'http://tuturuuu.com/verify-token?nextUrl=%2F%09%2Fevil.test%2Fphish'
    );

    await screen.findByText('account_switcher.redirecting');

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding');
    });
    expect(mocks.replace).not.toHaveBeenCalledWith('//evil.test/phish');
    expect(mocks.assign).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it('hard redirects authenticated bootstrap for local Portless platform verify-token returnUrls', async () => {
    const queryClient = renderLoginForm(
      localPortlessPlatformVerifyTokenReturnUrl
    );

    await screen.findByText('account_switcher.redirecting');

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/en/personal/tasks');
    });
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
    expect(
      mocks.resolveCrossAppReturnUrlWithInternalApi
    ).not.toHaveBeenCalled();
    expect(
      screen.queryByText('login.invalid_return_url_title')
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('does not use a wildcard browser origin for social OAuth callbacks', async () => {
    vi.stubEnv('WEB_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_WEB_APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('COOLIFY_URL', '');
    vi.stubEnv('COOLIFY_FQDN', '');
    vi.stubEnv('PORT', '7803');
    mocks.currentUserProfile = null;
    mocks.getUser.mockReturnValue(new Promise(() => undefined));

    const queryClient = renderLoginForm('/', {
      origin: 'http://0.0.0.0:7803',
    });

    fireEvent.click(
      await screen.findByRole('button', {
        name: /login\.continue_with_google/u,
      })
    );

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            redirectTo: 'http://localhost:7803/api/auth/callback?returnUrl=%2F',
          }),
          provider: 'google',
        })
      );
    });
    queryClient.clear();
  });

  it('uses the platform callback while preserving a managed subdomain returnUrl for social OAuth', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');
    mocks.currentUserProfile = null;
    mocks.getUser.mockReturnValue(new Promise(() => undefined));

    const queryClient = renderLoginFormSearch(
      '?nextUrl=%2Fworkspace%2Fpersonal%2Fplans',
      {
        origin: 'https://vc.tuturuuu.com',
      }
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: /login\.continue_with_google/u,
      })
    );

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            redirectTo:
              'https://tuturuuu.com/api/auth/callback?returnUrl=https%3A%2F%2Fvc.tuturuuu.com%2Fworkspace%2Fpersonal%2Fplans&nextUrl=%2Fworkspace%2Fpersonal%2Fplans',
          }),
          provider: 'google',
        })
      );
    });
    queryClient.clear();
  });

  it('does not expose generic Microsoft OAuth on the login form', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockReturnValue(new Promise(() => undefined));

    const queryClient = renderLoginFormSearch('?provider=azure');

    await screen.findByRole('button', {
      name: /login\.continue_with_google/u,
    });

    expect(
      screen.queryByRole('button', {
        name: /login\.continue_with_microsoft/u,
      })
    ).not.toBeInTheDocument();
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it('navigates home after password login without a returnUrl', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const queryClient = renderLoginFormSearch();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'login.use_password_instead',
      })
    );
    const passwordInput = await screen.findByPlaceholderText(
      'login.password_placeholder'
    );
    fireEvent.change(passwordInput, {
      target: { value: 'password1234' },
    });

    const signInButton = await screen.findByRole('button', {
      name: 'login.sign_in',
    });
    // The unit harness does not always hydrate RHF formState.isValid after the
    // async stage switch, so clear the DOM-only disabled flag to exercise submit.
    (signInButton as HTMLButtonElement).disabled = false;
    await act(async () => {
      fireEvent.click(signInButton);
    });

    await waitFor(() => {
      expect(mocks.passwordLoginWithInternalApi).toHaveBeenCalled();
    });
    await screen.findByText('account_switcher.redirecting');
    expect(mocks.routerPush).toHaveBeenCalledWith('/');
    expect(mocks.routerRefresh).toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('hard redirects password sign-in for platform verify-token returnUrls', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const queryClient = renderLoginForm(platformVerifyTokenReturnUrl);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'login.use_password_instead',
      })
    );
    const passwordInput = await screen.findByPlaceholderText(
      'login.password_placeholder'
    );
    fireEvent.change(passwordInput, {
      target: { value: 'password1234' },
    });

    const signInButton = await screen.findByRole('button', {
      name: 'login.sign_in',
    });
    (signInButton as HTMLButtonElement).disabled = false;
    await act(async () => {
      fireEvent.click(signInButton);
    });

    await waitFor(() => {
      expect(mocks.passwordLoginWithInternalApi).toHaveBeenCalled();
    });
    await screen.findByText('account_switcher.redirecting');
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/');
    });
    expect(mocks.routerPush).not.toHaveBeenCalledWith(
      '/verify-token?nextUrl=%2F'
    );
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('shows redirecting after OTP login succeeds without a returnUrl', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const queryClient = renderLoginFormSearch();

    const sendOtpButton = await screen.findByRole('button', {
      name: 'login.continue_with_email',
    });
    // The unit harness does not mount a real Turnstile widget, so clear the
    // DOM-only disabled flag to exercise the submit path.
    (sendOtpButton as HTMLButtonElement).disabled = false;
    await act(async () => {
      fireEvent.click(sendOtpButton);
    });

    await waitFor(() => {
      expect(mocks.sendOtpWithInternalApi).toHaveBeenCalled();
    });

    fireEvent.change(await screen.findByLabelText('otp-input'), {
      target: { value: '123456' },
    });

    const verifyButton = await screen.findByRole('button', {
      name: 'login.verify_button',
    });
    await act(async () => {
      fireEvent.click(verifyButton);
    });

    await waitFor(() => {
      expect(mocks.verifyOtpWithInternalApi).toHaveBeenCalled();
    });
    await screen.findByText('account_switcher.redirecting');
    expect(mocks.routerPush).toHaveBeenCalledWith('/');
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('shows redirecting after TOTP MFA succeeds without a returnUrl', async () => {
    mocks.mfaAssuranceLevel.mockResolvedValue({
      data: {
        currentLevel: 'aal1',
        nextLevel: 'aal2',
      },
    });

    const queryClient = renderLoginFormSearch();

    await screen.findByText('login.two_factor_authentication');
    fireEvent.change(await screen.findByLabelText('otp-input'), {
      target: { value: '123456' },
    });

    const verifyButton = await screen.findByRole('button', {
      name: 'login.verify_button',
    });
    await act(async () => {
      fireEvent.click(verifyButton);
    });

    await waitFor(() => {
      expect(mocks.mfaVerify).toHaveBeenCalled();
    });
    await screen.findByText('account_switcher.redirecting');
    expect(mocks.routerPush).toHaveBeenCalledWith('/');
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('hard redirects after TOTP MFA succeeds for platform verify-token returnUrls', async () => {
    mocks.mfaAssuranceLevel.mockResolvedValue({
      data: {
        currentLevel: 'aal1',
        nextLevel: 'aal2',
      },
    });

    const queryClient = renderLoginForm(platformVerifyTokenReturnUrl);

    await screen.findByText('login.two_factor_authentication');
    fireEvent.change(await screen.findByLabelText('otp-input'), {
      target: { value: '123456' },
    });

    const verifyButton = await screen.findByRole('button', {
      name: 'login.verify_button',
    });
    await act(async () => {
      fireEvent.click(verifyButton);
    });

    await waitFor(() => {
      expect(mocks.mfaVerify).toHaveBeenCalled();
    });
    await screen.findByText('account_switcher.redirecting');
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/');
    });
    expect(mocks.routerPush).not.toHaveBeenCalledWith(
      '/verify-token?nextUrl=%2F'
    );
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('shows redirecting after mobile MFA approval succeeds without a returnUrl', async () => {
    mocks.mfaAssuranceLevel.mockResolvedValue({
      data: {
        currentLevel: 'aal1',
        nextLevel: 'aal2',
      },
    });
    mocks.pollMfaMobileApprovalChallengeWithInternalApi.mockResolvedValue({
      mobileMfaVerified: true,
      status: 'approved',
    });

    const queryClient = renderLoginFormSearch();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'login.mobile_mfa_button',
      })
    );

    await waitFor(() => {
      expect(
        mocks.createMfaMobileApprovalChallengeWithInternalApi
      ).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(
        mocks.pollMfaMobileApprovalChallengeWithInternalApi
      ).toHaveBeenCalled();
    });
    await screen.findByText('account_switcher.redirecting');
    expect(mocks.routerPush).toHaveBeenCalledWith('/');
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
    ).not.toBeInTheDocument();
    queryClient.clear();
  });

  it('hard redirects after mobile MFA approval for platform verify-token returnUrls', async () => {
    mocks.mfaAssuranceLevel.mockResolvedValue({
      data: {
        currentLevel: 'aal1',
        nextLevel: 'aal2',
      },
    });
    mocks.pollMfaMobileApprovalChallengeWithInternalApi.mockResolvedValue({
      mobileMfaVerified: true,
      status: 'approved',
    });

    const queryClient = renderLoginForm(platformVerifyTokenReturnUrl);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'login.mobile_mfa_button',
      })
    );

    await waitFor(() => {
      expect(
        mocks.createMfaMobileApprovalChallengeWithInternalApi
      ).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(
        mocks.pollMfaMobileApprovalChallengeWithInternalApi
      ).toHaveBeenCalled();
    });
    await screen.findByText('account_switcher.redirecting');
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/');
    });
    expect(mocks.routerPush).not.toHaveBeenCalledWith(
      '/verify-token?nextUrl=%2F'
    );
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
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

  it('redirects authenticated managed wildcard returns without account confirmation', async () => {
    const managedReturnUrl =
      'https://vc.tuturuuu.com/verify-token?nextUrl=%2Fworkspace%2Fpersonal%2Fplans';
    const directManagedReturnUrl =
      'https://vc.tuturuuu.com/workspace/personal/plans';
    mocks.resolveCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      appName: 'vc.tuturuuu.com',
      targetApp: 'managed-tuturuuu',
    });
    mocks.createCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      returnUrl: directManagedReturnUrl,
      targetApp: 'managed-tuturuuu',
    });

    const queryClient = renderLoginForm(managedReturnUrl);

    await waitFor(() => {
      expect(mocks.createCrossAppReturnUrlWithInternalApi).toHaveBeenCalledWith(
        {
          returnUrl: managedReturnUrl,
        }
      );
    });

    expect(mocks.resolveCrossAppReturnUrlWithInternalApi).toHaveBeenCalledWith({
      returnUrl: managedReturnUrl,
    });
    expect(mocks.refreshSession).toHaveBeenCalled();
    expect(mocks.assign).toHaveBeenCalledWith(directManagedReturnUrl);
    expect(
      screen.queryByText('login.confirm_internal_app_account_title')
    ).not.toBeInTheDocument();
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
      expect(
        screen.queryByText('account_switcher.redirecting')
      ).not.toBeInTheDocument();
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
