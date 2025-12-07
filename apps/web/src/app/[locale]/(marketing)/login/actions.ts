'use server';

import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  checkIfUserExists,
  generateRandomPassword,
  validateEmail,
  validateOtp,
} from '@tuturuuu/utils/email/server';

export interface SendOtpInput {
  email: string;
  locale: string;
  captchaToken?: string;
}

export interface SendOtpResult {
  success?: boolean;
  error?: string;
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
    const validatedEmail = await validateEmail(email);

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

    const validatedEmail = await validateEmail(email);
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
      return { error: error.message };
    }

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
