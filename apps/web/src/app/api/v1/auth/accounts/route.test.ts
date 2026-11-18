import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE } from './[accountId]/route';
import {
  PATCH as updateCurrentPATCH,
  POST as saveCurrentPOST,
} from './current/route';
import { POST as logoutAllPOST } from './logout-all/route';
import { POST as logoutPOST } from './logout/route';
import {
  OPTIONS as accountsOPTIONS,
  GET,
} from '@/legacy-api-routes/v1/auth/accounts/route';
import { OPTIONS as switchOPTIONS, POST as switchPOST } from './switch/route';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  createAuthDiagnosticCode: vi.fn(),
  listWebAccounts: vi.fn(),
  logAuthDiagnostic: vi.fn(),
  logoutAllWebAccounts: vi.fn(),
  logoutCurrentWebAccount: vi.fn(),
  removeWebAccount: vi.fn(),
  saveCurrentWebAccount: vi.fn(),
  switchWebAccount: vi.fn(),
  unstable_rethrow: vi.fn(),
  updateCurrentWebAccount: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();

  return {
    ...actual,
    connection: () => mocks.connection(),
  };
});

vi.mock('@/lib/auth/diagnostics', () => ({
  createAuthDiagnosticCode: mocks.createAuthDiagnosticCode,
  logAuthDiagnostic: mocks.logAuthDiagnostic,
}));

vi.mock('@/lib/auth/multi-account/vault', () => ({
  logoutAllWebAccounts: mocks.logoutAllWebAccounts,
  logoutCurrentWebAccount: mocks.logoutCurrentWebAccount,
  updateCurrentWebAccount: mocks.updateCurrentWebAccount,
  listWebAccounts: (...args: Parameters<typeof mocks.listWebAccounts>) =>
    mocks.listWebAccounts(...args),
  removeWebAccount: (...args: Parameters<typeof mocks.removeWebAccount>) =>
    mocks.removeWebAccount(...args),
  saveCurrentWebAccount: (
    ...args: Parameters<typeof mocks.saveCurrentWebAccount>
  ) => mocks.saveCurrentWebAccount(...args),
  switchWebAccount: (...args: Parameters<typeof mocks.switchWebAccount>) =>
    mocks.switchWebAccount(...args),
}));

vi.mock('next/navigation', () => ({
  unstable_rethrow: mocks.unstable_rethrow,
}));

const jsonHeaders = {
  origin: 'https://tuturuuu.com',
  'content-type': 'application/json',
};

