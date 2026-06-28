import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  SQUARE_API_VERSION,
  SQUARE_OAUTH_SCOPES,
  type SquareApiDevice,
  type SquareApiDeviceCode,
  type SquareApiLocation,
  type SquareApiOrder,
  type SquareApiTerminalCheckout,
  type SquareEnvironment,
  type SquareMoney,
  type SquareOAuthTokenResponse,
} from './types';

export class SquareConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SquareConfigurationError';
  }
}

export class SquareApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SquareApiError';
    this.status = status;
  }
}

type SquareAppConfig = {
  applicationId: string;
  applicationSecret: string;
  redirectUrl: string;
};

type SquareFetchOptions = {
  accessToken: string;
  body?: unknown;
  environment: SquareEnvironment;
  method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
  path: string;
};

function baseUrl(environment: SquareEnvironment) {
  return environment === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}

function optionalEnv(primary: string, fallback?: string) {
  return process.env[primary] || (fallback ? process.env[fallback] : undefined);
}

export function getSquareAppConfig({
  environment,
  origin,
}: {
  environment: SquareEnvironment;
  origin?: string;
}): SquareAppConfig {
  const applicationId =
    environment === 'sandbox'
      ? optionalEnv('SQUARE_SANDBOX_APPLICATION_ID', 'SQUARE_APPLICATION_ID')
      : optionalEnv('SQUARE_APPLICATION_ID');
  const applicationSecret =
    environment === 'sandbox'
      ? optionalEnv(
          'SQUARE_SANDBOX_APPLICATION_SECRET',
          'SQUARE_APPLICATION_SECRET'
        )
      : optionalEnv('SQUARE_APPLICATION_SECRET');
  const redirectUrl =
    process.env.SQUARE_OAUTH_REDIRECT_URL ||
    (origin
      ? `${origin.replace(/\/$/u, '')}/api/v1/inventory/square/oauth/callback`
      : undefined);

  if (!applicationId || !applicationSecret || !redirectUrl) {
    throw new SquareConfigurationError(
      'Square OAuth app credentials and redirect URL are not configured'
    );
  }

  return {
    applicationId,
    applicationSecret,
    redirectUrl,
  };
}

export function hasSquareAppConfig(environment: SquareEnvironment) {
  try {
    getSquareAppConfig({ environment, origin: 'https://tuturuuu.com' });
    return true;
  } catch {
    return false;
  }
}

export function createSquareAuthorizeUrl({
  environment,
  origin,
  state,
}: {
  environment: SquareEnvironment;
  origin: string;
  state: string;
}) {
  const config = getSquareAppConfig({ environment, origin });
  const url = new URL(`${baseUrl(environment)}/oauth2/authorize`);
  url.searchParams.set('client_id', config.applicationId);
  url.searchParams.set('scope', SQUARE_OAUTH_SCOPES.join(' '));
  url.searchParams.set('session', 'false');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', config.redirectUrl);
  return url.toString();
}

function extractSquareErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const errors = (payload as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return null;
  const first = errors.find(Boolean);
  if (!first || typeof first !== 'object') return null;
  const detail = (first as { detail?: unknown }).detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  const code = (first as { code?: unknown }).code;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export async function squareFetch<T>({
  accessToken,
  body,
  environment,
  method = 'GET',
  path,
}: SquareFetchOptions): Promise<T> {
  const response = await fetch(`${baseUrl(environment)}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_API_VERSION,
    },
    method,
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      extractSquareErrorMessage(payload) || 'Square request failed';
    throw new SquareApiError(message, response.status);
  }

  return payload as T;
}

async function squareOAuthFetch<T>({
  body,
  environment,
}: {
  body: Record<string, unknown>;
  environment: SquareEnvironment;
}) {
  const response = await fetch(`${baseUrl(environment)}/oauth2/token`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'Square-Version': SQUARE_API_VERSION,
    },
    method: 'POST',
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    const message =
      extractSquareErrorMessage(payload) || 'Square OAuth request failed';
    throw new SquareApiError(message, response.status);
  }

  return payload as T;
}

export function parseSquareScopes(scope: string | null | undefined) {
  return (scope ?? '')
    .split(/[,\s]+/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function exchangeSquareOAuthCode({
  code,
  environment,
  origin,
}: {
  code: string;
  environment: SquareEnvironment;
  origin?: string;
}) {
  const config = getSquareAppConfig({ environment, origin });
  return squareOAuthFetch<SquareOAuthTokenResponse>({
    body: {
      client_id: config.applicationId,
      client_secret: config.applicationSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.redirectUrl,
    },
    environment,
  });
}

export async function refreshSquareOAuthToken({
  environment,
  refreshToken,
}: {
  environment: SquareEnvironment;
  refreshToken: string;
}) {
  const config = getSquareAppConfig({ environment });
  return squareOAuthFetch<SquareOAuthTokenResponse>({
    body: {
      client_id: config.applicationId,
      client_secret: config.applicationSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
    environment,
  });
}

export function createSquareIdempotencyKey(prefix: string) {
  return `${prefix}-${randomUUID()}`.slice(0, 45);
}

export function toSquareMoney(amount: number, currency: string): SquareMoney {
  return {
    amount: Math.max(0, Math.round(amount)),
    currency: (currency || 'USD').trim().toUpperCase(),
  };
}

export async function listSquareLocationsApi({
  accessToken,
  environment,
}: {
  accessToken: string;
  environment: SquareEnvironment;
}) {
  const payload = await squareFetch<{ locations?: SquareApiLocation[] }>({
    accessToken,
    environment,
    path: '/v2/locations',
  });
  return payload.locations ?? [];
}

export async function createSquareDeviceCodeApi({
  accessToken,
  environment,
  idempotencyKey,
  locationId,
  name,
}: {
  accessToken: string;
  environment: SquareEnvironment;
  idempotencyKey: string;
  locationId: string;
  name: string;
}) {
  const payload = await squareFetch<{ device_code?: SquareApiDeviceCode }>({
    accessToken,
    body: {
      device_code: {
        location_id: locationId,
        name,
        product_type: 'TERMINAL',
      },
      idempotency_key: idempotencyKey,
    },
    environment,
    method: 'POST',
    path: '/v2/devices/codes',
  });
  return payload.device_code ?? null;
}

export async function listSquareDevicesApi({
  accessToken,
  environment,
}: {
  accessToken: string;
  environment: SquareEnvironment;
}) {
  const payload = await squareFetch<{ devices?: SquareApiDevice[] }>({
    accessToken,
    environment,
    path: '/v2/devices',
  });
  return payload.devices ?? [];
}

export async function createSquareOrderApi({
  accessToken,
  body,
  environment,
}: {
  accessToken: string;
  body: unknown;
  environment: SquareEnvironment;
}) {
  const payload = await squareFetch<{ order?: SquareApiOrder }>({
    accessToken,
    body,
    environment,
    method: 'POST',
    path: '/v2/orders',
  });
  return payload.order ?? null;
}

export async function createSquareTerminalCheckoutApi({
  accessToken,
  body,
  environment,
}: {
  accessToken: string;
  body: unknown;
  environment: SquareEnvironment;
}) {
  const payload = await squareFetch<{ checkout?: SquareApiTerminalCheckout }>({
    accessToken,
    body,
    environment,
    method: 'POST',
    path: '/v2/terminals/checkouts',
  });
  return payload.checkout ?? null;
}

export async function getSquareTerminalCheckoutApi({
  accessToken,
  checkoutId,
  environment,
}: {
  accessToken: string;
  checkoutId: string;
  environment: SquareEnvironment;
}) {
  const payload = await squareFetch<{ checkout?: SquareApiTerminalCheckout }>({
    accessToken,
    environment,
    path: `/v2/terminals/checkouts/${encodeURIComponent(checkoutId)}`,
  });
  return payload.checkout ?? null;
}

export async function cancelSquareTerminalCheckoutApi({
  accessToken,
  checkoutId,
  environment,
}: {
  accessToken: string;
  checkoutId: string;
  environment: SquareEnvironment;
}) {
  const payload = await squareFetch<{ checkout?: SquareApiTerminalCheckout }>({
    accessToken,
    environment,
    method: 'POST',
    path: `/v2/terminals/checkouts/${encodeURIComponent(checkoutId)}/cancel`,
  });
  return payload.checkout ?? null;
}
