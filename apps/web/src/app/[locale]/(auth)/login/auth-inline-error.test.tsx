// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthInlineError } from './auth-inline-error';
import {
  authToast,
  extractDiagnosticReference,
} from './auth-inline-error-store';

const toastError = vi.hoisted(() => vi.fn());

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: toastError, success: vi.fn(), warning: vi.fn() },
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    key === 'diagnostic_reference' ? `Reference: ${values?.code}` : key,
}));

const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText } });
});

describe('AuthInlineError', () => {
  it('repeats an error toast inline with a copyable reference', async () => {
    render(<AuthInlineError busy={false} />);
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => {
      authToast.error('Sign-in failed', {
        description: 'Try again. Reference: AUTH-OTP-SEND-1A2B3C',
      });
    });

    // The toast itself is unchanged.
    expect(toastError).toHaveBeenCalledWith('Sign-in failed', {
      description: 'Try again. Reference: AUTH-OTP-SEND-1A2B3C',
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Sign-in failed');
    expect(alert).toHaveTextContent('Try again.');
    expect(alert).toHaveTextContent('Reference: AUTH-OTP-SEND-1A2B3C');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'copy_reference' }));
    });
    expect(writeText).toHaveBeenCalledWith('AUTH-OTP-SEND-1A2B3C');
    expect(
      screen.getByRole('button', { name: 'reference_copied' })
    ).toBeInTheDocument();
  });

  it('hides the error once a new attempt starts and ignores older errors', () => {
    act(() => {
      authToast.error('Before mount');
    });
    const { rerender } = render(<AuthInlineError busy={false} />);
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => {
      authToast.error('Failed');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');

    rerender(<AuthInlineError busy />);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<AuthInlineError busy={false} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('extracts client and server diagnostic codes only', () => {
    expect(extractDiagnosticReference('x AUTH-PASSKEY-00FFAA y')).toBe(
      'AUTH-PASSKEY-00FFAA'
    );
    expect(
      extractDiagnosticReference('Reference: AUTH-ACC-LOGOUT-ALL-ABCDEF')
    ).toBe('AUTH-ACC-LOGOUT-ALL-ABCDEF');
    expect(extractDiagnosticReference('no code here')).toBeUndefined();
  });
});
