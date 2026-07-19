import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  SQUARE_API_VERSION,
  SQUARE_OAUTH_SCOPES,
  type SquareApiDevice,
  type SquareApiDeviceCode,
  type SquareApiLocation,
  type SquareApiOrder,
  type SquareApiPayment,
  type SquareApiTerminalCheckout,
  type SquareCatalogIdMapping,
  type SquareCatalogObject,
  type SquareEnvironment,
  type SquareInventoryCount,
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

export type SquareOAuthAppConfig = {
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

export function createSquareOAuthRedirectUrl(origin: string) {
  return new URL('/api/v1/inventory/square/oauth/callback', origin).toString();
}

export function createSquareAuthorizeUrl({
  config,
  environment,
  state,
}: {
  config: Pick<SquareOAuthAppConfig, 'applicationId' | 'redirectUrl'>;
  environment: SquareEnvironment;
  state: string;
}) {
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
  config,
  environment,
}: {
  code: string;
  config: SquareOAuthAppConfig;
  environment: SquareEnvironment;
}) {
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
  config,
  environment,
  refreshToken,
}: {
  config: Pick<SquareOAuthAppConfig, 'applicationId' | 'applicationSecret'>;
  environment: SquareEnvironment;
  refreshToken: string;
}) {
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

export async function retrieveSquareOrderApi({
  accessToken,
  environment,
  orderId,
}: {
  accessToken: string;
  environment: SquareEnvironment;
  orderId: string;
}) {
  const payload = await squareFetch<{ order?: SquareApiOrder }>({
    accessToken,
    environment,
    path: `/v2/orders/${encodeURIComponent(orderId)}`,
  });
  return payload.order ?? null;
}

export async function retrieveSquarePaymentApi({
  accessToken,
  environment,
  paymentId,
}: {
  accessToken: string;
  environment: SquareEnvironment;
  paymentId: string;
}) {
  const payload = await squareFetch<{ payment?: SquareApiPayment }>({
    accessToken,
    environment,
    path: `/v2/payments/${encodeURIComponent(paymentId)}`,
  });
  return payload.payment ?? null;
}

export async function searchSquareCatalogApi({
  accessToken,
  beginTime,
  cursor,
  environment,
}: {
  accessToken: string;
  beginTime?: string | null;
  cursor?: string | null;
  environment: SquareEnvironment;
}) {
  return squareFetch<{
    cursor?: string;
    latest_time?: string;
    objects?: SquareCatalogObject[];
    related_objects?: SquareCatalogObject[];
  }>({
    accessToken,
    body: {
      ...(beginTime ? { begin_time: beginTime } : {}),
      ...(cursor ? { cursor } : {}),
      include_deleted_objects: true,
      include_related_objects: true,
      object_types: ['ITEM'],
    },
    environment,
    method: 'POST',
    path: '/v2/catalog/search',
  });
}

export async function retrieveSquareCatalogObjectApi({
  accessToken,
  environment,
  objectId,
}: {
  accessToken: string;
  environment: SquareEnvironment;
  objectId: string;
}) {
  const payload = await squareFetch<{
    object?: SquareCatalogObject;
    related_objects?: SquareCatalogObject[];
  }>({
    accessToken,
    environment,
    path: `/v2/catalog/object/${encodeURIComponent(objectId)}?include_related_objects=true`,
  });
  return payload.object ?? null;
}

export async function batchUpsertSquareCatalogApi({
  accessToken,
  environment,
  idempotencyKey,
  objects,
}: {
  accessToken: string;
  environment: SquareEnvironment;
  idempotencyKey: string;
  objects: SquareCatalogObject[];
}) {
  return squareFetch<{
    catalog_objects?: SquareCatalogObject[];
    id_mappings?: SquareCatalogIdMapping[];
  }>({
    accessToken,
    body: {
      batches: [{ objects }],
      idempotency_key: idempotencyKey,
    },
    environment,
    method: 'POST',
    path: '/v2/catalog/batch-upsert',
  });
}

export async function batchRetrieveSquareInventoryCountsApi({
  accessToken,
  catalogObjectIds,
  cursor,
  environment,
  locationIds,
}: {
  accessToken: string;
  catalogObjectIds: string[];
  cursor?: string | null;
  environment: SquareEnvironment;
  locationIds: string[];
}) {
  return squareFetch<{
    counts?: SquareInventoryCount[];
    cursor?: string;
  }>({
    accessToken,
    body: {
      catalog_object_ids: catalogObjectIds,
      ...(cursor ? { cursor } : {}),
      location_ids: locationIds,
      states: ['IN_STOCK'],
    },
    environment,
    method: 'POST',
    path: '/v2/inventory/counts/batch-retrieve',
  });
}

export async function batchChangeSquareInventoryApi({
  accessToken,
  changes,
  environment,
  idempotencyKey,
}: {
  accessToken: string;
  changes: Array<Record<string, unknown>>;
  environment: SquareEnvironment;
  idempotencyKey: string;
}) {
  return squareFetch<{ counts?: SquareInventoryCount[] }>({
    accessToken,
    body: {
      changes,
      idempotency_key: idempotencyKey,
      ignore_unchanged_counts: true,
    },
    environment,
    method: 'POST',
    path: '/v2/inventory/changes/batch-create',
  });
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
        product_type: 'TERMINAL_API',
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
