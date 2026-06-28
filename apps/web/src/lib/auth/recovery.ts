import { sendSystemEmail } from '@tuturuuu/email-service';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  extractIPFromHeaders,
  extractUserAgentFromHeaders,
} from '@tuturuuu/utils/abuse-protection';
import { resolveAuthRedirectOrigin } from '@/app/[locale]/(marketing)/login/auth-redirect-origin';
import {
  createAuthRecoveryCode,
  createAuthRecoveryToken,
  hashAuthRecoveryCode,
  hashAuthRecoveryMetadata,
  hashAuthRecoveryToken,
} from './recovery-crypto';
import { renderAuthRecoveryEmail } from './recovery-email';
import { issueAuthRecoverySession } from './recovery-session';
import {
  AUTH_RECOVERY_FALLBACK_LOCALE,
  AUTH_RECOVERY_TOKEN_TTL_MINUTES,
  type AuthRecoveryOverrideSummary,
  asArray,
  asRecord,
  getAuthRecoveryLocalizedPath,
  getPrivateSchema,
  logAuthRecoveryEvent,
  normalizeAuthRecoveryEmail,
  sanitizeAuthRecoveryRedirectPath,
  toOverrideSummary,
} from './recovery-store';

export * from './recovery-overrides';
export * from './recovery-session';
export * from './recovery-store';

export interface SendAuthRecoveryEmailInput {
  actorUserId: string;
  locale?: string;
  next?: string | null;
  overrideId: string;
  request: Pick<Request, 'headers' | 'url'>;
}

export interface ConsumeAuthRecoveryCredentialInput {
  code?: string | null;
  email?: string | null;
  next?: string | null;
  request: Pick<Request, 'headers' | 'url'>;
  token?: string | null;
}

export function getAuthRecoveryRequestOrigin(
  request: Pick<Request, 'headers' | 'url'>
) {
  return resolveAuthRedirectOrigin({
    currentOrigin: new URL(request.url).origin,
  });
}

export function buildRecoveryUrls(input: {
  email: string;
  locale?: string;
  next?: string | null;
  request: Pick<Request, 'headers' | 'url'>;
  token: string;
}) {
  const locale = input.locale || AUTH_RECOVERY_FALLBACK_LOCALE;
  const origin = getAuthRecoveryRequestOrigin(input.request);
  const next = sanitizeAuthRecoveryRedirectPath(input.next, locale);
  const codeUrl = new URL(
    getAuthRecoveryLocalizedPath('/auth/recovery', locale),
    origin
  );
  codeUrl.searchParams.set('email', input.email);
  codeUrl.searchParams.set('next', next);

  const confirmUrl = new URL(
    getAuthRecoveryLocalizedPath('/auth/recovery/confirm', locale),
    origin
  );
  confirmUrl.searchParams.set('token', input.token);
  confirmUrl.searchParams.set('next', next);

  return { codeUrl: codeUrl.toString(), confirmUrl: confirmUrl.toString() };
}

