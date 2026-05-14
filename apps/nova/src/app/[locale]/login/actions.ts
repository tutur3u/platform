'use server';

export interface SendOtpInput {
  email: string;
}

export interface SendOtpResult {
  success?: boolean;
  error?: string;
}

export interface VerifyOtpInput {
  email: string;
  otp: string;
}

export interface VerifyOtpResult {
  success?: boolean;
  error?: string;
}

export async function sendOtpAction(
  _input: SendOtpInput
): Promise<SendOtpResult> {
  return {
    error: 'Nova sign-in is handled by central Tuturuuu auth.',
  };
}

export async function verifyOtpAction(
  _input: VerifyOtpInput
): Promise<VerifyOtpResult> {
  return {
    error: 'Nova sign-in is handled by central Tuturuuu auth.',
  };
}
