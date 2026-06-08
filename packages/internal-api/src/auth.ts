import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type InternalOtpClient = 'mobile' | 'tulearn' | 'web';
export type InternalOtpPlatform = 'android' | 'ios';

export interface OtpSettingsResponse {
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

async function parseAuthResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as T | null;

  if (payload) {
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
