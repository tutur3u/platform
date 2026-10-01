import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mocks,
  queryClients,
  renderLoginForm,
} from './login-form-test-support';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUserProfile = null;
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });
  mocks.getOtpSettings.mockResolvedValue({ otpEnabled: true });
  mocks.mfaAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
  });
  mocks.signOut?.mockResolvedValue({ error: null });
  mocks.resolveCrossAppReturnUrlWithInternalApi.mockResolvedValue({
    error: 'Invalid returnUrl',
  });
});

afterEach(() => {
  for (const client of queryClients) client.clear();
  queryClients.clear();
  vi.unstubAllEnvs();
});

describe('LoginForm supported recovery actions', () => {
  it('clears an invalid return URL through router.replace and refresh', async () => {
    mocks.routerReplace.mockImplementationOnce((path: string) => {
      mocks.searchParams = new URLSearchParams(
        new URL(path, window.location.href).search
      );
      view.rerender();
    });
    const view = renderLoginForm('//evil.test/phish', {
      origin: 'https://vc.tuturuuu.com',
    });
    await screen.findByRole('heading', {
      name: 'login.invalid_return_url_title',
    });
    expect(
      screen.queryByRole('button', { name: 'login.continue_with_email' })
    ).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'login.clear_invalid_return_url',
      })
    );
    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith('/login')
    );
    expect(mocks.routerRefresh).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    await screen.findByRole('button', { name: 'login.continue_with_email' });
    expect(
      screen.queryByRole('heading', { name: 'login.invalid_return_url_title' })
    ).not.toBeInTheDocument();
    expect(window.location.href).toBe('https://vc.tuturuuu.com/login');
    expect(window.location.origin).toBe('https://vc.tuturuuu.com');
    expect(window.location.search).toBe('');
    expect(mocks.searchParams.toString()).toBe('');
    mocks.signInWithOAuth.mockResolvedValueOnce({ error: null });
    fireEvent.click(
      screen.getByRole('button', { name: /login\.continue_with_google/u })
    );
    await waitFor(() =>
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: expect.objectContaining({
          redirectTo:
            'https://vc.tuturuuu.com/api/auth/callback?returnUrl=https%3A%2F%2Fvc.tuturuuu.com%2F',
        }),
      })
    );
  });

  it('chooses another account using local sign-out and restores the public form', async () => {
    mocks.currentUserProfile = {
      avatar_url: null,
      display_name: 'Synthetic Person',
      email: 'person@example.com',
      full_name: null,
      id: 'user-1',
    };
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'person@example.com' } },
      error: null,
    });
    mocks.getClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1' } },
      error: null,
    });
    vi.stubEnv(
      'NEXT_PUBLIC_TUTURUUU_EXTERNAL_APP_DOMAINS',
      'partner:https://partner.example'
    );
    vi.stubEnv('TUTURUUU_EXTERNAL_APP_DOMAINS', '');
    mocks.resolveCrossAppReturnUrlWithInternalApi.mockResolvedValue({
      appName: 'Synthetic Partner',
      targetApp: 'partner',
    });
    renderLoginForm('https://partner.example/launch');
    await screen.findByText('login.confirm_internal_app_account_title');
    const useAnotherAccount = await screen.findByRole('button', {
      name: 'login.use_another_account',
    });
    await waitFor(() => expect(useAnotherAccount).toBeEnabled());
    fireEvent.click(useAnotherAccount);
    await waitFor(() =>
      expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    );
    await screen.findByRole('button', { name: 'login.continue_with_email' });
    expect(mocks.routerReplace).not.toHaveBeenCalled();
  });
});
