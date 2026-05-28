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
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      continue_with_passkey: 'Continue with passkey',
      passkey_failed: 'Passkey sign-in failed',
    };

    return translations[key] ?? key;
  },
}));

describe('PasskeyLoginButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPasskey.mockResolvedValue({ data: { session: {} } });
  });

  it('starts passkey sign-in and completes the primary login flow', async () => {
    const onAuthenticated = vi.fn().mockResolvedValue(undefined);

    render(<PasskeyLoginButton onAuthenticated={onAuthenticated} />);

    fireEvent.click(
      screen.getByRole('button', { name: /continue with passkey/i })
    );

    await waitFor(() => {
      expect(mockSignInWithPasskey).toHaveBeenCalledTimes(1);
      expect(onAuthenticated).toHaveBeenCalledTimes(1);
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
        description: 'Browser does not support WebAuthn',
      });
      expect(onAuthenticated).not.toHaveBeenCalled();
    });
  });
});
