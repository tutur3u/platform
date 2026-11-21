import { connectedMailRequest } from '@tuturuuu/internal-api';
import { APP_BASE_GLOBAL } from '@tuturuuu/start-bridge/app-url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerMailBrowserApiPaths } from './mail-api-client';

const CONNECT = '/api/v1/workspaces/workspace/mail/connected/connect';
let unregister: (() => void) | undefined;

beforeEach(() => {
  // A browser bundle: not Mail's server runtime, so the configured origin
  // would apply unless Mail's own resolver claims the path.
  vi.spyOn(process, 'cwd').mockReturnValue('/browser');
  vi.stubEnv('npm_package_name', '');
  vi.stubEnv('NEXT_PUBLIC_MAIL_APP_URL', 'https://mail.tuturuuu.com');
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ authUrl: 'https://accounts.google.com/o/oauth2/v2/auth' })
    )
  );
  unregister = registerMailBrowserApiPaths();
});

afterEach(() => {
  unregister?.();
  delete (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL];
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function requestedUrl() {
  const [input] = vi.mocked(globalThis.fetch).mock.calls[0] ?? [];
  return String(input);
}

it.each([
  ['/mail', `/mail${CONNECT}`],
  ['', CONNECT],
])(
  'keeps connected-account starts same-origin under the %o base',
  async (base, expected) => {
    (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL] = base;
    await connectedMailRequest('workspace', ['connect'], {
      method: 'POST',
      body: { provider: 'google' },
    });
    const url = new URL(requestedUrl(), 'https://page.invalid');
    expect(url.pathname).toBe(expected);
    expect(url.hostname).not.toBe('mail.tuturuuu.com');
  }
);
