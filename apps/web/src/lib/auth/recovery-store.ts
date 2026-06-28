import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  checkEmailInfrastructureBlocked,
  checkIfUserExists,
  validateEmail,
} from '@tuturuuu/utils/email/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

export const AUTH_RECOVERY_TOKEN_TTL_MINUTES = 15;
export const AUTH_RECOVERY_GENERIC_ERROR =
  'Unable to complete account recovery right now.';
export const AUTH_RECOVERY_FALLBACK_LOCALE = 'en';

type QueryResult = {
  count?: number | null;
  data: unknown;
  error: { message?: string } | null;
};

type QueryBuilder = PromiseLike<QueryResult> & {
  eq(column: string, value: unknown): QueryBuilder;
  gt(column: string, value: unknown): QueryBuilder;
  insert(value: Record<string, unknown>): QueryBuilder;
  is(column: string, value: unknown): QueryBuilder;
  limit(value: number): QueryBuilder;
  maybeSingle(): Promise<QueryResult>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder;
  select(columns?: string, options?: { count?: 'exact' }): QueryBuilder;
  single(): Promise<QueryResult>;
  update(value: Record<string, unknown>): QueryBuilder;
};

export type PrivateSchemaClient = {
  from(table: string): QueryBuilder;
  rpc(fn: string, args?: Record<string, unknown>): Promise<QueryResult>;
};

export interface AuthRecoveryOverrideSummary {
  allowNormalLogin: boolean;
  allowRecoveryEmail: boolean;
  createdAt: string;
  createdBy: string | null;
  email: string;
  expiresAt: string;
  id: string;
  lastUsedAt: string | null;
  reason?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revokeReason?: string | null;
}

export interface AuthRecoverySnapshot {
  activeOverride: AuthRecoveryOverrideSummary | null;
  email: string | null;
  emailInfrastructure: {
    blockType: string | null;
    isBlocked: boolean;
    reason: string | null;
  } | null;
  events: AuthRecoveryEventSummary[];
  overrides: AuthRecoveryOverrideSummary[];
  recentAuthEvents: Record<string, unknown>[];
  user: {
    bannedUntil: string | null;
    createdAt: string | null;
    emailConfirmedAt: string | null;
    id: string;
    lastSignInAt: string | null;
  } | null;
}

export interface AuthRecoveryEventSummary {
  actorUserId: string | null;
  createdAt: string;
  email: string;
  eventType: string;
  id: string;
  metadata: Record<string, unknown>;
  overrideId: string | null;
  tokenId: string | null;
}

export function getPrivateSchema(client: unknown): PrivateSchemaClient {
  return (client as { schema(schema: string): unknown }).schema(
    'private'
  ) as PrivateSchemaClient;
}

function getPublicTable(client: unknown, table: string): QueryBuilder {
  return (client as { from(table: string): QueryBuilder }).from(table);
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          row !== null && typeof row === 'object' && !Array.isArray(row)
      )
    : [];
}

