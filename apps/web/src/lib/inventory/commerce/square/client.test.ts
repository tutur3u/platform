import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSquareAuthorizeUrl,
  createSquareDeviceCodeApi,
  createSquareIdempotencyKey,
  createSquareOAuthRedirectUrl,
  exchangeSquareOAuthCode,
  parseSquareScopes,
  refreshSquareOAuthToken,
  type SquareApiError,
  squareFetch,
  toSquareMoney,
} from './client';
import { SQUARE_API_VERSION } from './types';

vi.mock('server-only', () => ({}));

describe('Square REST client', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('normalizes money to Square minor-unit payloads', () => {
    expect(toSquareMoney(1234.4, 'usd')).toEqual({
      amount: 1234,
      currency: 'USD',
    });
    expect(toSquareMoney(-50, 'usd')).toEqual({
      amount: 0,
      currency: 'USD',
    });
  });

  it('creates Square-safe idempotency keys', () => {
    const key = createSquareIdempotencyKey('checkout');

    expect(key.startsWith('checkout-')).toBe(true);
    expect(key.length).toBeLessThanOrEqual(45);
  });

  it('parses OAuth scopes from comma or space separated payloads', () => {
    expect(parseSquareScopes('ORDERS_READ ORDERS_WRITE,PAYMENTS_READ')).toEqual(
      ['ORDERS_READ', 'ORDERS_WRITE', 'PAYMENTS_READ']
    );
  });

  it('builds OAuth authorization URLs with state, redirect, and required scopes', () => {
    const redirectUrl =
      'https://web.example.com/api/v1/inventory/square/oauth/callback';

    const url = new URL(
      createSquareAuthorizeUrl({
        config: {
          applicationId: 'workspace-square-app-id',
          redirectUrl,
        },
        environment: 'sandbox',
        state: 'oauth-state-1',
      })
    );

    expect(url.origin).toBe('https://connect.squareupsandbox.com');
    expect(url.pathname).toBe('/oauth2/authorize');
    expect(url.searchParams.get('client_id')).toBe('workspace-square-app-id');
    expect(url.searchParams.get('state')).toBe('oauth-state-1');
    expect(url.searchParams.get('redirect_uri')).toBe(redirectUrl);
    expect(url.searchParams.get('scope')?.split(' ')).toEqual(
      expect.arrayContaining([
        'DEVICE_CREDENTIAL_MANAGEMENT',
        'ORDERS_WRITE',
        'PAYMENTS_WRITE',
      ])
    );
  });

  it('derives the default OAuth redirect URL from the request origin', () => {
    expect(createSquareOAuthRedirectUrl('https://web.example.com/')).toBe(
      'https://web.example.com/api/v1/inventory/square/oauth/callback'
    );
  });

  it('exchanges OAuth codes with workspace-supplied app credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'oauth-access-token' }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await exchangeSquareOAuthCode({
      code: 'square-code',
      config: {
        applicationId: 'workspace-app-id',
        applicationSecret: 'workspace-app-secret',
        redirectUrl:
          'https://web.example.com/api/v1/inventory/square/oauth/callback',
      },
      environment: 'production',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://connect.squareup.com/oauth2/token',
      expect.objectContaining({
        body: JSON.stringify({
          client_id: 'workspace-app-id',
          client_secret: 'workspace-app-secret',
          code: 'square-code',
          grant_type: 'authorization_code',
          redirect_uri:
            'https://web.example.com/api/v1/inventory/square/oauth/callback',
        }),
      })
    );
  });

  it('refreshes OAuth tokens with workspace-supplied app credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'new-access-token' }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await refreshSquareOAuthToken({
      config: {
        applicationId: 'workspace-app-id',
        applicationSecret: 'workspace-app-secret',
      },
      environment: 'sandbox',
      refreshToken: 'refresh-token',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://connect.squareupsandbox.com/oauth2/token',
      expect.objectContaining({
        body: JSON.stringify({
          client_id: 'workspace-app-id',
          client_secret: 'workspace-app-secret',
          grant_type: 'refresh_token',
          refresh_token: 'refresh-token',
        }),
      })
    );
  });

  it('pins Square API version and bearer auth on REST calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await squareFetch({
      accessToken: 'square-access-token',
      body: { idempotency_key: 'idem-1' },
      environment: 'sandbox',
      method: 'POST',
      path: '/v2/terminals/checkouts',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://connect.squareupsandbox.com/v2/terminals/checkouts',
      expect.objectContaining({
        body: JSON.stringify({ idempotency_key: 'idem-1' }),
        headers: {
          Authorization: 'Bearer square-access-token',
          'Content-Type': 'application/json',
          'Square-Version': SQUARE_API_VERSION,
        },
        method: 'POST',
      })
    );
  });

  it('creates Terminal API device codes with Square contract fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          device_code: {
            code: 'PAIRME',
            id: 'device-code-1',
            product_type: 'TERMINAL_API',
          },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createSquareDeviceCodeApi({
        accessToken: 'square-access-token',
        environment: 'production',
        idempotencyKey: 'device-idem-1',
        locationId: 'location-1',
        name: 'Front counter',
      })
    ).resolves.toMatchObject({
      id: 'device-code-1',
      product_type: 'TERMINAL_API',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://connect.squareup.com/v2/devices/codes',
      expect.objectContaining({
        body: JSON.stringify({
          device_code: {
            location_id: 'location-1',
            name: 'Front counter',
            product_type: 'TERMINAL_API',
          },
          idempotency_key: 'device-idem-1',
        }),
        method: 'POST',
      })
    );
  });

  it('returns sanitized Square API errors with status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [{ code: 'BAD_REQUEST', detail: 'Device is offline' }],
          }),
          { status: 400 }
        )
      )
    );

    await expect(
      squareFetch({
        accessToken: 'square-access-token',
        environment: 'production',
        path: '/v2/devices',
      })
    ).rejects.toMatchObject({
      message: 'Device is offline',
      name: 'SquareApiError',
      status: 400,
    } satisfies Partial<SquareApiError>);
  });
});
