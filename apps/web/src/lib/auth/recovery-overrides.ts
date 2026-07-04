import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  extractIPFromHeaders,
  resetOtpLimitsForEmail,
} from '@tuturuuu/utils/abuse-protection';
import {
  type AuthRecoveryOverrideSummary,
  asRecord,
  getPrivateSchema,
  logAuthRecoveryEvent,
  normalizeAuthRecoveryEmail,
  toOverrideSummary,
} from './recovery-store';

export const AUTH_RECOVERY_DEFAULT_DAYS = 7;

export interface CreateAuthRecoveryOverrideInput {
  actorUserId: string;
  allowNormalLogin?: boolean;
  allowRecoveryEmail?: boolean;
  clearEmailScoped?: boolean;
  clearRelatedIpBlocks?: boolean;
  clearRelatedIpCounters?: boolean;
  email: string;
  expiresAt?: string;
  reason: string;
  request: Pick<Request, 'headers'>;
}

export async function createAuthRecoveryOverride({
  actorUserId,
  allowNormalLogin = true,
  allowRecoveryEmail = true,
  clearEmailScoped = true,
  clearRelatedIpBlocks = false,
  clearRelatedIpCounters = true,
  email,
  expiresAt,
  reason,
  request,
}: CreateAuthRecoveryOverrideInput): Promise<AuthRecoveryOverrideSummary> {
  if (!allowNormalLogin && !allowRecoveryEmail) {
    throw new Error('At least one recovery mode is required');
  }

  const normalizedEmail = await normalizeAuthRecoveryEmail(email);
  const admin = await createAdminClient({ noCookie: true });
  const privateDb = getPrivateSchema(admin);
  const resolvedExpiresAt =
    expiresAt ??
    new Date(
      Date.now() + AUTH_RECOVERY_DEFAULT_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

  await privateDb
    .from('auth_recovery_overrides')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: actorUserId,
      revoke_reason: 'Superseded by a newer auth recovery override',
    })
    .eq('email', normalizedEmail)
    .is('revoked_at', null);

  const { data, error } = await privateDb
    .from('auth_recovery_overrides')
    .insert({
      allow_normal_login: allowNormalLogin,
      allow_recovery_email: allowRecoveryEmail,
      created_by: actorUserId,
      email: normalizedEmail,
      expires_at: resolvedExpiresAt,
      reason: reason.trim(),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  const override = toOverrideSummary(asRecord(data));
  await logAuthRecoveryEvent({
    actorUserId,
    email: normalizedEmail,
    eventType: 'override_created',
    metadata: {
      allowNormalLogin,
      allowRecoveryEmail,
      expiresAt: resolvedExpiresAt,
    },
    overrideId: override.id,
  });

  await resetOtpLimitsForEmail({
    adminIpAddress: extractIPFromHeaders(request.headers),
    adminUserId: actorUserId,
    clearEmailScoped,
    clearRelatedIpBlocks,
    clearRelatedIpCounters,
    email: normalizedEmail,
    reason: `Auth recovery override: ${reason.trim()}`,
  });

  return override;
}

export async function revokeAuthRecoveryOverride(input: {
  actorUserId: string;
  overrideId: string;
  reason?: string | null;
}): Promise<AuthRecoveryOverrideSummary> {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await getPrivateSchema(admin)
    .from('auth_recovery_overrides')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: input.actorUserId,
      revoke_reason: input.reason?.trim() || 'Revoked by infrastructure admin',
    })
    .eq('id', input.overrideId)
    .is('revoked_at', null)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Recovery override not found');

  const override = toOverrideSummary(asRecord(data));
  await logAuthRecoveryEvent({
    actorUserId: input.actorUserId,
    email: override.email,
    eventType: 'override_revoked',
    metadata: { reason: input.reason ?? null },
    overrideId: override.id,
  });
  return override;
}
