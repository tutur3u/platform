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
    renderLoginForm('//evil.test/phish');
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
