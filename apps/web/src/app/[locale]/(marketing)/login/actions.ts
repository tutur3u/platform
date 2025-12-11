'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  checkOTPSendLimit,
  checkOTPVerifyLimit,
  checkPasswordLoginLimit,
  clearOTPVerifyFailures,
  clearPasswordLoginFailures,
  extractIPFromHeaders,
  recordOTPVerifyFailure,
  recordPasswordLoginFailure,
} from '@tuturuuu/utils/abuse-protection';
import {
  checkEmailInfrastructureBlocked,
  checkIfUserExists,
  generateRandomPassword,
  validateEmail,
  validateOtp,
} from '@tuturuuu/utils/email/server';
import { headers } from 'next/headers';

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
    const { email, locale, captchaToken } = input;

    // Get IP address for abuse tracking
    const headersList = await headers();
    const ipAddress = extractIPFromHeaders(headersList);

    // Check rate limits and IP blocks
    const abuseCheck = await checkOTPSendLimit(ipAddress, email);
    if (!abuseCheck.allowed) {
      return {
        error:
          abuseCheck.reason || 'Too many requests. Please try again later.',
        retryAfter: abuseCheck.retryAfter,
      };
    }

    const validatedEmail = await validateEmail(email);

    // Check if email is blocked by infrastructure (blacklist, bounces, complaints)
    const infrastructureCheck =
      await checkEmailInfrastructureBlocked(validatedEmail);
    if (infrastructureCheck.isBlocked) {
      console.log(
        `[SendOTP] Email blocked by infrastructure: ${infrastructureCheck.blockType} - ${infrastructureCheck.reason}`
      );
      // Return generic error to avoid information disclosure
      return {
        error: 'Unable to send verification code to this email address.',
      };
    }

    const userId = await checkIfUserExists({ email: validatedEmail });

    const sbAdmin = await createAdminClient();
    const supabase = await createClient();

    if (userId) {
      // Update existing user's metadata
      const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
        userId,
        {
          user_metadata: { locale, origin: 'TUTURUUU' },
        }
      );

      if (updateError) {
        return { error: updateError.message };
      }

      // Send OTP for existing user
      const { error } = await supabase.auth.signInWithOtp({
        email: validatedEmail,
        options: { data: { locale, origin: 'TUTURUUU' }, captchaToken },
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
        options: {
          data: { locale, origin: 'TUTURUUU' },
          captchaToken,
        },
      });

      if (error) {
        return { error: error.message };
      }
    }

    return { success: true };
  } catch (error) {
    console.error('SendOTP Server Action Error:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to send OTP',
    };
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
    const { email, otp, locale } = input;

    // Get IP address for abuse tracking
    const headersList = await headers();
    const ipAddress = extractIPFromHeaders(headersList);

    const validatedEmail = await validateEmail(email);

    // Check rate limits before verification
    const abuseCheck = await checkOTPVerifyLimit(ipAddress, validatedEmail);
    if (!abuseCheck.allowed) {
      return {
        error:
          abuseCheck.reason || 'Too many attempts. Please try again later.',
        retryAfter: abuseCheck.retryAfter,
      };
    }

    const validatedOtp = await validateOtp(otp);

    const sbAdmin = await createAdminClient();
    const supabase = await createClient();

    // Verify the OTP
    const { error } = await supabase.auth.verifyOtp({
      email: validatedEmail,
      token: validatedOtp,
      type: 'email',
    });

    if (error) {
      // Record the failure for abuse tracking
      void recordOTPVerifyFailure(ipAddress, validatedEmail);
      return { error: error.message };
    }

    // Clear failures on successful verification
    void clearOTPVerifyFailures(ipAddress, validatedEmail);

    // Get authenticated user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: 'User not found' };
    }

    // Update user metadata with locale
    const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: { locale, origin: 'TUTURUUU' },
      }
    );

    if (updateError) {
      return { error: updateError.message };
    }

    return { success: true };
  } catch (error) {
    console.error('VerifyOTP Server Action Error:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to verify OTP',
    };
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
    const { email, password, locale, captchaToken } = input;

    // Get IP address for abuse tracking
    const headersList = await headers();
    const ipAddress = extractIPFromHeaders(headersList);

    // Check rate limits and IP blocks before attempting login
    const abuseCheck = await checkPasswordLoginLimit(ipAddress);
    if (!abuseCheck.allowed) {
      return {
        error:
          abuseCheck.reason ||
          'Too many failed attempts. Please try again later.',
        retryAfter: abuseCheck.retryAfter,
      };
    }

    const validatedEmail = await validateEmail(email);

    const sbAdmin = await createAdminClient();
    const supabase = await createClient();

    // Attempt to sign in with password
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validatedEmail,
      password,
      options: { captchaToken },
    });

    if (error) {
      // Record the failure for abuse tracking
      void recordPasswordLoginFailure(ipAddress, validatedEmail);

      // Return generic error message to avoid email enumeration
      return {
        error: 'Invalid login credentials',
        remainingAttempts: abuseCheck.remainingAttempts
          ? abuseCheck.remainingAttempts - 1
          : undefined,
      };
    }

    // Clear failures on successful login
    void clearPasswordLoginFailures(ipAddress);

    // Update user metadata with locale
    if (data.user) {
      await sbAdmin.auth.admin.updateUserById(data.user.id, {
        user_metadata: { locale, origin: 'TUTURUUU' },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('PasswordLogin Server Action Error:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to login',
    };
  }
}
