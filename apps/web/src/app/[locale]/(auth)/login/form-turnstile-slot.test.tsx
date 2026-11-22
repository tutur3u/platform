// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mocks,
  queryClients,
  renderLoginFormSearch,
  openEmailStep,
} from './login-form-test-support';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'fixture-site-key');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.mfaAssuranceLevel.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
  });
});

afterEach(() => {
  for (const client of queryClients) client.clear();
  queryClients.clear();
  vi.unstubAllEnvs();
});

function turnstileSlot() {
  return document.querySelector('[data-turnstile-slot]');
}

describe('LoginForm Turnstile slot', () => {
  it('reserves the Turnstile slot while OTP settings resolve', async () => {
    let resolveOtpSettings: (value: { otpEnabled: boolean }) => void = () => {};
    mocks.getOtpSettings.mockReturnValue(
      new Promise((resolve) => {
        resolveOtpSettings = resolve;
      })
    );

    renderLoginFormSearch('');

    await openEmailStep();

    await waitFor(() => expect(turnstileSlot()).not.toBeNull());
    expect(turnstileSlot()).toHaveAttribute('data-turnstile-state', 'checking');
    expect(screen.getByRole('status')).toHaveTextContent(
      'login.turnstile_checking'
    );
    expect(screen.queryByTestId('turnstile')).not.toBeInTheDocument();

    resolveOtpSettings({ otpEnabled: false });

    await screen.findByTestId('turnstile');
    expect(turnstileSlot()).not.toBeNull();
  });

  it('shows the not-configured notice at once instead of a collapsing slot', async () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    mocks.getOtpSettings.mockReturnValue(new Promise(() => {}));

    renderLoginFormSearch('');

    await openEmailStep();

    const notice = await screen.findByText('login.captcha_not_configured');
    expect(notice).toBeInTheDocument();
    expect(turnstileSlot()).toHaveAttribute(
      'data-turnstile-state',
      'unavailable'
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'login.turnstile_unavailable'
    );
    // The passkey stays blocked without a token, exactly as before.
    expect(
      screen.getByRole('button', { name: 'continue_with_passkey' })
    ).toBeDisabled();
    expect(document.querySelector('.animate-pulse.h-\\[65px\\]')).toBeNull();
  });
});
