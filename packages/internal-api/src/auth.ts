import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from './client';

export type InternalOtpClient = 'mobile' | 'tulearn' | 'web';
export type InternalOtpPlatform = 'android' | 'ios';

export interface OtpSettingsResponse {
  diagnosticCode?: string;
  otpEnabled: boolean;
}

export interface SendOtpPayload {
  captchaToken?: string;
  client: InternalOtpClient;
  deviceId?: string;
  email: string;
  locale?: string;
  platform?: InternalOtpPlatform;
}

export interface SendOtpResponse {
  diagnosticCode?: string;
  error?: string;
  retryAfter?: number;
  success?: boolean;
}

export interface VerifyOtpPayload {
  client: InternalOtpClient;
  deviceId?: string;
  email: string;
  locale?: string;
  otp: string;
  platform?: InternalOtpPlatform;
}

export interface VerifyOtpResponse {
  diagnosticCode?: string;
  error?: string;
  retryAfter?: number;
  session?: {
    access_token: string;
    expires_at: number | null;
    expires_in: number;
    refresh_token: string;
    token_type: string;
  };
  success?: boolean;
}

export interface PasswordLoginPayload {
  captchaToken?: string;
  client: InternalOtpClient;
  deviceId?: string;
  email: string;
  locale?: string;
  password: string;
}

export interface PasswordLoginResponse {
  diagnosticCode?: string;
  error?: string;
  remainingAttempts?: number;
  retryAfter?: number;
  session?: {
    access_token: string;
    expires_at: number | null;
    expires_in: number;
    refresh_token: string;
    token_type: string;
  };
  success?: boolean;
}

export interface ConsumeAuthRecoveryPayload {
  code: string;
  email: string;
  locale?: string;
  next?: string | null;
}

export interface ConsumeAuthRecoveryResponse {
  diagnosticCode?: string;
  email?: string;
  error?: string;
  redirectTo?: string;
  success?: boolean;
}

export type QrLoginChallengeStatus =
  | 'approved'
  | 'consumed'
  | 'expired'
  | 'pending'
  | 'rejected';

export interface QrLoginSessionPayload {
  access_token: string;
  expires_at: number | null;
  expires_in: number;
  refresh_token: string;
  token_type: string;
}

export interface CreateQrLoginChallengePayload {
  captchaToken?: string;
  locale?: string;
  origin?: string;
}

export interface CreateQrLoginChallengeResponse {
  challenge?: {
    expiresAt: string;
    id: string;
    payload: string;
    status: QrLoginChallengeStatus;
  };
  error?: string;
  expiresIn?: number;
  success?: boolean;
}

export interface PollQrLoginChallengeResponse {
  error?: string;
  expiresAt?: string;
  session?: QrLoginSessionPayload;
  status?: QrLoginChallengeStatus;
  success?: boolean;
}

export interface ApproveQrLoginChallengePayload {
  deviceId?: string;
  platform?: InternalOtpPlatform;
  secret: string;
}

export interface ApproveQrLoginChallengeResponse {
  error?: string;
  expiresAt?: string;
  status?: QrLoginChallengeStatus;
  success?: boolean;
}

export interface CreateMfaMobileApprovalChallengeResponse {
  challenge?: {
    expiresAt: string;
    id: string;
    pairCode: string;
    status: QrLoginChallengeStatus;
  };
  error?: string;
  expiresIn?: number;
  secret?: string;
  success?: boolean;
}

export interface PollMfaMobileApprovalChallengeResponse {
  error?: string;
  expiresAt?: string;
  mobileMfaVerified?: boolean;
  status?: QrLoginChallengeStatus;
  success?: boolean;
  validUntil?: string | null;
}

export interface PendingMfaMobileApproval {
  createdAt: string;
  expiresAt: string;
  id: string;
  pairCode: string;
  status: QrLoginChallengeStatus;
}

export interface ListPendingMfaMobileApprovalsResponse {
  approvals?: PendingMfaMobileApproval[];
  error?: string;
  requiresMobileMfa?: boolean;
  success?: boolean;
}