async function getActiveOverrideById(
  overrideId: string
): Promise<AuthRecoveryOverrideSummary> {
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await getPrivateSchema(admin)
    .from('auth_recovery_overrides')
    .select('*')
    .eq('id', overrideId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Active recovery override not found');

  return toOverrideSummary(asRecord(data));
}

export async function sendAuthRecoveryEmail({
  actorUserId,
  locale = AUTH_RECOVERY_FALLBACK_LOCALE,
  next,
  overrideId,
  request,
}: SendAuthRecoveryEmailInput) {
  const override = await getActiveOverrideById(overrideId);
  if (!override.allowRecoveryEmail) {
    throw new Error('Recovery email is disabled for this override');
  }

  const admin = await createAdminClient({ noCookie: true });
  const privateDb = getPrivateSchema(admin);
  const token = createAuthRecoveryToken();
  const code = createAuthRecoveryCode();
  const expiresAt = new Date(
    Date.now() + AUTH_RECOVERY_TOKEN_TTL_MINUTES * 60 * 1000
  ).toISOString();
  const { codeUrl, confirmUrl } = buildRecoveryUrls({
    email: override.email,
    locale,
    next,
    request,
    token,
  });

  const { data: tokenData, error: tokenError } = await privateDb
    .from('auth_recovery_tokens')
    .insert({
      code_hash: hashAuthRecoveryCode(override.email, code),
      created_by: actorUserId,
      email: override.email,
      expires_at: expiresAt,
      override_id: override.id,
      token_hash: hashAuthRecoveryToken(token),
    })
    .select('*')
    .single();

  if (tokenError) throw new Error(tokenError.message);
  const tokenId = String(asRecord(tokenData).id);
  const emailContent = renderAuthRecoveryEmail({
    code,
    codeUrl,
    confirmUrl,
    expiresInMinutes: AUTH_RECOVERY_TOKEN_TTL_MINUTES,
  });
  const sendResult = await sendSystemEmail(
    {
      content: {
        html: emailContent.html,
        subject: emailContent.subject,
        text: emailContent.text,
      },
      metadata: {
        entityId: tokenId,
        entityType: 'auth_recovery_token',
        ipAddress: extractIPFromHeaders(request.headers),
        templateType: 'auth-recovery',
        userAgent: extractUserAgentFromHeaders(request.headers) ?? undefined,
        userId: actorUserId,
      },
      recipients: { to: [override.email] },
    },
    { skipRecipientBlacklist: true }
  );

  if (!sendResult.success) {
    await logAuthRecoveryEvent({
      actorUserId,
      email: override.email,
      eventType: 'recovery_email_send_failed',
      metadata: {
        auditId: sendResult.auditId ?? null,
        error: sendResult.error,
      },
      overrideId: override.id,
      tokenId,
    });
    throw new Error(sendResult.error || 'Failed to send recovery email');
  }

  await privateDb
    .from('auth_recovery_tokens')
    .update({
      email_audit_id: sendResult.auditId ?? null,
      sent_at: new Date().toISOString(),
    })
    .eq('id', tokenId);
  await logAuthRecoveryEvent({
    actorUserId,
    email: override.email,
    eventType: 'recovery_email_sent',
    metadata: {
      auditId: sendResult.auditId ?? null,
      messageId: sendResult.messageId ?? null,
    },
    overrideId: override.id,
    tokenId,
  });

  return { email: override.email, expiresAt, tokenId };
}

export async function consumeAuthRecoveryCredential({
  code,
  email,
  next,
  request,
  token,
}: ConsumeAuthRecoveryCredentialInput) {
  const normalizedEmail = email
    ? await normalizeAuthRecoveryEmail(email)
    : null;
  const tokenHash = token ? hashAuthRecoveryToken(token) : null;
  const codeHash =
    normalizedEmail && code
      ? hashAuthRecoveryCode(normalizedEmail, code)
      : null;
  const admin = await createAdminClient({ noCookie: true });
  const consumed = await getPrivateSchema(admin).rpc(
    'consume_auth_recovery_credential',
    {
      p_code_hash: codeHash,
      p_email: normalizedEmail,
      p_ip_hash: hashAuthRecoveryMetadata(
        extractIPFromHeaders(request.headers)
      ),
      p_token_hash: tokenHash,
      p_user_agent_hash: hashAuthRecoveryMetadata(
        extractUserAgentFromHeaders(request.headers)
      ),
    }
  );

  if (consumed.error) throw new Error(consumed.error.message);
  const [row] = asArray(consumed.data);
  if (!row) {
    if (normalizedEmail) {
      await logAuthRecoveryEvent({
        email: normalizedEmail,
        eventType: 'recovery_token_rejected',
        metadata: { method: tokenHash ? 'token' : 'code' },
      });
    }
    throw new Error('Invalid or expired recovery credential');
  }

  const consumedEmail = String(row.email);
  const overrideId = String(row.override_id);
  const tokenId = String(row.token_id);
  const consumedBy = String(row.consumed_by);
  const session = await issueAuthRecoverySession(consumedEmail, overrideId);
  await logAuthRecoveryEvent({
    email: consumedEmail,
    eventType:
      consumedBy === 'code'
        ? 'recovery_code_consumed'
        : 'recovery_token_consumed',
    metadata: { method: consumedBy },
    overrideId,
    tokenId,
  });

  return {
    email: consumedEmail,
    redirectTo: sanitizeAuthRecoveryRedirectPath(next),
    session,
  };
}
