import {
  createAdminClient,
  createClient,
  createDetachedClient,
} from '@tuturuuu/supabase/next/server';
import { checkIfUserExists } from '@tuturuuu/utils/email/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getActiveAuthRecoveryOverride,
  logAuthRecoveryEvent,
} from './recovery-store';

export interface AuthRecoverySessionPayload {
  access_token: string;
  expires_at: number | null;
  expires_in: number;
  refresh_token: string;
  token_type: string;
}

async function ensureAuthRecoveryUser(email: string, overrideId: string) {
  const admin = await createAdminClient({ noCookie: true });
  const existingUserId = await checkIfUserExists({ email }).catch(() => null);

  if (existingUserId) {
    const { error } = await admin.auth.admin.updateUserById(existingUserId, {
      ban_duration: 'none',
      email_confirm: true,
      user_metadata: {
        auth_client: 'auth_recovery',
        origin: 'TUTURUUU_AUTH_RECOVERY',
        recovery_override_id: overrideId,
      },
    });
    if (error) throw new Error(error.message);

    await logAuthRecoveryEvent({
      email,
      eventType: 'supabase_user_unbanned',
      metadata: { userId: existingUserId },
      overrideId,
    });
    return;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      auth_client: 'auth_recovery',
      origin: 'TUTURUUU_AUTH_RECOVERY',
      recovery_override_id: overrideId,
    },
  });

  if (error || !data.user?.id) {
    throw new Error(error?.message || 'Failed to create recovery user');
  }

  await logAuthRecoveryEvent({
    email,
    eventType: 'supabase_user_created',
    metadata: { userId: data.user.id },
    overrideId,
  });
}

export async function issueAuthRecoverySession(
  email: string,
  overrideId: string
): Promise<AuthRecoverySessionPayload> {
  await ensureAuthRecoveryUser(email, overrideId);
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await admin.auth.admin.generateLink({
    email,
    options: {
      data: {
        auth_client: 'auth_recovery',
        origin: 'TUTURUUU_AUTH_RECOVERY',
        recovery_override_id: overrideId,
      },
    },
    type: 'magiclink',
  });

  if (error || !data?.properties?.action_link) {
    throw new Error(error?.message || 'Recovery magic link not generated');
  }

  const magicLinkUrl = new URL(data.properties.action_link);
  const tokenHash =
    magicLinkUrl.searchParams.get('token') ||
    magicLinkUrl.searchParams.get('token_hash');
  if (!tokenHash) throw new Error('Recovery magic link token hash not found');

  const detached = createDetachedClient();
  const { data: otpData, error: verifyError } = await detached.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (verifyError || !otpData.session) {
    throw new Error(verifyError?.message || 'Recovery session not created');
  }

  return {
    access_token: otpData.session.access_token,
    expires_at: otpData.session.expires_at ?? null,
    expires_in: otpData.session.expires_in,
    refresh_token: otpData.session.refresh_token,
    token_type: otpData.session.token_type,
  };
}

export async function setAuthRecoverySessionCookies(
  request: Pick<Request, 'headers' | 'url'>,
  session: AuthRecoverySessionPayload
) {
  const supabase = await createClient(request);
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw new Error(error.message);
}

export async function prepareNormalAuthRecoveryOverrideUse(input: {
  email: string;
  metadata?: Record<string, unknown>;
}) {
  const override = await getActiveAuthRecoveryOverride(input.email);
  if (!override?.allowNormalLogin) return null;

  await logAuthRecoveryEvent({
    email: override.email,
    eventType: 'normal_login_bypass_used',
    metadata: input.metadata,
    overrideId: override.id,
  });

  const userId = await checkIfUserExists({ email: override.email }).catch(
    () => null
  );
  if (userId) {
    const admin = await createAdminClient({ noCookie: true });
    const { error } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
      email_confirm: true,
    });
    if (error) {
      serverLogger.warn('Failed to unban auth recovery user', {
        message: error.message,
        overrideId: override.id,
      });
    }
  }

  return override;
}