describe('web multi-account API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.createAuthDiagnosticCode.mockReturnValue('AUTH-ACC-LIST-ABC123');
    mocks.unstable_rethrow.mockReturnValue(undefined);
    mocks.listWebAccounts.mockResolvedValue({
      accounts: [],
      activeAccountId: null,
    });
    mocks.saveCurrentWebAccount.mockResolvedValue({
      accounts: [],
      activeAccountId: 'user-1',
      accountId: 'user-1',
      success: true,
    });
    mocks.switchWebAccount.mockResolvedValue({
      accounts: [],
      activeAccountId: 'user-2',
      accountId: 'user-2',
      redirectTo: '/en/personal/tasks',
      success: true,
    });
    mocks.removeWebAccount.mockResolvedValue({
      accounts: [],
      activeAccountId: null,
      success: true,
    });
  });

  it('lists account summaries after waiting for a request connection', async () => {
    const request = new NextRequest('http://localhost/api/v1/auth/accounts', {
      headers: {
        origin: 'https://tasks.tuturuuu.com',
      },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://tasks.tuturuuu.com'
    );
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe(
      'true'
    );
    await expect(response.json()).resolves.toEqual({
      accounts: [],
      activeAccountId: null,
    });
    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(mocks.listWebAccounts).toHaveBeenCalledWith(request);
    expect(mocks.connection.mock.invocationCallOrder[0]!).toBeLessThan(
      mocks.listWebAccounts.mock.invocationCallOrder[0]!
    );
  });

  it.each(['https://rewise.me', 'https://rewise.school'])(
    'does not add credentialed account CORS for custom origin %s',
    async (origin) => {
      const response = await GET(
        new NextRequest('http://localhost/api/v1/auth/accounts', {
          headers: { origin },
        })
      );

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(null);
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe(
        null
      );
    }
  );

  it('allows credentialed first-party account API preflight requests', () => {
    const response = switchOPTIONS(
      new NextRequest('http://localhost/api/v1/auth/accounts/switch', {
        headers: {
          'access-control-request-headers': 'content-type',
          origin: 'https://tasks.tuturuuu.localhost',
        },
        method: 'OPTIONS',
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://tasks.tuturuuu.localhost'
    );
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe(
      'true'
    );
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'content-type'
    );
  });

  it('omits account CORS headers from disallowed preflight origins', () => {
    const response = accountsOPTIONS(
      new NextRequest('http://localhost/api/v1/auth/accounts', {
        headers: {
          origin: 'https://preview.vercel.app',
        },
        method: 'OPTIONS',
      })
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(null);
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe(null);
  });

  it('rethrows DYNAMIC_SERVER_USAGE signals before diagnostic logging', async () => {
    const dynamicServerError = Object.assign(
      new Error('Dynamic server usage'),
      {
        digest: 'DYNAMIC_SERVER_USAGE',
      }
    );
    mocks.listWebAccounts.mockRejectedValue(dynamicServerError);
    mocks.unstable_rethrow.mockImplementation((error) => {
      throw error;
    });

    await expect(
      GET(new NextRequest('http://localhost/api/v1/auth/accounts'))
    ).rejects.toBe(dynamicServerError);

    expect(mocks.unstable_rethrow).toHaveBeenCalledWith(dynamicServerError);
    expect(mocks.createAuthDiagnosticCode).not.toHaveBeenCalled();
    expect(mocks.logAuthDiagnostic).not.toHaveBeenCalled();
  });

  it('logs and returns the existing diagnostic shape for vault failures', async () => {
    const error = new Error('vault failed');
    mocks.listWebAccounts.mockRejectedValue(error);

    const request = new NextRequest('http://localhost/api/v1/auth/accounts');
    const response = await GET(request);

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({
      accounts: [],
      activeAccountId: null,
      diagnosticCode: 'AUTH-ACC-LIST-ABC123',
      error: 'Failed to load accounts',
    });
    expect(mocks.unstable_rethrow).toHaveBeenCalledWith(error);
    expect(mocks.createAuthDiagnosticCode).toHaveBeenCalledWith('account_list');
    expect(mocks.logAuthDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        authMethod: 'multi-account',
        code: 'AUTH-ACC-LIST-ABC123',
        error,
        message: 'Failed to load multi-account vault',
        request,
        route: '/api/v1/auth/accounts',
        stage: 'account_list',
      })
    );
  });

  it('saves the current account with a validated body', async () => {
    const request = new NextRequest(
      'http://localhost/api/v1/auth/accounts/current',
      {
        body: JSON.stringify({
          returnUrl: '/en/personal/tasks',
          route: '/en/personal/tasks',
        }),
        headers: jsonHeaders,
        method: 'POST',
      }
    );

    const response = await saveCurrentPOST(request);

    expect(response.status).toBe(200);
    expect(mocks.saveCurrentWebAccount).toHaveBeenCalledWith(request, {
      returnUrl: '/en/personal/tasks',
      route: '/en/personal/tasks',
    });
  });

  it('returns 410 when switching to a missing or expired account fails', async () => {
    mocks.switchWebAccount.mockResolvedValue({
      accounts: [],
      activeAccountId: null,
      error: 'Account not found',
      success: false,
    });
    const request = new NextRequest(
      'http://localhost/api/v1/auth/accounts/switch',
      {
        body: JSON.stringify({
          accountId: 'user-2',
        }),
        headers: jsonHeaders,
        method: 'POST',
      }
    );

    const response = await switchPOST(request);

    expect(response.status).toBe(410);
  });

  it('removes an account by route param', async () => {
    const request = new NextRequest(
      'http://localhost/api/v1/auth/accounts/user-2',
      {
        headers: jsonHeaders,
        method: 'DELETE',
      }
    );

    const response = await DELETE(request, {
      params: Promise.resolve({ accountId: 'user-2' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.removeWebAccount).toHaveBeenCalledWith(request, 'user-2');
  });

  describe.each([
    {
      method: 'POST',
      path: 'switch',
      handler: switchPOST,
      mutation: mocks.switchWebAccount,
    },
    {
      method: 'POST',
      path: 'current',
      handler: saveCurrentPOST,
      mutation: mocks.saveCurrentWebAccount,
    },
    {
      method: 'PATCH',
      path: 'current',
      handler: updateCurrentPATCH,
      mutation: mocks.updateCurrentWebAccount,
    },
    {
      method: 'POST',
      path: 'logout',
      handler: logoutPOST,
      mutation: mocks.logoutCurrentWebAccount,
    },
    {
      method: 'POST',
      path: 'logout-all',
      handler: logoutAllPOST,
      mutation: mocks.logoutAllWebAccounts,
    },
    {
      method: 'DELETE',
      path: 'user-2',
      handler: (request: NextRequest) =>
        DELETE(request, { params: Promise.resolve({ accountId: 'user-2' }) }),
      mutation: mocks.removeWebAccount,
    },
  ])('$method /$path mutation guard', ({ method, path, handler, mutation }) => {
    const url = `https://tuturuuu.com/api/v1/auth/accounts/${path}`;

    it.each([
      undefined,
      'null',
      'https://unregistered.tuturuuu.com',
      'https://tasks.tuturuuu.com:443',
      'https://tasks.tuturuuu.com/path',
    ])('rejects origin %s before invoking the vault', async (origin) => {
      const headers = new Headers(jsonHeaders);
      if (origin === undefined) headers.delete('origin');
      else headers.set('origin', origin);

      const response = await handler(new NextRequest(url, { headers, method }));
      expect(response.status).toBe(403);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(mutation).not.toHaveBeenCalled();
    });

    it.each([
      undefined,
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=test',
    ])('rejects media type %s before invoking the vault', async (mediaType) => {
      const headers = new Headers(jsonHeaders);
      if (mediaType === undefined) headers.delete('content-type');
      else headers.set('content-type', mediaType);

      const response = await handler(
        new NextRequest(url, {
          body:
            mediaType === undefined
              ? undefined
              : JSON.stringify({ accountId: 'user-2' }),
          headers,
          method,
        })
      );
      expect(response.status).toBe(415);
      expect(mutation).not.toHaveBeenCalled();
    });

    it('accepts JSON from a registered satellite', async () => {
      mutation.mockResolvedValueOnce({
        accounts: [],
        activeAccountId: null,
        success: true,
      });
      const origin = 'https://tasks.tuturuuu.com';
      const response = await handler(
        new NextRequest(url, {
          body: JSON.stringify({ accountId: 'user-2' }),
          headers: {
            origin,
            'content-type': 'application/json; charset=utf-8',
          },
          method,
        })
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
      expect(mutation).toHaveBeenCalledTimes(1);
    });
  });
});

it('returns a generic 409 for a stale account-switch CAS', async () => {
  mocks.switchWebAccount.mockResolvedValue({
    accounts: [],
    activeAccountId: null,
    success: false,
    errorCode: 'switch_conflict',
    error: 'Account switch state changed',
  });
  const response = await switchPOST(
    new NextRequest('https://tuturuuu.com/api/v1/auth/accounts/switch', {
      method: 'POST',
      body: JSON.stringify({ accountId: 'synthetic' }),
      headers: jsonHeaders,
    })
  );
  expect(response.status).toBe(409);
  expect(response.headers.getSetCookie()).toEqual([]);
});
