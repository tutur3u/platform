import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { hashEmail } from '../abuse-protection';

export const validateEmail = async (email?: string | null) => {
  if (!email) throw 'Email is required';

  const regex = /\S+@\S+\.\S+/;
  if (!regex.test(email)) throw 'Email is invalid';

  return email.toLowerCase();
};

export interface EmailInfrastructureBlockResult {
  isBlocked: boolean;
  reason?: string;
  blockType?: 'blacklist' | 'bounce' | 'complaint';
}

/**
 * Check if an email is blocked by infrastructure.
 * This checks both:
 * 1. Email blacklist (blocked emails/domains)
 * 2. Email bounce/complaint history (hard bounces, spam complaints)
 *
 * Use this before sending OTP or transactional emails to avoid
 * sending to known-bad addresses and hurting sender reputation.
 */
export const checkEmailInfrastructureBlocked = async (
  email: string
): Promise<EmailInfrastructureBlockResult> => {
  try {
    const sbAdmin = await createAdminClient();
    const normalizedEmail = email.toLowerCase();
    const emailHash = hashEmail(normalizedEmail);

    // Check email blacklist first (direct blocks)
    const { data: isBlacklisted, error: blacklistError } = await sbAdmin.rpc(
      'check_email_blocked',
      { p_email: normalizedEmail }
    );

    if (blacklistError) {
      console.error(
        '[EmailInfrastructureCheck] Blacklist check error:',
        blacklistError
      );
      // Fail open - don't block if we can't check
    } else if (isBlacklisted) {
      console.log(
        `[EmailInfrastructureCheck] Email ${normalizedEmail} is blacklisted`
      );
      return {
        isBlocked: true,
        reason: 'Email address is blocked',
        blockType: 'blacklist',
      };
    }

    // Check bounce/complaint status
    const { data: bounceStatus, error: bounceError } = await sbAdmin.rpc(
      'check_email_bounce_status',
      { p_email_hash: emailHash }
    );

    if (bounceError) {
      console.error(
        '[EmailInfrastructureCheck] Bounce check error:',
        bounceError
      );
      // Fail open - don't block if we can't check
    } else if (bounceStatus && bounceStatus.length > 0) {
      const status = bounceStatus[0];
      if (status?.is_blocked) {
        console.log(
          `[EmailInfrastructureCheck] Email ${normalizedEmail} blocked due to bounces/complaints`
        );
        return {
          isBlocked: true,
          reason: status.block_reason || 'Email has delivery issues',
          blockType:
            status.complaint_count && status.complaint_count > 0
              ? 'complaint'
              : 'bounce',
        };
      }
    }

    return { isBlocked: false };
  } catch (error) {
    console.error('[EmailInfrastructureCheck] Unexpected error:', error);
    // Fail open - don't block if we can't check
    return { isBlocked: false };
  }
};

export const validateOtp = async (otp?: string | null) => {
  if (!otp) throw 'OTP is required';

  const regex = /^\d{6}$/;
  if (!regex.test(otp)) throw 'OTP is invalid';

  return otp;
};

export const checkIfUserExists = async ({ email }: { email: string }) => {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('user_private_details')
    .select('id:user_id')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error.message;
  return data?.id;
};

export const generateRandomPassword = () => {
  const length = 16;
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';

  let temp = '';
  for (let i = 0, n = charset.length; i < length; ++i)
    temp += charset.charAt(Math.floor(Math.random() * n));

  return temp;
};
