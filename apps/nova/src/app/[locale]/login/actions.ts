'use server';

import { createClient } from '@tuturuuu/supabase/next/server';
import {
  checkEmailInfrastructureBlocked,
  checkIfUserExists,
  generateRandomPassword,
  validateEmail,
  validateOtp,
} from '@tuturuuu/utils/email/server';

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

/**
 * Server action to send OTP to user's email (Nova app)
 * Creates new user with random password if user doesn't exist
 */
export async function sendOtpAction(
  input: SendOtpInput
): Promise<SendOtpResult> {
  try {
    const { email } = input;
    const validatedEmail = await validateEmail(email);

    // Check if email is blocked by infrastructure (blacklist, bounces, complaints)
    const infrastructureCheck =
      await checkEmailInfrastructureBlocked(validatedEmail);
    if (infrastructureCheck.isBlocked) {
      console.log(
        `[SendOTP Nova] Email blocked by infrastructure: ${infrastructureCheck.blockType} - ${infrastructureCheck.reason}`
      );
      // Return generic error to avoid information disclosure
      return {
        error: 'Unable to send verification code to this email address.',
      };
    }

    const userExists = await checkIfUserExists({ email: validatedEmail });
    const supabase = await createClient();

    if (userExists) {
      // Send OTP for existing user
      const { error } = await supabase.auth.signInWithOtp({
        email: validatedEmail,
      });

      if (error) {
        return { error: error.message };
      }
    } else {
      // Create new user with random password
      const randomPassword = generateRandomPassword();

      const { error } = await supabase.auth.signUp({
        email: validatedEmail,
        password: randomPassword,
      });

      if (error) {
        return { error: error.message };
      }
    }

    return { success: true };
  } catch (error) {
    console.error('SendOTP Server Action Error (Nova):', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to send OTP',
    };
  }
}

/**
 * Server action to verify OTP code (Nova app)
 */
export async function verifyOtpAction(
  input: VerifyOtpInput
): Promise<VerifyOtpResult> {
  try {
    const { email, otp } = input;

    const validatedEmail = await validateEmail(email);
    const validatedOtp = await validateOtp(otp);

    const supabase = await createClient();

    // Verify the OTP
    const { error } = await supabase.auth.verifyOtp({
      email: validatedEmail,
      token: validatedOtp,
      type: 'email',
    });

    if (error) {
      return { error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('VerifyOTP Server Action Error (Nova):', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to verify OTP',
    };
  }
}