function toStringOrNull(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function toOverrideSummary(row: Record<string, unknown>) {
  return {
    allowNormalLogin: row.allow_normal_login === true,
    allowRecoveryEmail: row.allow_recovery_email === true,
    createdAt: String(row.created_at ?? ''),
    createdBy: toStringOrNull(row.created_by),
    email: String(row.email ?? ''),
    expiresAt: String(row.expires_at ?? ''),
    id: String(row.id ?? ''),
    lastUsedAt: toStringOrNull(row.last_used_at),
    reason: toStringOrNull(row.reason),
    revokedAt: toStringOrNull(row.revoked_at),
    revokedBy: toStringOrNull(row.revoked_by),
    revokeReason: toStringOrNull(row.revoke_reason),
  } satisfies AuthRecoveryOverrideSummary;
}

function toEventSummary(row: Record<string, unknown>) {
  return {
    actorUserId: toStringOrNull(row.actor_user_id),
    createdAt: String(row.created_at ?? ''),
    email: String(row.email ?? ''),
    eventType: String(row.event_type ?? ''),
    id: String(row.id ?? ''),
    metadata: asRecord(row.metadata),
    overrideId: toStringOrNull(row.override_id),
    tokenId: toStringOrNull(row.token_id),
  } satisfies AuthRecoveryEventSummary;
}

export async function normalizeAuthRecoveryEmail(email: string) {
  return validateEmail(email.trim());
}

export function sanitizeAuthRecoveryRedirectPath(
  value: string | null | undefined,
  locale = AUTH_RECOVERY_FALLBACK_LOCALE
) {
  if (!value) return `/${locale}/onboarding`;

  try {
    const parsed = new URL(value, 'https://tuturuuu.local');
    if (parsed.origin !== 'https://tuturuuu.local') {
      return `/${locale}/onboarding`;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return `/${locale}/onboarding`;
  }
}

export async function getActiveAuthRecoveryOverride(email: string) {
  const normalizedEmail = await normalizeAuthRecoveryEmail(email);
  const admin = await createAdminClient({ noCookie: true });
  const { data, error } = await getPrivateSchema(admin).rpc(
    'get_active_auth_recovery_override',
    { p_email: normalizedEmail }
  );

  if (error) {
    serverLogger.warn('Failed to load active auth recovery override', {
      email: normalizedEmail,
      message: error.message,
    });
    return null;
  }

  const [row] = asArray(data);
  return row ? toOverrideSummary(row) : null;
}

export async function logAuthRecoveryEvent(input: {
  actorUserId?: string | null;
  email: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  overrideId?: string | null;
  tokenId?: string | null;
}) {
  const admin = await createAdminClient({ noCookie: true });
  const normalizedEmail = await normalizeAuthRecoveryEmail(input.email);
  const { error } = await getPrivateSchema(admin)
    .from('auth_recovery_events')
    .insert({
      actor_user_id: input.actorUserId ?? null,
      email: normalizedEmail,
      event_type: input.eventType,
      metadata: input.metadata ?? {},
      override_id: input.overrideId ?? null,
      token_id: input.tokenId ?? null,
    });

  if (error) {
    serverLogger.warn('Failed to write auth recovery event', {
      eventType: input.eventType,
      message: error.message,
    });
  }
}

export async function listAuthRecoverySnapshot(email?: string | null) {
  const normalizedEmail = email
    ? await normalizeAuthRecoveryEmail(email)
    : null;
  const admin = await createAdminClient({ noCookie: true });
  const privateDb = getPrivateSchema(admin);

  let overridesQuery = privateDb
    .from('auth_recovery_overrides')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  let eventsQuery = privateDb
    .from('auth_recovery_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (normalizedEmail) {
    overridesQuery = overridesQuery.eq('email', normalizedEmail);
    eventsQuery = eventsQuery.eq('email', normalizedEmail);
  }

  const [overridesResult, eventsResult, recentAuthEventsResult] =
    await Promise.all([
      overridesQuery,
      eventsQuery,
      normalizedEmail
        ? getPublicTable(admin, 'abuse_events')
            .select('id, created_at, event_type, ip_address, email, metadata')
            .eq('email', normalizedEmail)
            .order('created_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [], error: null }),
    ]);

  if (overridesResult.error) throw new Error(overridesResult.error.message);
  if (eventsResult.error) throw new Error(eventsResult.error.message);
  if (recentAuthEventsResult.error) {
    throw new Error(recentAuthEventsResult.error.message);
  }

  const overrides = asArray(overridesResult.data).map(toOverrideSummary);
  const activeOverride =
    overrides.find(
      (override) =>
        !override.revokedAt &&
        new Date(override.expiresAt).getTime() > Date.now()
    ) ?? null;
  const emailInfrastructure = normalizedEmail
    ? await checkEmailInfrastructureBlocked(normalizedEmail)
    : null;
  const userId = normalizedEmail
    ? await checkIfUserExists({ email: normalizedEmail }).catch(() => null)
    : null;
  const authUser = userId
    ? await admin.auth.admin.getUserById(userId).catch(() => null)
    : null;

  return {
    activeOverride,
    email: normalizedEmail,
    emailInfrastructure: emailInfrastructure
      ? {
          blockType: emailInfrastructure.blockType ?? null,
          isBlocked: emailInfrastructure.isBlocked,
          reason: emailInfrastructure.reason ?? null,
        }
      : null,
    events: asArray(eventsResult.data).map(toEventSummary),
    overrides,
    recentAuthEvents: asArray(recentAuthEventsResult.data),
    user: authUser?.data?.user
      ? {
          bannedUntil: authUser.data.user.banned_until ?? null,
          createdAt: authUser.data.user.created_at ?? null,
          emailConfirmedAt: authUser.data.user.email_confirmed_at ?? null,
          id: authUser.data.user.id,
          lastSignInAt: authUser.data.user.last_sign_in_at ?? null,
        }
      : userId
        ? {
            bannedUntil: null,
            createdAt: null,
            emailConfirmedAt: null,
            id: userId,
            lastSignInAt: null,
          }
        : null,
  } satisfies AuthRecoverySnapshot;
}

export { ROOT_WORKSPACE_ID as AUTH_RECOVERY_ROOT_WORKSPACE_ID };
