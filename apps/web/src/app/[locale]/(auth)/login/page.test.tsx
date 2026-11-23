// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginContent } from './login-content';
import Login, * as pageModule from './page';

const mocks = vi.hoisted(() => ({
  getLocalE2ESupabaseBrowserConfig: vi.fn(),
  isLocalE2EAuthBypassEnabled: vi.fn(),
  locationReplace: vi.fn(),
  loginView: { data: undefined, pending: false } as {
    data:
      | {
          hasSession: boolean;
          providerHint: 'google' | null;
          returnApp: {
            autoContinue: boolean;
            id: string;
            logo?: string | null;
            name: string;
          } | null;
          savedAccounts: never[];
          session: null;
        }
      | undefined;
    pending: boolean;
  },
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

vi.mock('./use-login-view', () => ({
  useLoginView: () => mocks.loginView,
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

vi.mock('next-intl', async () => {
  const en = (await import('../../../../../messages/en.json')).default;
  const translate = (namespace?: string) => {
    const t = (key: string, values?: Record<string, string>) => {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      const messages: Record<string, string> = {
        'account_switcher.add_account': 'Add account',
        'account_switcher.add_account_description':
          'Add another account to continue',
        'login.sign_in_or_create':
          'Sign in or create an account. It is the same step.',
        'login.welcome_to_tuturuuu': 'Welcome to Tuturuuu',
      };

      if (fullKey === 'login.sign_in_to_app') {
        return `Sign in to ${values?.app ?? ''}`;
      }

      if (fullKey === 'login.secured_by_tuturuuu') {
        return `${values?.app ?? ''}’s sign-in is secured and powered by Tuturuuu`;
      }

      return messages[fullKey] ?? fullKey;
    };
    // Renders the real English notice, with tags as the given elements.
    t.rich = (
      key: string,
      tags: Record<string, (chunks: string) => unknown>
    ) => {
      const source = (en.login as Record<string, string>)[key] ?? key;
      return source
        .split(/(<\w+>[^<]*<\/\w+>)/u)
        .filter(Boolean)
        .map((part, index) => {
          const match = /^<(\w+)>([^<]*)<\/\w+>$/u.exec(part);
          const render = match ? tags[match[1]!] : undefined;
          return render ? (
            <span key={`${key}-${index.toString()}`}>
              {render(match![2]!) as string}
            </span>
          ) : (
            part
          );
        });
    };
    return t;
  };
  return {
    useLocale: () => 'en',
    useTranslations: translate,
  };
});

vi.mock('./auth-top-controls', () => ({
  AuthTopControls: () => (
    <div data-testid="auth-top-controls">
      <button type="button">language</button>
      <button type="button">theme</button>
    </div>
  ),
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
    mocks.loginView = { data: undefined, pending: false };
  });

  it('does not export cache-incompatible route segment config', () => {
    expect('dynamic' in pageModule).toBe(false);
    expect('revalidate' in pageModule).toBe(false);
  });

  it('renders the cacheable login shell from a direct hard load', async () => {
    await renderLoginPage();

    expect(
      screen.getByRole('heading', { name: 'Welcome to Tuturuuu' })
    ).toBeInTheDocument();
    expect(mocks.loginFormProps).toContainEqual({
      deferAuthSurfaceUntilSessionCheck: false,
      localE2EAuthBypass: false,
      loginView: { data: undefined, pending: false },
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

  it('agrees to the Terms and Privacy Policy without bundling product emails', async () => {
    await renderLoginPage();

    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(
      'By continuing you agree to the Terms and Privacy Policy.'
    );
    expect(footer.textContent).not.toMatch(/email/iu);
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      '/terms'
    );
    expect(
      screen.getByRole('link', { name: 'Privacy Policy' })
    ).toHaveAttribute('href', '/privacy');
    expect(
      screen.getByRole('link', { name: 'login.trouble_signing_in' })
    ).toHaveAttribute('href', '/auth/recovery');
  });

  it('renders one centred column with no decorative stage', async () => {
    await renderLoginPage();

    const controls = screen.getByTestId('auth-top-controls');
    const form = screen.getByTestId('login-form');
    expect(
      controls.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.queryByTestId('auth-stage')).not.toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(
      screen.queryByTestId('login-app-disclaimer')
    ).not.toBeInTheDocument();
  });

  it('renders the partner app header for known returnUrl domains on the client', async () => {
    await renderLoginPage({
      returnUrl: 'https://learn.tuturuuu.com/courses',
    });

    expect(
      screen.getByRole('heading', { name: 'Sign in to Learn' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('login-app-disclaimer')).toHaveTextContent(
      'Learn’s sign-in is secured and powered by Tuturuuu'
    );
    expect(screen.getByTestId('login-form')).toHaveAttribute(
      'data-defer-auth-surface',
      'true'
    );
  });

  it('renders the Chat app header for Chat verifier return URLs', async () => {
    await renderLoginPage({
      returnUrl: 'https://chat.tuturuuu.com/verify-token?nextUrl=%2Fpersonal',
    });

    expect(
      screen.getByRole('heading', { name: 'Sign in to Chat' })
    ).toBeInTheDocument();
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

  it('names a registered external app in the header of a focused sign-in', async () => {
    mocks.loginView = {
      data: {
        hasSession: false,
        providerHint: 'google',
        returnApp: {
          autoContinue: false,
          id: 'edufest',
          name: 'EduFest Booth Hall',
        },
        savedAccounts: [],
        session: null,
      },
      pending: false,
    };

    await renderLoginPage({
      provider: 'google',
      returnUrl: 'https://showcase.ieeai.net/edufest/verify-token?state=s',
    });

    expect(
      screen.getByRole('heading', { name: 'Sign in to EduFest Booth Hall' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Welcome to Tuturuuu')).not.toBeInTheDocument();
    expect(screen.getByTestId('login-app-disclaimer')).toHaveTextContent(
      'EduFest Booth Hall’s sign-in is secured and powered by Tuturuuu'
    );
  });

  it('shows a registered logo, and the neutral glyph when it fails to load', async () => {
    mocks.loginView = {
      data: {
        hasSession: false,
        providerHint: 'google',
        returnApp: {
          autoContinue: false,
          id: 'edufest',
          logo: '/api/v1/auth/external-app-logo/edufest/0123456789abcdef',
          name: 'EduFest Booth Hall',
        },
        savedAccounts: [],
        session: null,
      },
      pending: false,
    };

    await renderLoginPage({
      provider: 'google',
      returnUrl: 'https://showcase.ieeai.net/edufest/verify-token?state=s',
    });

    const logo = screen.getByTestId('login-app-logo');
    expect(logo).toHaveAttribute(
      'src',
      '/api/v1/auth/external-app-logo/edufest/0123456789abcdef'
    );
    expect(logo).toHaveAttribute('alt', '');
    fireEvent.error(logo);
    expect(screen.queryByTestId('login-app-logo')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Sign in to EduFest Booth Hall' })
    ).toBeInTheDocument();
  });

  it('names the app only from the server registry, never the query string', async () => {
    mocks.loginView = {
      data: {
        hasSession: false,
        providerHint: 'google',
        returnApp: null,
        savedAccounts: [],
        session: null,
      },
      pending: false,
    };

    // A lookalike host the registry refused, with a forged label.
    await renderLoginPage({
      appName: 'EduFest Booth Hall',
      provider: 'google',
      returnUrl:
        'https://showcase.ieeai.net.evil.test/edufest/verify-token?state=s',
    });

    expect(
      screen.getByRole('heading', { name: 'Welcome to Tuturuuu' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/EduFest/u)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('login-app-disclaimer')
    ).not.toBeInTheDocument();
  });

  it('renders a registered app name in the disclaimer as text, never markup', async () => {
    const hostile = '<img src=x onerror="alert(1)"><b>Booth</b>';
    mocks.loginView = {
      data: {
        hasSession: false,
        providerHint: 'google',
        returnApp: { autoContinue: false, id: 'edufest', name: hostile },
        savedAccounts: [],
        session: null,
      },
      pending: false,
    };

    await renderLoginPage({
      provider: 'google',
      returnUrl: 'https://showcase.ieeai.net/edufest/verify-token?state=s',
    });

    const disclaimer = screen.getByTestId('login-app-disclaimer');
    expect(disclaimer).toHaveTextContent(
      `${hostile}’s sign-in is secured and powered by Tuturuuu`
    );
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(disclaimer.querySelector('b')).toBeNull();
  });

  it.each([
    'https://nova.ai/callback',
    'https://chat.tuturuuu.co/callback',
    'https://tuturuuu.com.evil.test/callback',
  ])('gives the lookalike %s no first-party branding', async (returnUrl) => {
    mocks.loginView = {
      data: {
        hasSession: false,
        providerHint: null,
        returnApp: null,
        savedAccounts: [],
        session: null,
      },
      pending: false,
    };

    await renderLoginPage({ returnUrl });

    expect(screen.queryByText(/Nova|Chat/u)).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('login-app-disclaimer')
    ).not.toBeInTheDocument();
  });

  it('reserves the header while a focused sign-in view resolves', async () => {
    mocks.loginView = { data: undefined, pending: true };

    await renderLoginPage({
      provider: 'google',
      returnUrl: 'https://showcase.ieeai.net/edufest/verify-token?state=s',
    });

    expect(screen.queryByText('Welcome to Tuturuuu')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
