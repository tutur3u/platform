// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mocks,
  openEmailStep,
  queryClients,
  renderLoginFormSearch,
} from './login-form-test-support';
import { formatCountdown } from './otp-step';

async function identify(email: string) {
  await openEmailStep();
  fireEvent.change(
    await screen.findByPlaceholderText('login.email_username_placeholder'),
    { target: { value: email } }
  );
  const button = screen.getByRole('button', {
    name: 'login.continue_with_email',
  });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
}

async function openPasswordStep() {
  await identify('person@tutur3u.com');
  return screen.findByPlaceholderText('login.password_placeholder');
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

describe('Sorbet code and password steps', () => {
  it('shows a failed code inside the code card with role=alert and a copyable reference', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    mocks.verifyOtpWithInternalApi.mockResolvedValue({
      error: 'Code expired AUTH-OTP-1A2B3C',
    });
    renderLoginFormSearch();
    await identify('person@example.com');
    const card = await screen.findByTestId('otp-step');
    expect(within(card).getByText('person@example.com')).toBeInTheDocument();
    expect(
      within(card).getByTestId('auth-illustration-email')
    ).toBeInTheDocument();

    fireEvent.change(await within(card).findByLabelText('otp-input'), {
      target: { value: '123456' },
    });
    fireEvent.click(
      within(card).getByRole('button', { name: 'login.verify_button' })
    );

    const alert = await within(card).findByRole('alert');
    expect(alert).toHaveTextContent('login.failed_to_verify');
    fireEvent.click(
      within(alert).getByRole('button', { name: 'copy_reference' })
    );
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('AUTH-OTP-1A2B3C')
    );
  });

  it('shows the OTP cooldown as a countdown and a yellow alert with the OAuth suggestion', async () => {
    mocks.sendOtpWithInternalApi.mockResolvedValue({
      error: 'Too many requests',
      retryAfter: 42,
    });
    renderLoginFormSearch();
    await identify('person@example.com');
    const card = await screen.findByTestId('otp-step');

    expect(within(card).getByRole('timer')).toHaveTextContent(
      'login.resend_countdown'
    );
    expect(
      within(card).queryByRole('button', { name: 'login.resend' })
    ).not.toBeInTheDocument();
    const alert = within(card)
      .getAllByRole('alert')
      .find((node) => node.textContent?.includes('login.rate_limited_title'));
    expect(alert).toHaveTextContent('login.rate_limited_social_auth_hint');
    expect(alert).toHaveTextContent('login.otp_rate_limited_inline');
    expect(formatCountdown(42)).toBe('0:42');
    expect(formatCountdown(61)).toBe('1:01');
  });

  it('shows a failed password inside the password card, with the rate-limit alert', async () => {
    mocks.passwordLoginWithInternalApi.mockResolvedValue({
      error: 'Invalid credentials',
      retryAfter: 30,
    });
    renderLoginFormSearch();
    const password = await openPasswordStep();
    const card = screen.getByTestId('password-step');
    fireEvent.change(password, { target: { value: 'synthetic-password' } });
    fireEvent.click(
      within(card).getByRole('button', { name: 'login.sign_in' })
    );

    await waitFor(() =>
      expect(
        within(card)
          .getAllByRole('alert')
          .map((node) => node.textContent)
          .join(' ')
      ).toContain('login.failed')
    );
    expect(card).toHaveTextContent('login.rate_limited_title');
  });

  it('toggles the password visibility with a labelled, pressed-state button', async () => {
    renderLoginFormSearch();
    const password = await openPasswordStep();
    const toggle = screen.getByRole('button', { name: 'login.show_password' });

    expect(password).toHaveAttribute('type', 'password');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(password).toHaveAttribute('type', 'text');
    expect(
      screen.getByRole('button', { name: 'login.hide_password' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'login.other_sign_in_methods' })
    ).toBeInTheDocument();
  });
});
