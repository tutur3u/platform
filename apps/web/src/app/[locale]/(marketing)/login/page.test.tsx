import { render, screen } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import Login from './page';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('@tuturuuu/ui/custom/tuturuuu-logo', () => ({
  TUTURUUU_LOCAL_LOGO_URL: '/media/logos/tuturuuu.png',
}));

vi.mock('@tuturuuu/utils/portless', () => ({
  getTuturuuuPortlessAppOrigin: (name: string) =>
    `https://${name}.tuturuuu.localhost`,
}));

vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://tuturuuu.com',
  DEV_MODE: false,
}));

vi.mock('./form', () => ({
  default: () => <div data-testid="login-form" />,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const messages: Record<string, string> = {
      'account_switcher.add_account': 'Add account',
      'account_switcher.add_account_description':
        'Add another account to continue',
      'auth.notice-p1': 'By continuing, you agree to Tuturuuu',
      'auth.notice-p2': 'to receive periodic emails with updates',
      'auth.privacy': 'Privacy Policy',
      'auth.tos': 'Terms of Service',
      'common.and': 'and',
      'login.sign_in_to_your_account': 'Sign in to your account to continue',
      'login.welcome': 'Welcome Back',
    };

    if (key === 'login.powered-by') {
      return `Powered by ${values?.domain ?? ''}`;
    }

    return messages[key] ?? key;
  },
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-src={src} role="img">
      {alt}
    </span>
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: Parameters<typeof redirectMock>) => redirectMock(...args),
}));

vi.mock('framer-motion', () => {
  const createMotionComponent =
    (tag: keyof React.JSX.IntrinsicElements) =>
    ({
      animate: _animate,
      children,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children?: ReactNode;
      initial?: unknown;
      transition?: unknown;
    }) =>
      React.createElement(tag, props, children);

  return {
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) =>
          createMotionComponent(tag as keyof React.JSX.IntrinsicElements),
      }
    ),
  };
});

async function renderLoginPage(
  searchParams: Record<string, string | string[] | undefined> = {}
) {
  const page = await Login({
    searchParams: Promise.resolve(searchParams),
  });

  render(page);
}

describe('Login page', () => {
  it('forwards OAuth callback codes to the auth callback route', async () => {
    redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      Login({
        searchParams: Promise.resolve({
          code: 'callback-code',
          multiAccount: 'true',
          returnUrl: '/en/personal/tasks',
        }),
      })
    ).rejects.toThrow(
      'redirect:/api/auth/callback?code=callback-code&multiAccount=true&returnUrl=%2Fen%2Fpersonal%2Ftasks'
    );
  });

  it('renders the login shell from a direct hard load', async () => {
    await renderLoginPage();

    expect(
      screen.getByRole('heading', { name: 'Welcome Back' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('renders with promised returnUrl search params from a hard load', async () => {
    await renderLoginPage({
      returnUrl:
        'https://tuturuuu.localhost/verify-token?nextUrl=%2Fonboarding',
    });

    expect(
      screen.getByRole('heading', { name: 'Welcome Back' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('renders the partner app header for known returnUrl domains', async () => {
    await renderLoginPage({
      returnUrl: 'https://learn.tuturuuu.com/courses',
    });

    expect(screen.getByText('Learn')).toBeInTheDocument();
    expect(screen.getByText('Powered by Learn')).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('renders the Chat app header for Chat verifier return URLs', async () => {
    await renderLoginPage({
      returnUrl: 'https://chat.tuturuuu.com/verify-token?nextUrl=%2Fpersonal',
    });

    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Powered by Chat')).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });
});
