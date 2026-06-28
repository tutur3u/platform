import { render, screen } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './page';

const mocks = vi.hoisted(() => ({
  getLocalE2ESupabaseBrowserConfig: vi.fn(),
  isLocalE2EAuthBypassEnabled: vi.fn(),
  cookieHeader: '',
  loginFormProps: [] as Array<{
    deferAuthSurfaceUntilSessionCheck?: boolean;
    localE2EAuthBypass?: boolean;
    runtimeSupabaseConfig?: {
      supabasePublishableKey: string;
      supabaseUrl: string;
    } | null;
  }>,
  redirect: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
}));
const redirectMock = mocks.redirect;

vi.mock('@tuturuuu/ui/custom/tuturuuu-logo', () => ({
  TUTURUUU_LOCAL_LOGO_URL: '/media/logos/tuturuuu.png',
}));

vi.mock('@tuturuuu/utils/portless', () => ({
  TUTURUUU_PORTLESS_APP_HOSTS: {
    chat: 'chat.tuturuuu.localhost',
    learn: 'learn.tuturuuu.localhost',
  },
  getTuturuuuPortlessAppOrigin: (name: string) =>
    `https://${name}.tuturuuu.localhost`,
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(() => ({})),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name: string) =>
      name.toLowerCase() === 'cookie' ? mocks.cookieHeader : null,
  })),
}));

vi.mock('@/constants/common', () => ({
  BASE_URL: 'https://tuturuuu.com',
  DEV_MODE: false,
}));

vi.mock('@/lib/auth/local-e2e', () => ({
  getLocalE2ESupabaseBrowserConfig: () =>
    mocks.getLocalE2ESupabaseBrowserConfig(),
  isLocalE2EAuthBypassEnabled: () => mocks.isLocalE2EAuthBypassEnabled(),
}));

vi.mock('./form', () => ({
  default: (props: {
    deferAuthSurfaceUntilSessionCheck?: boolean;
    localE2EAuthBypass?: boolean;
    runtimeSupabaseConfig?: {
      supabasePublishableKey: string;
      supabaseUrl: string;
    } | null;
  }) => {
    mocks.loginFormProps.push(props);

    return (
      <div
        data-defer-auth-surface={String(
          props.deferAuthSurfaceUntilSessionCheck ?? false
        )}
        data-local-e2e-auth-bypass={String(props.localE2EAuthBypass ?? false)}
        data-runtime-supabase-url={props.runtimeSupabaseConfig?.supabaseUrl}
        data-testid="login-form"
      />
    );
  },
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loginFormProps = [];
    mocks.cookieHeader = '';
    mocks.getLocalE2ESupabaseBrowserConfig.mockReturnValue(null);
    mocks.isLocalE2EAuthBypassEnabled.mockReturnValue(false);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });
  });

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
    expect(mocks.resolveAuthenticatedSessionUser).not.toHaveBeenCalled();
  });

  it('threads the runtime local E2E auth bypass into the login form', async () => {
    const runtimeSupabaseConfig = {
      supabasePublishableKey: 'local-publishable-key',
      supabaseUrl: 'http://127.0.0.1:8001',
    };

    mocks.isLocalE2EAuthBypassEnabled.mockReturnValue(true);
    mocks.getLocalE2ESupabaseBrowserConfig.mockReturnValue(
      runtimeSupabaseConfig
    );

    await renderLoginPage();

    expect(screen.getByTestId('login-form')).toHaveAttribute(
      'data-local-e2e-auth-bypass',
      'true'
    );
    expect(screen.getByTestId('login-form')).toHaveAttribute(
      'data-runtime-supabase-url',
      'http://127.0.0.1:8001'
    );
    expect(mocks.loginFormProps).toContainEqual({
      deferAuthSurfaceUntilSessionCheck: false,
      localE2EAuthBypass: true,
      runtimeSupabaseConfig,
    });
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

  it('redirects authenticated hard loads away from plain login', async () => {
    mocks.cookieHeader = 'sb-test-auth-token=session';
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });
    redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      Login({
        searchParams: Promise.resolve({}),
      })
    ).rejects.toThrow('redirect:/');
  });

  it('redirects authenticated hard loads to safe local returnUrls', async () => {
    mocks.cookieHeader = 'sb-test-auth-token=session';
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });
    redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(
      Login({
        searchParams: Promise.resolve({
          returnUrl: '/en/personal/tasks?view=board',
        }),
      })
    ).rejects.toThrow('redirect:/en/personal/tasks?view=board');
  });

  it('keeps authenticated external returnUrls on the confirmation flow', async () => {
    mocks.cookieHeader = 'sb-test-auth-token=session';
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });

    await renderLoginPage({
      returnUrl: 'https://learn.tuturuuu.com/courses',
    });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText('Learn')).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toHaveAttribute(
      'data-defer-auth-surface',
      'true'
    );
    expect(mocks.loginFormProps.at(-1)).toMatchObject({
      deferAuthSurfaceUntilSessionCheck: true,
    });
  });

  it('does not defer the login form for unauthenticated external returnUrls', async () => {
    await renderLoginPage({
      returnUrl: 'https://partner.example/launch',
    });

    expect(screen.getByTestId('login-form')).toHaveAttribute(
      'data-defer-auth-surface',
      'false'
    );
    expect(mocks.loginFormProps.at(-1)).toMatchObject({
      deferAuthSurfaceUntilSessionCheck: false,
    });
  });

  it('does not redirect authenticated multi-account hard loads', async () => {
    mocks.cookieHeader = 'sb-test-auth-token=session';
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });

    await renderLoginPage({
      multiAccount: 'true',
      returnUrl: '/en/personal/tasks',
    });

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });
});
