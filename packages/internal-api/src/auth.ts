import { getInternalApiClient, type InternalApiClientOptions } from './client';

export type InternalOtpClient = 'mobile' | 'web';
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