export interface ApproveMfaMobileApprovalPayload {
  deviceId?: string;
  pairCode?: string;
  platform?: InternalOtpPlatform;
}

export interface ApproveMfaMobileApprovalResponse {
  error?: string;
  expiresAt?: string;
  status?: QrLoginChallengeStatus;
  success?: boolean;
}

export interface CreateCrossAppReturnUrlPayload {
  returnUrl: string;
}

export interface CreateCrossAppReturnUrlResponse {
  appName?: string | null;
  error?: string;
  returnUrl?: string;
  targetApp?: string;
}

export interface ResolveCrossAppReturnUrlPayload {
  returnUrl: string;
}

export interface ResolveCrossAppReturnUrlResponse {
  appName?: string | null;
  error?: string;
  targetApp?: string;
}

export interface WebAccountMetadata {
  addedAt: number | null;
  avatarUrl: string | null;
  displayName: string | null;
  lastActiveAt: number | null;
  lastRoute: string | null;
  lastWorkspaceId: string | null;
}

export interface WebAccountSummary {
  email: string | null;
  id: string;
  metadata: WebAccountMetadata;
}

export interface WebAccountsResponse {
  accounts: WebAccountSummary[];
  activeAccountId: string | null;
  diagnosticCode?: string;
  error?: string;
}

export interface WebAccountMutationResponse extends WebAccountsResponse {
  accountId?: string;
  redirectTo?: string;
  success: boolean;
}

export interface BrowserSessionLogoutResponse {
  error?: unknown;
  success?: boolean;
}

export interface SaveCurrentWebAccountPayload {
  returnUrl?: string | null;
  route?: string | null;
}

export interface SwitchWebAccountPayload {
  currentRoute?: string | null;
  targetRoute?: string | null;
}

export interface UpdateCurrentWebAccountPayload {
  route?: string | null;
  workspaceId?: string | null;
}

function parseRetryAfterSeconds(response: Response) {
  if (response.status !== 429) {
    return undefined;
  }

  const value = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

async function parseAuthResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | null;
  const retryAfter = parseRetryAfterSeconds(response);

  if (payload) {
    if (
      retryAfter !== undefined &&
      typeof payload === 'object' &&
      !Array.isArray(payload)
    ) {
      const payloadRecord = payload as Record<string, unknown>;

      if (payloadRecord.retryAfter === undefined) {
        return {
          ...payloadRecord,
          retryAfter,
        } as T;
      }
    }

    return payload;
  }

  if (!response.ok) {
    throw new Error(`Internal API request failed: ${response.status}`);
  }

  return {} as T;
}

export async function getOtpSettings(
  payload: {
    client: InternalOtpClient;
    platform?: InternalOtpPlatform;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<OtpSettingsResponse>('/api/v1/auth/otp/settings', {
    cache: 'no-store',
    query: payload,
  });
}

export async function sendOtpWithInternalApi(
  payload: SendOtpPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/otp/send', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return parseAuthResponse<SendOtpResponse>(response);
}

export async function verifyOtpWithInternalApi(
  payload: VerifyOtpPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/otp/verify', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return parseAuthResponse<VerifyOtpResponse>(response);
}

export async function passwordLoginWithInternalApi(
  payload: PasswordLoginPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/password-login', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return parseAuthResponse<PasswordLoginResponse>(response);
}

export async function consumeAuthRecoveryWithInternalApi(
  payload: ConsumeAuthRecoveryPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/recovery/consume', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return parseAuthResponse<ConsumeAuthRecoveryResponse>(response);
}

export async function listWebAccountsWithInternalApi(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WebAccountsResponse>('/api/v1/auth/accounts', {
    cache: 'no-store',
  });
}

export async function saveCurrentWebAccountWithInternalApi(
  payload: SaveCurrentWebAccountPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/accounts/current', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return parseAuthResponse<WebAccountMutationResponse>(response);
}

export async function updateCurrentWebAccountWithInternalApi(
  payload: UpdateCurrentWebAccountPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<WebAccountsResponse>('/api/v1/auth/accounts/current', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PATCH',
  });
}

