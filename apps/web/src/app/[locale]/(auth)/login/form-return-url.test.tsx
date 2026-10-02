import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockPrimarySignInSession,
  mocks,
  queryClients,
  renderLoginForm,
  renderLoginFormSearch,
} from './login-form-test-support';

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
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1' } },
      error: null,
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
    for (const queryClient of queryClients) queryClient.clear();
    queryClients.clear();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('keeps a single-slash returnUrl inside the web app', async () => {
    renderLoginForm('/workspace?tab=1');

    await waitFor(() => {
      expect(mocks.routerPush).toHaveBeenCalledWith('/workspace?tab=1');
    });

    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('does not expose authenticated QR handoff on the public login form', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    renderLoginForm('/');

    await screen.findByRole('button', {
      name: 'login.continue_with_email',
    });

    expect(
      screen.queryByRole('button', { name: 'login.qr_title' })
    ).not.toBeInTheDocument();
  });

  it('renders the public auth controls while Supabase user bootstrap is pending', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockReturnValue(new Promise(() => undefined));

    renderLoginForm('/');

    await screen.findByRole('button', {
      name: 'login.continue_with_email',
    });
    expect(
      screen.getByPlaceholderText('login.email_username_placeholder')
    ).toBeEnabled();
  });

  it('fails open to social login when deferred internal app bootstrap stalls', async () => {
    vi.useFakeTimers();
    mocks.currentUserProfile = null;
    mocks.getUser.mockReturnValue(new Promise(() => undefined));
    renderLoginForm(
      'https://contacts.tuturuuu.com/verify-token?nextUrl=%2Fpersonal',
      { deferAuthSurfaceUntilSessionCheck: true }
    );

    expect(screen.queryByText('login.continue_with_google')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByText('login.continue_with_google')).toBeVisible();
  });

  it('shows redirecting instead of the public form for authenticated login hard loads', async () => {
    renderLoginFormSearch();

    await screen.findByText('account_switcher.redirecting');

    expect(mocks.routerPush).toHaveBeenCalledWith('/');
    expect(
      screen.queryByRole('button', {
        name: 'login.continue_with_email',
      })
    ).not.toBeInTheDocument();
  });

  it('hard redirects authenticated bootstrap for platform verify-token returnUrls', async () => {
    renderLoginForm(platformVerifyTokenReturnUrl);

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
  });

  it('falls back for platform verify-token nextUrl values with control characters', async () => {
    renderLoginForm(
      'http://tuturuuu.com/verify-token?nextUrl=%2F%09%2Fevil.test%2Fphish'
    );

    await screen.findByText('account_switcher.redirecting');

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/onboarding');
    });
    expect(mocks.replace).not.toHaveBeenCalledWith('//evil.test/phish');
    expect(mocks.assign).not.toHaveBeenCalled();
  });

  it('hard redirects authenticated bootstrap for local Portless platform verify-token returnUrls', async () => {
    renderLoginForm(localPortlessPlatformVerifyTokenReturnUrl);

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

    renderLoginForm('/', {
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
  });

  it('uses the managed platform callback while preserving a managed subdomain returnUrl for social OAuth', async () => {
    vi.stubEnv('WEB_APP_URL', 'https://tuturuuu.com');
    mocks.currentUserProfile = null;
    mocks.getUser.mockReturnValue(new Promise(() => undefined));

    renderLoginFormSearch('?nextUrl=%2Fworkspace%2Fpersonal%2Fplans', {
      origin: 'https://vc.tuturuuu.com',
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
            redirectTo:
              'https://vc.tuturuuu.com/api/auth/callback?returnUrl=https%3A%2F%2Fvc.tuturuuu.com%2Fworkspace%2Fpersonal%2Fplans&nextUrl=%2Fworkspace%2Fpersonal%2Fplans',
          }),
          provider: 'google',
        })
      );
    });
  });

  it('offers Microsoft OAuth on the login form', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockReturnValue(new Promise(() => undefined));

    renderLoginFormSearch('');

    expect(
      await screen.findByRole('button', {
        name: /login\.continue_with_microsoft/u,
      })
    ).toBeInTheDocument();
  });

  // `?provider=azure` is how another app hands a Microsoft sign-in over to us,
  // so the deep link has to start the flow rather than land on a bare form.
  it('starts Microsoft OAuth from a provider deep link', async () => {
    mocks.currentUserProfile = null;
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    renderLoginFormSearch('?provider=azure');

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ scopes: 'email' }),
          provider: 'azure',
        })
      );
    });
  });

  it('navigates home after password login without a returnUrl', async () => {
    mocks.currentUserProfile = null;
    mockPrimarySignInSession('password');

    renderLoginFormSearch();

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
  });

  it('hard redirects password sign-in for platform verify-token returnUrls', async () => {
    mocks.currentUserProfile = null;
    mockPrimarySignInSession('password');

    renderLoginForm(platformVerifyTokenReturnUrl);

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
  });

  it('shows redirecting after OTP login succeeds without a returnUrl', async () => {
    mocks.currentUserProfile = null;
    mockPrimarySignInSession('otp');

    renderLoginFormSearch();
    fireEvent.change(
      await screen.findByPlaceholderText('login.email_username_placeholder'),
      {
        target: { value: 'person@example.com' },
      }
    );

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
  });

  it('shows redirecting after TOTP MFA succeeds without a returnUrl', async () => {
    mocks.mfaAssuranceLevel.mockResolvedValue({
      data: {
        currentLevel: 'aal1',
        nextLevel: 'aal2',
      },
    });

    renderLoginFormSearch();

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
  });

  it('hard redirects after TOTP MFA succeeds for platform verify-token returnUrls', async () => {
    mocks.mfaAssuranceLevel.mockResolvedValue({
      data: {
        currentLevel: 'aal1',
        nextLevel: 'aal2',
      },
    });

    renderLoginForm(platformVerifyTokenReturnUrl);

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

    renderLoginFormSearch();

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

    renderLoginForm(platformVerifyTokenReturnUrl);

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
  });

  it('rejects a protocol-relative returnUrl instead of assigning external navigation', async () => {
    renderLoginForm('//evil.test/phish');

    await screen.findByText('login.invalid_return_url_title');

    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalledWith(
      expect.stringContaining('evil.test')
    );
  });

  it('rejects a backslash-prefixed returnUrl instead of normalizing it as local', async () => {
    renderLoginForm('/\\evil.test/phish');

    await screen.findByText('login.invalid_return_url_title');

    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.routerPush).not.toHaveBeenCalledWith(
      expect.stringContaining('evil.test')
    );
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

    renderLoginForm(chatReturnUrl);

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
  });

  it('redirects authenticated managed wildcard returns without account confirmation', async () => {
    const managedReturnUrl =
      'https://vc.tuturuuu.com/verify-token?nextUrl=%2Fworkspace%2Fpersonal%2Fplans';
    const directManagedReturnUrl =
      'https://vc.tuturuuu.com/workspace/personal/plans';

    renderLoginForm(managedReturnUrl);

    await waitFor(() => {
      expect(mocks.assign).toHaveBeenCalledWith(directManagedReturnUrl);
    });

    expect(
      mocks.resolveCrossAppReturnUrlWithInternalApi
    ).not.toHaveBeenCalled();
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
    expect(mocks.refreshSession).toHaveBeenCalled();
    expect(
      screen.queryByText('login.confirm_internal_app_account_title')
    ).not.toBeInTheDocument();
  });

  it('treats unregistered Tuturuuu subdomains as verified managed return URLs', async () => {
    renderLoginForm('https://vercel.tuturuuu.com');

    await waitFor(() => {
      expect(mocks.assign).toHaveBeenCalledWith('https://vercel.tuturuuu.com/');
    });

    expect(
      mocks.resolveCrossAppReturnUrlWithInternalApi
    ).not.toHaveBeenCalled();
    expect(mocks.createCrossAppReturnUrlWithInternalApi).not.toHaveBeenCalled();
    expect(mocks.refreshSession).toHaveBeenCalled();
    expect(
      screen.queryByText('login.invalid_return_url_title')
    ).not.toBeInTheDocument();
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

      renderLoginForm('https://partner.example/launch');

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
