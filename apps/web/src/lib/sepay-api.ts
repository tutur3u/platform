import { decryptSepayToken } from './sepay-crypto';

interface SepayTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

interface SepayBankAccount {
  active?: boolean;
  account_number?: string;
  bank_account_id?: string;
  gateway?: string;
  id?: string;
  label?: string | null;
  sub_account_id?: string;
}

interface SepayApiListResponse<T> {
  data?: T[];
  status?: string;
}

const SEPAY_FETCH_TIMEOUT_MS = 10_000;
const SEPAY_BANK_ACCOUNT_PAGE_LIMIT = 100;
const SEPAY_BANK_ACCOUNT_RATE_LIMIT_RETRIES = 3;

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, '');
}

function getSepayApiBaseUrl() {
  const configured = process.env.SEPAY_API_BASE_URL;

  if (configured?.trim()) {
    return normalizeBaseUrl(configured);
  }

  return 'https://my.sepay.vn/api/v1';
}

function getSepayOauthBaseUrl() {
  const configured = process.env.SEPAY_OAUTH_BASE_URL;

  if (configured?.trim()) {
    return normalizeBaseUrl(configured);
  }

  return 'https://my.sepay.vn';
}

function readScopes(input?: string) {
  if (!input) {
    return [] as string[];
  }

  return input
    .split(' ')
    .map((scope) => scope.trim())
    .filter(Boolean);
}

async function fetchSepay(url: string, init: RequestInit) {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(SEPAY_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      throw new Error(
        `SePay request timed out after ${SEPAY_FETCH_TIMEOUT_MS}ms`
      );
    }

    throw error;
  }
}

function readRetryAfterMs(value: string | null, fallbackMs: number) {
  if (!value) {
    return fallbackMs;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) {
    return fallbackMs;
  }

  return Math.max(0, retryAt - Date.now());
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function exchangeSepayAuthorizationCode(input: {
  code: string;
  redirectUri: string;
}) {
  const clientId = process.env.SEPAY_OAUTH_CLIENT_ID ?? '';
  const clientSecret = process.env.SEPAY_OAUTH_CLIENT_SECRET ?? '';

  if (!clientId || !clientSecret) {
    throw new Error('Missing SePay OAuth client credentials');
  }

  const tokenUrl = `${getSepayOauthBaseUrl()}/oauth/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: input.code,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  });

  const response = await fetchSepay(tokenUrl, {
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `SePay OAuth exchange failed: ${response.status} ${responseText}`
    );
  }

  const json = (await response.json()) as SepayTokenResponse;

  if (!json.access_token || !json.refresh_token) {
    throw new Error('SePay OAuth response missing access or refresh token');
  }

  const expiresInSeconds = Number.isFinite(json.expires_in)
    ? Math.max(60, Number(json.expires_in))
    : 3600;

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    refreshToken: json.refresh_token,
    scopes: readScopes(json.scope),
  };
}

export async function refreshSepayAccessToken(input: {
  refreshTokenEncrypted: string;
}) {
  const clientId = process.env.SEPAY_OAUTH_CLIENT_ID ?? '';
  const clientSecret = process.env.SEPAY_OAUTH_CLIENT_SECRET ?? '';

  if (!clientId || !clientSecret) {
    throw new Error('Missing SePay OAuth client credentials');
  }

  const refreshToken = decryptSepayToken(input.refreshTokenEncrypted);
  const tokenUrl = `${getSepayOauthBaseUrl()}/oauth/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetchSepay(tokenUrl, {
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `SePay token refresh failed: ${response.status} ${responseText}`
    );
  }

  const json = (await response.json()) as SepayTokenResponse;

  if (!json.access_token) {
    throw new Error('SePay refresh response missing access token');
  }

  const expiresInSeconds = Number.isFinite(json.expires_in)
    ? Math.max(60, Number(json.expires_in))
    : 3600;

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    refreshToken: json.refresh_token ?? refreshToken,
    scopes: readScopes(json.scope),
  };
}

export async function listSepayBankAccounts(input: { accessToken: string }) {
  const allAccounts: SepayBankAccount[] = [];
  let sinceId: string | null = null;

  while (true) {
    const url = new URL(`${getSepayApiBaseUrl()}/bank-accounts`);
    url.searchParams.set('limit', String(SEPAY_BANK_ACCOUNT_PAGE_LIMIT));

    if (sinceId) {
      url.searchParams.set('since_id', sinceId);
    }

    let response: Response | null = null;

    for (
      let attempt = 0;
      attempt <= SEPAY_BANK_ACCOUNT_RATE_LIMIT_RETRIES;
      attempt += 1
    ) {
      response = await fetchSepay(url.toString(), {
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/json',
        },
        method: 'GET',
      });

      if (
        response.status !== 429 ||
        attempt === SEPAY_BANK_ACCOUNT_RATE_LIMIT_RETRIES
      ) {
        break;
      }

      await delay(
        readRetryAfterMs(
          response.headers.get('retry-after'),
          1000 * (attempt + 1)
        )
      );
    }

    if (!response) {
      throw new Error('Failed to list SePay bank accounts');
    }

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `Failed to list SePay bank accounts: ${response.status} ${responseText}`
      );
    }

    const json =
      (await response.json()) as SepayApiListResponse<SepayBankAccount>;
    const pageAccounts = json.data ?? [];

    if (pageAccounts.length === 0) {
      break;
    }

    allAccounts.push(...pageAccounts);

    const nextSinceId =
      pageAccounts.at(-1)?.id ?? pageAccounts.at(-1)?.bank_account_id ?? null;

    if (
      pageAccounts.length < SEPAY_BANK_ACCOUNT_PAGE_LIMIT ||
      !nextSinceId ||
      nextSinceId === sinceId
    ) {
      break;
    }

    sinceId = nextSinceId;
  }

  return allAccounts;
}

export async function createSepayWebhook(input: {
  accessToken: string;
  bankAccountId: string;
  callbackUrl: string;
  name: string;
  requestApiKey: string;
}) {
  const response = await fetchSepay(`${getSepayApiBaseUrl()}/webhooks`, {
    body: JSON.stringify({
      active: 1,
      api_key: input.requestApiKey,
      authen_type: 'Api_Key',
      bank_account_id: Number(input.bankAccountId),
      event_type: 'All',
      is_verify_payment: 0,
      name: input.name,
      request_content_type: 'Json',
      skip_if_no_code: 0,
      webhook_url: input.callbackUrl,
    }),
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Failed to create SePay webhook: ${response.status} ${responseText}`
    );
  }

  const json = (await response.json()) as {
    id?: string | number;
    message?: string;
  };

  if (json.id == null || json.id === '') {
    throw new Error('SePay webhook creation response missing webhook id');
  }

  return {
    webhookId: String(json.id),
  };
}