export async function switchWebAccountWithInternalApi(
  accountId: string,
  payload: SwitchWebAccountPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/accounts/switch', {
    body: JSON.stringify({
      ...payload,
      accountId,
    }),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return parseAuthResponse<WebAccountMutationResponse>(response);
}

export async function removeWebAccountWithInternalApi(
  accountId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/v1/auth/accounts/${encodePathSegment(accountId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
  return parseAuthResponse<WebAccountMutationResponse>(response);
}

export async function logoutCurrentWebAccountWithInternalApi(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/accounts/logout', {
    cache: 'no-store',
    method: 'POST',
  });
  return parseAuthResponse<WebAccountMutationResponse>(response);
}

export async function logoutAllWebAccountsWithInternalApi(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/accounts/logout-all', {
    cache: 'no-store',
    method: 'POST',
  });
  return parseAuthResponse<WebAccountMutationResponse>(response);
}

export async function logoutBrowserSessionWithInternalApi(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/auth/logout', {
    cache: 'no-store',
    method: 'POST',
  });
  return parseAuthResponse<BrowserSessionLogoutResponse>(response);
}

export async function createQrLoginChallengeWithInternalApi(
  payload: CreateQrLoginChallengePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/qr-login/challenges', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return parseAuthResponse<CreateQrLoginChallengeResponse>(response);
}

export async function pollQrLoginChallengeWithInternalApi(
  payload: {
    challengeId: string;
    secret: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/v1/auth/qr-login/challenges/${encodeURIComponent(payload.challengeId)}`,
    {
      cache: 'no-store',
      query: {
        secret: payload.secret,
      },
    }
  );
  return parseAuthResponse<PollQrLoginChallengeResponse>(response);
}

export async function approveQrLoginChallengeWithInternalApi(
  challengeId: string,
  payload: ApproveQrLoginChallengePayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/v1/auth/qr-login/challenges/${encodeURIComponent(challengeId)}/approve`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
  return parseAuthResponse<ApproveQrLoginChallengeResponse>(response);
}

export async function createMfaMobileApprovalChallengeWithInternalApi(
  payload: {
    locale?: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/mfa/mobile/challenges', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return parseAuthResponse<CreateMfaMobileApprovalChallengeResponse>(response);
}

export async function pollMfaMobileApprovalChallengeWithInternalApi(
  payload: {
    challengeId: string;
    secret: string;
  },
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/v1/auth/mfa/mobile/challenges/${encodeURIComponent(payload.challengeId)}`,
    {
      cache: 'no-store',
      query: {
        secret: payload.secret,
      },
    }
  );
  return parseAuthResponse<PollMfaMobileApprovalChallengeResponse>(response);
}

export async function listPendingMfaMobileApprovalsWithInternalApi(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/mfa/mobile/approvals', {
    cache: 'no-store',
  });
  return parseAuthResponse<ListPendingMfaMobileApprovalsResponse>(response);
}

export async function approveMfaMobileApprovalWithInternalApi(
  challengeId: string,
  payload: ApproveMfaMobileApprovalPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch(
    `/api/v1/auth/mfa/mobile/challenges/${encodeURIComponent(challengeId)}/approve`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
  return parseAuthResponse<ApproveMfaMobileApprovalResponse>(response);
}

export async function createCrossAppReturnUrlWithInternalApi(
  payload: CreateCrossAppReturnUrlPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/cross-app-return', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return parseAuthResponse<CreateCrossAppReturnUrlResponse>(response);
}

export async function resolveCrossAppReturnUrlWithInternalApi(
  payload: ResolveCrossAppReturnUrlPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const response = await client.fetch('/api/v1/auth/cross-app-return', {
    body: JSON.stringify({
      ...payload,
      generateToken: false,
    }),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  return parseAuthResponse<ResolveCrossAppReturnUrlResponse>(response);
}
