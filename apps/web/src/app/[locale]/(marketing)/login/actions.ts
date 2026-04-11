'use server';

import { headers } from 'next/headers';
import { sendOtp, toOtpErrorResult, verifyOtp } from '@/lib/auth/otp';
import { passwordLogin, toPasswordLoginErrorResult } from '@/lib/auth/password';

export interface SendOtpInput {
  email: string;
  locale: string;
  captchaToken?: string;
}

export interface SendOtpResult {
  success?: boolean;
  error?: string;
  retryAfter?: number;
}

export interface VerifyOtpInput {
  email: string;
  otp: string;
  locale: string;
  captchaToken?: string;
}

export interface VerifyOtpResult {
  success?: boolean;
  error?: string;
  retryAfter?: number;
}

/**
 * Server action to send OTP to user's email
 * Creates new user with random password if user doesn't exist
 */
export async function sendOtpAction(
  input: SendOtpInput
): Promise<SendOtpResult> {
  try {
    const headersList = await headers();
    const result = await sendOtp(
      {
        ...input,
        client: 'web',
      },
      {
        client: 'web',
        endpoint: '/login/actions/send-otp',
        headers: headersList,
      }
    );

    return result.body as SendOtpResult;
  } catch (error) {
    return toOtpErrorResult(error, 'send').body as SendOtpResult;
  }
}

/**
 * Server action to verify OTP code
 * Updates user metadata with locale after successful verification
 */
export async function verifyOtpAction(
  input: VerifyOtpInput
): Promise<VerifyOtpResult> {
  try {
    const headersList = await headers();
    const result = await verifyOtp(
      {
        ...input,
        client: 'web',
      },
      {
        client: 'web',
        endpoint: '/login/actions/verify-otp',
        headers: headersList,
      }
    );

    return result.body as VerifyOtpResult;
  } catch (error) {
    return toOtpErrorResult(error, 'verify').body as VerifyOtpResult;
  }
}

export interface PasswordLoginInput {
  email: string;
  password: string;
  locale: string;
  captchaToken?: string;
}

export interface PasswordLoginResult {
  success?: boolean;
  error?: string;
  retryAfter?: number;
  remainingAttempts?: number;
}

/**
 * Server action to login with password
 * Includes abuse protection with IP blocking
 */
export async function passwordLoginAction(
  input: PasswordLoginInput
): Promise<PasswordLoginResult> {
  try {
    const headersList = await headers();
    const result = await passwordLogin(
      {
        ...input,
        client: 'web',
      },
      {
        client: 'web',
        endpoint: '/login/actions/password-login',
        headers: headersList,
      }
    );

    return result.body as PasswordLoginResult;
  } catch (error) {
    return toPasswordLoginErrorResult(error).body as PasswordLoginResult;
  }
}
