import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PasskeyLoginButton } from './passkey-login-button';

const { mockSignInWithPasskey, mockToastError } = vi.hoisted(() => ({
  mockSignInWithPasskey: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-browser', () => ({
  createAuthClient: () => ({
    auth: {
      signInWithPasskey: mockSignInWithPasskey,
    },
  }),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

vi.mock('@tuturuuu/icons', () => ({
  Fingerprint: () => <span data-testid="passkey-icon" />,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const translations: Record<string, string> = {
      continue_with_passkey: 'Continue with passkey',
      diagnostic_reference: `Reference: ${values?.code}`,
      passkey_failed: 'Passkey sign-in failed',
      passkey_try_again: 'Please try again.',
    };

    return translations[key] ?? key;
  },
}));

describe('PasskeyLoginButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPasskey.mockResolvedValue({ data: { session: {} } });
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: {
        get: vi.fn(),
      },
    });
  });

  it('starts passkey sign-in and completes the primary login flow', async () => {
    const onAuthenticated = vi.fn().mockResolvedValue(undefined);

    render(<PasskeyLoginButton onAuthenticated={onAuthenticated} />);

    fireEvent.click(
      screen.getByRole('button', { name: /continue with passkey/i })
    );

    await waitFor(() => {
      expect(mockSignInWithPasskey).toHaveBeenCalledTimes(1);
      expect(mockSignInWithPasskey).toHaveBeenCalledWith();
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('passes a captcha token to passkey sign-in when Turnstile is required', async () => {
    const onAuthenticated = vi.fn().mockResolvedValue(undefined);

    render(
      <PasskeyLoginButton
        captchaToken="captcha-token"
        canRenderTurnstile
        onAuthenticated={onAuthenticated}
        requiresTurnstile
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /continue with passkey/i })
    );

    await waitFor(() => {
      expect(mockSignInWithPasskey).toHaveBeenCalledWith({
        options: {
          captchaToken: 'captcha-token',
        },
      });
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('passes a supplied captcha token even when Turnstile is optional', async () => {
    const onAuthenticated = vi.fn().mockResolvedValue(undefined);

    render(
      <PasskeyLoginButton
        captchaToken="captcha-token"
        onAuthenticated={onAuthenticated}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /continue with passkey/i })
    );

    await waitFor(() => {
      expect(mockSignInWithPasskey).toHaveBeenCalledWith({
        options: {
          captchaToken: 'captcha-token',
        },
      });
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  it('disables passkey sign-in when required Turnstile verification is missing', () => {
    const onAuthenticated = vi.fn();

    render(
      <PasskeyLoginButton
        canRenderTurnstile
        onAuthenticated={onAuthenticated}
        requiresTurnstile
      />
    );

    expect(
      screen.getByRole('button', { name: /continue with passkey/i })
    ).toBeDisabled();
  });

  it('surfaces the Turnstile error that blocks passkey sign-in', () => {
    const onAuthenticated = vi.fn();

    render(
      <PasskeyLoginButton
        canRenderTurnstile
        onAuthenticated={onAuthenticated}
        requiresTurnstile
        turnstileError="Security verification is not authorized for this hostname."
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /continue with passkey/i })
    );

    expect(
      screen.getByText(
        'Security verification is not authorized for this hostname.'
      )
    ).toBeInTheDocument();
    expect(mockSignInWithPasskey).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('resets Turnstile after a passkey sign-in error', async () => {
    const onAuthenticated = vi.fn();
    const onCaptchaReset = vi.fn();
    mockSignInWithPasskey.mockResolvedValue({
      data: null,
      error: { message: 'captcha protection: request disallowed' },
    });

    render(
      <PasskeyLoginButton
        captchaToken="captcha-token"
        canRenderTurnstile
        onAuthenticated={onAuthenticated}
        onCaptchaReset={onCaptchaReset}
        requiresTurnstile
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /continue with passkey/i })
    );

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Passkey sign-in failed', {
        description: expect.stringMatching(
          /^Please try again\. Reference: AUTH-PASSKEY-[A-F0-9]{6}$/
        ),
      });
      expect(onCaptchaReset).toHaveBeenCalledTimes(1);
      expect(onAuthenticated).not.toHaveBeenCalled();
    });
  });

  it('shows a localized error when passkey sign-in fails', async () => {
    const onAuthenticated = vi.fn();
    mockSignInWithPasskey.mockResolvedValue({
      data: null,
      error: { message: 'Browser does not support WebAuthn' },
    });

    render(<PasskeyLoginButton onAuthenticated={onAuthenticated} />);

    fireEvent.click(
      screen.getByRole('button', { name: /continue with passkey/i })
    );

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Passkey sign-in failed', {
        description: expect.stringMatching(
          /^Please try again\. Reference: AUTH-PASSKEY-[A-F0-9]{6}$/
        ),
      });
      expect(onAuthenticated).not.toHaveBeenCalled();
    });
  });

  it('fails fast when the browser does not support passkeys', () => {
    const onAuthenticated = vi.fn();
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: undefined,
    });

    render(<PasskeyLoginButton onAuthenticated={onAuthenticated} />);

    fireEvent.click(
      screen.getByRole('button', { name: /continue with passkey/i })
    );

    expect(mockToastError).toHaveBeenCalledWith('Passkey sign-in failed', {
      description: expect.stringMatching(
        /^Please try again\. Reference: AUTH-PASSKEY-[A-F0-9]{6}$/
      ),
    });
    expect(mockSignInWithPasskey).not.toHaveBeenCalled();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
