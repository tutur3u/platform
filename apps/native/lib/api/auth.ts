import { apiEndpoints } from '@/lib/config/api';

import { postJson } from './client';

export type AuthSessionPayload = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
};

export type SendOtpInput = {
  email: string;
  locale?: string;
  deviceId?: string;
};

export type SendOtpResponse = {
  success?: boolean;
  error?: string;
  retryAfter?: number;
};

export type VerifyOtpInput = {
  email: string;
  otp: string;
  locale?: string;
  deviceId?: string;
};

export type VerifyOtpResponse = {
  success?: boolean;
  error?: string;
  session?: AuthSessionPayload;
};

export type PasswordLoginInput = {
  email: string;
  password: string;
  locale?: string;
  deviceId?: string;
};

export type PasswordLoginResponse = {
  success?: boolean;
  error?: string;
  retryAfter?: number;
  remainingAttempts?: number;
  session?: AuthSessionPayload;
};

export async function sendOtpApi(
  input: SendOtpInput
): Promise<SendOtpResponse> {
  const result = await postJson<SendOtpResponse>(
    apiEndpoints.auth.sendOtp,
    input
  );

  if (result.error) {
    return {
      error: result.error.message,
      retryAfter: result.error.retryAfter,
    };
  }

  return result.data ?? { error: 'Failed to send OTP' };
}

export async function verifyOtpApi(
  input: VerifyOtpInput
): Promise<VerifyOtpResponse> {
  const result = await postJson<VerifyOtpResponse>(
    apiEndpoints.auth.verifyOtp,
    input
  );

  if (result.error) {
    return { error: result.error.message };
  }

  return result.data ?? { error: 'Failed to verify OTP' };
}

export async function passwordLoginApi(
  input: PasswordLoginInput
): Promise<PasswordLoginResponse> {
  const result = await postJson<PasswordLoginResponse>(
    apiEndpoints.auth.passwordLogin,
    input
  );

  if (result.error) {
    return {
      error: result.error.message,
      retryAfter: result.error.retryAfter,
    };
  }

  return result.data ?? { error: 'Failed to login' };
}
