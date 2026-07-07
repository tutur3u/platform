import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LoginQrCard } from '@/app/[locale]/(auth)/login/login-qr-card';

const mocks = vi.hoisted(() => ({
  createQrLoginChallengeWithInternalApi: vi.fn(),
  pollQrLoginChallengeWithInternalApi: vi.fn(),
  tokenIndex: 0,
  turnstileReset: vi.fn(),
  turnstileTokens: ['qr-token-1', 'qr-token-2'],
}));

vi.mock('@tuturuuu/internal-api/auth', () => ({
  createQrLoginChallengeWithInternalApi: (
    ...args: Parameters<typeof mocks.createQrLoginChallengeWithInternalApi>
  ) => mocks.createQrLoginChallengeWithInternalApi(...args),
  pollQrLoginChallengeWithInternalApi: (
    ...args: Parameters<typeof mocks.pollQrLoginChallengeWithInternalApi>
  ) => mocks.pollQrLoginChallengeWithInternalApi(...args),
}));

vi.mock('@marsidev/react-turnstile', async () => {
  const React = await vi.importActual<typeof import('react')>('react');

  return {
    Turnstile: React.forwardRef(
      (
        props: {
          onSuccess?: (token: string) => void;
          siteKey: string;
        },
        ref
      ) => {
        React.useEffect(() => {
          props.onSuccess?.(mocks.turnstileTokens[mocks.tokenIndex] ?? '');
        }, []);

        React.useImperativeHandle(ref, () => ({
          execute: vi.fn(),
          getResponse: vi.fn(),
          getResponsePromise: vi.fn(),
          isExpired: vi.fn(),
          remove: vi.fn(),
          render: vi.fn(),
          reset: () => {
            mocks.turnstileReset();
            mocks.tokenIndex += 1;
            props.onSuccess?.(mocks.turnstileTokens[mocks.tokenIndex] ?? '');
          },
        }));

        return <div data-testid="turnstile" data-site-key={props.siteKey} />;
      }
    ),
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      'login.captcha_domain_not_authorized':
        'Security verification is not authorized for this hostname.',
      'login.captcha_not_configured':
        'Security verification is not configured.',
      'login.qr_approving': 'Completing sign-in...',
      'login.qr_description': 'Scan this QR from the mobile app.',
      'login.qr_expired': 'This QR code expired.',
      'login.qr_refresh': 'Refresh code',
      'login.qr_scan_hint': 'Waiting for mobile approval',
      'login.qr_title': 'Sign in with mobile QR',
      'login.qr_turnstile_description':
        'Complete the security check before a QR code is generated.',
      'login.qr_turnstile_title': 'Security check required',
      'login.qr_unavailable_description': 'Try refreshing the code.',
      'login.qr_unavailable_title': 'QR sign-in is unavailable',
    };

    return translations[key] ?? key;
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function qrPayload(challengeId: string, secret: string) {
  return `tuturuuu://auth/qr-login?challengeId=${challengeId}&secret=${secret}&origin=https%3A%2F%2Ftuturuuu.com`;
}

describe('LoginQrCard', () => {
  it('gets a fresh Turnstile token before refreshing an expired QR challenge', async () => {
    mocks.tokenIndex = 0;
    mocks.turnstileReset.mockClear();
    mocks.createQrLoginChallengeWithInternalApi.mockReset();
    mocks.pollQrLoginChallengeWithInternalApi.mockReset();

    mocks.createQrLoginChallengeWithInternalApi.mockImplementation(
      async (payload: { captchaToken?: string }) => ({
        challenge: {
          expiresAt: new Date(Date.now() + 120_000).toISOString(),
          id:
            payload.captchaToken === 'qr-token-1'
              ? 'challenge-1'
              : 'challenge-2',
          payload:
            payload.captchaToken === 'qr-token-1'
              ? qrPayload('challenge-1', 'secret-1')
              : qrPayload('challenge-2', 'secret-2'),
          status: 'pending',
        },
        expiresIn: 120,
        success: true,
      })
    );

    mocks.pollQrLoginChallengeWithInternalApi.mockImplementation(
      async (payload: { challengeId: string }) => ({
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        status: payload.challengeId === 'challenge-1' ? 'expired' : 'pending',
        success: payload.challengeId !== 'challenge-1',
      })
    );

    render(
      <LoginQrCard
        canRenderTurnstile
        locale="en"
        onAuthenticated={vi.fn()}
        requiresTurnstile
        turnstileSiteKey="site-key"
      />,
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(mocks.createQrLoginChallengeWithInternalApi).toHaveBeenCalledWith(
        expect.objectContaining({ captchaToken: 'qr-token-1' })
      );
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Refresh code' })
    );

    await waitFor(() => {
      expect(mocks.turnstileReset).toHaveBeenCalledTimes(1);
      expect(mocks.createQrLoginChallengeWithInternalApi).toHaveBeenCalledWith(
        expect.objectContaining({ captchaToken: 'qr-token-2' })
      );
    });
  });
});
