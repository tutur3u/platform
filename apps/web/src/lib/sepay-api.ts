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

function requireSepayApiBaseUrl() {
  const baseUrl = getSepayApiBaseUrl();

  if (!baseUrl) {
    throw new Error('Missing SEPAY_API_BASE_URL');
  }

  return baseUrl;
}

function requireSepayOauthBaseUrl() {
  const baseUrl = getSepayOauthBaseUrl();

  if (!baseUrl) {
    throw new Error('Missing SEPAY_OAUTH_BASE_URL');
  }

  return baseUrl;
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

export async function exchangeSepayAuthorizationCode(input: {
  code: string;
  redirectUri: string;
}) {
  const clientId = process.env.SEPAY_OAUTH_CLIENT_ID ?? '';
  const clientSecret = process.env.SEPAY_OAUTH_CLIENT_SECRET ?? '';

  if (!clientId || !clientSecret) {
    throw new Error('Missing SePay OAuth client credentials');
  }

  const tokenUrl = `${requireSepayOauthBaseUrl()}/oauth/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: input.code,
    grant_type: 'authorization_code',
    redirect_uri: input.redirectUri,
  });

  const response = await fetch(tokenUrl, {
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
  const tokenUrl = `${requireSepayOauthBaseUrl()}/oauth/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenUrl, {
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
  const response = await fetch(`${requireSepayApiBaseUrl()}/bank-accounts`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'GET',
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Failed to list SePay bank accounts: ${response.status} ${responseText}`
    );
  }

  const json =
    (await response.json()) as SepayApiListResponse<SepayBankAccount>;
  return json.data ?? [];
}

export async function createSepayWebhook(input: {
  accessToken: string;
  bankAccountId: string;
  callbackUrl: string;
  name: string;
  requestApiKey: string;
}) {
  const response = await fetch(`${requireSepayApiBaseUrl()}/webhooks`, {
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

  if (!json.id) {
    throw new Error('SePay webhook creation response missing webhook id');
  }

  return {
    webhookId: String(json.id),
  };
}
