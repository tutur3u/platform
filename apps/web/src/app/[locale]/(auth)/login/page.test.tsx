import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginContent } from './login-content';
import Login, * as pageModule from './page';

const mocks = vi.hoisted(() => ({
  getLocalE2ESupabaseBrowserConfig: vi.fn(),
  isLocalE2EAuthBypassEnabled: vi.fn(),
  locationReplace: vi.fn(),
  loginFormProps: [] as Array<{
    deferAuthSurfaceUntilSessionCheck?: boolean;
    localE2EAuthBypass?: boolean;
    runtimeSupabaseConfig?: {
      supabasePublishableKey: string;
      supabaseUrl: string;
    } | null;
  }>,
  searchParams: new URLSearchParams(),
}));

vi.mock('@tuturuuu/ui/custom/tuturuuu-logo', () => ({
  TUTURUUU_LOCAL_LOGO_URL: '/media/logos/tuturuuu.png',
}));

vi.mock('@tuturuuu/utils/portless', () => ({
  TUTURUUU_PORTLESS_APP_HOSTS: {
    chat: 'chat.tuturuuu.localhost',
    inventory: 'inventory.tuturuuu.localhost',
    learn: 'learn.tuturuuu.localhost',
    nova: 'nova.tuturuuu.localhost',
    platform: 'tuturuuu.localhost',
    teach: 'teach.tuturuuu.localhost',
  },
  getTuturuuuPortlessAppOrigin: (name: string) =>
    `https://${name}.tuturuuu.localhost`,
}));

vi.mock('@/constants/env', () => ({
  DEV_MODE: false,
}));

vi.mock('@/lib/auth/local-e2e', () => ({
  getLocalE2ESupabaseBrowserConfig: () =>
    mocks.getLocalE2ESupabaseBrowserConfig(),
  isLocalE2EAuthBypassEnabled: () => mocks.isLocalE2EAuthBypassEnabled(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => mocks.searchParams,
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

function setSearchParams(
  searchParams: Record<string, string | string[] | undefined> = {}
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      params.set(key, value);
    }
  }

  mocks.searchParams = params;
}

async function renderLoginPage(
  searchParams: Record<string, string | string[] | undefined> = {}
) {
  setSearchParams(searchParams);
  render(await Login());

  return screen.findByTestId('login-form');
}

describe('Login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loginFormProps = [];
    mocks.getLocalE2ESupabaseBrowserConfig.mockReturnValue(null);
    mocks.isLocalE2EAuthBypassEnabled.mockReturnValue(false);
    setSearchParams();
  });

  it('does not export cache-incompatible route segment config', () => {
    expect('dynamic' in pageModule).toBe(false);
    expect('revalidate' in pageModule).toBe(false);
  });

  it('renders the cacheable login shell from a direct hard load', async () => {
    await renderLoginPage();

    expect(
      screen.getByRole('heading', { name: 'Welcome Back' })
    ).toBeInTheDocument();
    expect(mocks.loginFormProps).toContainEqual({
      deferAuthSurfaceUntilSessionCheck: false,
      localE2EAuthBypass: false,
      runtimeSupabaseConfig: null,
    });
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
  });

  it('renders the partner app header for known returnUrl domains on the client', async () => {
    await renderLoginPage({
      returnUrl: 'https://learn.tuturuuu.com/courses',
    });

    expect(screen.getByText('Learn')).toBeInTheDocument();
    expect(screen.getByText('Powered by Learn')).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toHaveAttribute(
      'data-defer-auth-surface',
      'true'
    );
  });

  it('renders the Chat app header for Chat verifier return URLs', async () => {
    await renderLoginPage({
      returnUrl: 'https://chat.tuturuuu.com/verify-token?nextUrl=%2Fpersonal',
    });

    expect(screen.getByText('Chat')).toBeInTheDocument();
    expect(screen.getByText('Powered by Chat')).toBeInTheDocument();
  });

  it('renders add-account copy for multi-account login shells', async () => {
    await renderLoginPage({
      multiAccount: 'true',
      returnUrl: '/en/personal/tasks',
    });

    expect(
      screen.getByRole('heading', { name: 'Add account' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('login-form')).toHaveAttribute(
      'data-defer-auth-surface',
      'false'
    );
  });

  it('forwards OAuth callback codes to the auth callback route on the client', async () => {
    setSearchParams({
      code: 'callback-code',
      multiAccount: 'true',
      returnUrl: '/en/personal/tasks',
    });
    render(
      <LoginContent
        authCallbackRedirect={mocks.locationReplace}
        localE2EAuthBypass={false}
        runtimeSupabaseConfig={null}
      />
    );

    await waitFor(() => {
      expect(mocks.locationReplace).toHaveBeenCalledWith(
        '/api/auth/callback?code=callback-code&multiAccount=true&returnUrl=%2Fen%2Fpersonal%2Ftasks'
      );
    });
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
  });
});
