import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mocks,
  queryClients,
  renderLoginFormSearch,
} from './login-form-test-support';

async function identify(email: string) {
  const input = await screen.findByPlaceholderText(
    'login.email_username_placeholder'
  );
  fireEvent.change(input, { target: { value: email } });
  const button = screen.getByRole('button', {
    name: 'login.continue_with_email',
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

async function back() {
  fireEvent.click(screen.getByRole('button', { name: 'common.back' }));
  await screen.findByPlaceholderText('login.email_username_placeholder');
}

function expectPassword() {
  return screen.findByPlaceholderText('login.password_placeholder');
}

function expectOtp() {
  return screen.findByRole('textbox', { name: 'otp-input' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  mocks.currentUserProfile = null;
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.getClaims.mockResolvedValue({ data: { claims: null }, error: null });
  mocks.getOtpSettings.mockResolvedValue({ otpEnabled: true });
  mocks.mfaAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
  });
  mocks.sendOtpWithInternalApi.mockResolvedValue({});
});

afterEach(() => {
  for (const client of queryClients) client.clear();
  queryClients.clear();
  vi.unstubAllEnvs();
});

describe('LoginForm email method defaults', () => {
  it.each([
    'person@tuturuuu.com',
    'person@tutur3u.com',
    ' Person@TUTUR3U.COM ',
    ' Person@TUTURUUU.COM ',
  ])('prefers password for %s without requesting a code', async (email) => {
    renderLoginFormSearch();
    await identify(email);
    await expectPassword();
    expect(mocks.sendOtpWithInternalApi).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'login.use_code_instead' })
    ).toBeEnabled();
    await back();
    expect(
      screen.getByRole('button', { name: 'continue_with_passkey' })
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /google/i })).toBeEnabled();
  });

  it.each([
    'person@example.com',
    'person@sub.tuturuuu.com',
    'person@tuturuuu.com.evil.test',
    'person@tutur3u.com.evil.test',
    'person@tutur3uu.com',
  ])('keeps the supported external default for %s', async (email) => {
    renderLoginFormSearch();
    await identify(email);
    await expectOtp();
    expect(mocks.sendOtpWithInternalApi).toHaveBeenCalledWith(
      expect.objectContaining({ email })
    );
    expect(
      screen.getByRole('button', { name: 'login.use_password_instead' })
    ).toBeEnabled();
  });

  it('recomputes defaults after editing the email and returning to either internal domain', async () => {
    renderLoginFormSearch();
    for (const email of [
      'person@tuturuuu.com',
      'person@example.com',
      'person@tutur3u.com',
      'person@example.com',
      'person@tuturuuu.com',
    ]) {
      await identify(email);
      if (email.endsWith('@example.com')) await expectOtp();
      else await expectPassword();
      await back();
    }
    expect(mocks.sendOtpWithInternalApi).toHaveBeenCalledTimes(2);
  });

  it.each(['tuturuuu.com', 'tutur3u.com'])(
    'retains an explicit code choice for %s through retry, back and email switches',
    async (domain) => {
      renderLoginFormSearch();
      await identify(`person@${domain}`);
      await expectPassword();
      mocks.sendOtpWithInternalApi.mockResolvedValueOnce({
        error: 'Try again',
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'login.use_code_instead' })
      );
      await expectOtp();
      expect(
        screen.queryByPlaceholderText('login.password_placeholder')
      ).not.toBeInTheDocument();
      const resend = screen.getByRole('button', { name: 'login.resend' });
      await waitFor(() => expect(resend).toBeEnabled());
      fireEvent.click(resend);
      await waitFor(() =>
        expect(mocks.sendOtpWithInternalApi).toHaveBeenCalledTimes(2)
      );
      expect(mocks.sendOtpWithInternalApi).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ email: `person@${domain}` })
      );
      await expectOtp();
      await back();
      await identify('another@tuturuuu.com');
      await expectPassword();
      await back();
      await identify(` PERSON@${domain.toUpperCase()} `);
      await expectOtp();
      expect(mocks.sendOtpWithInternalApi).toHaveBeenCalledTimes(3);
    }
  );

  it('retains an external account password choice after a failed sign-in and back navigation', async () => {
    renderLoginFormSearch();
    await identify('person@example.com');
    await expectOtp();
    fireEvent.click(
      screen.getByRole('button', { name: 'login.use_password_instead' })
    );
    const password = await expectPassword();
    mocks.passwordLoginWithInternalApi.mockResolvedValue({
      error: 'Invalid credentials',
      retryAfter: 30,
    });
    fireEvent.change(password, { target: { value: 'synthetic-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.sign_in' }));
    await waitFor(() =>
      expect(mocks.passwordLoginWithInternalApi).toHaveBeenCalledTimes(1)
    );
    expect(
      screen.getByPlaceholderText('login.password_placeholder')
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'common.back' })).toBeEnabled()
    );
    await back();
    await identify('person@tutur3u.com');
    await expectPassword();
    await back();
    await identify(' PERSON@EXAMPLE.COM ');
    await expectPassword();
    expect(mocks.sendOtpWithInternalApi).toHaveBeenCalledTimes(1);
  });

  it('stays on code after a non-rate-limit send failure and retry', async () => {
    mocks.sendOtpWithInternalApi.mockResolvedValueOnce({
      error: 'Temporary failure',
    });
    renderLoginFormSearch();
    await identify('person@example.com');
    await expectOtp();
    fireEvent.click(screen.getByRole('button', { name: 'login.resend' }));
    await waitFor(() =>
      expect(mocks.sendOtpWithInternalApi).toHaveBeenCalledTimes(2)
    );
    await expectOtp();
  });

  it('respects disabled OTP even for an external account', async () => {
    mocks.getOtpSettings.mockResolvedValue({ otpEnabled: false });
    renderLoginFormSearch();
    await identify('person@example.com');
    await expectPassword();
    expect(
      screen.queryByRole('button', { name: 'login.use_code_instead' })
    ).not.toBeInTheDocument();
    expect(mocks.sendOtpWithInternalApi).not.toHaveBeenCalled();
  });
  it('keeps CAPTCHA required for password submission against a remote auth backend', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
    renderLoginFormSearch();
    await identify('person@tutur3u.com');
    const password = await expectPassword();
    fireEvent.change(password, { target: { value: 'synthetic-password' } });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'login.sign_in' })
      ).toBeDisabled()
    );
    expect(
      screen.getByText('login.captcha_not_configured')
    ).toBeInTheDocument();
    expect(mocks.passwordLoginWithInternalApi).not.toHaveBeenCalled();
  });
});
