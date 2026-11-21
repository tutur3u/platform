import type { CalendarProviderAccountState } from '@tuturuuu/internal-api/calendar';
import { z } from 'zod';
import { classifyCalendarOAuthFailure } from './oauth-failure';

const httpStatus = z.union([
  z.number(),
  z
    .string()
    .regex(/^[1-5]\d{2}$/)
    .transform(Number),
]);
const providerError = z.object({
  message: z.string().optional(),
  cause: z.unknown().optional(),
  error: z.unknown().optional(),
  status: httpStatus.optional(),
  statusCode: httpStatus.optional(),
  code: z.union([z.string(), z.number()]).optional(),
  response: z
    .object({
      status: httpStatus.optional(),
      data: z.object({ error: z.unknown() }).optional(),
    })
    .optional(),
});
const scopeError = z.object({
  details: z.array(z.object({ reason: z.string().optional() })).optional(),
  errors: z.array(z.object({ reason: z.string().optional() })).optional(),
});

export function classifyCalendarProviderAccountStatus(
  provider: 'google' | 'microsoft',
  error: unknown
): Exclude<CalendarProviderAccountState, 'connected'> {
  const details = providerError.safeParse(error).data;
  const causes = [error];
  let detail = details;
  for (let depth = 0; depth < 4 && detail; depth++) {
    const cause = detail.cause ?? detail.error;
    if (!cause || causes.includes(cause)) break;
    causes.push(cause);
    detail = providerError.safeParse(cause).data;
  }

  let transient = false;
  let unauthorized = false;
  for (const cause of causes) {
    const details = providerError.safeParse(cause).data;
    const status =
      details?.response?.status ??
      details?.statusCode ??
      details?.status ??
      Number(details?.code);
    const oauth = classifyCalendarOAuthFailure(provider, cause);
    if (oauth?.kind === 'systemic') return 'configuration';
    const body = details?.response?.data?.error;
    const scope = scopeError.safeParse(body).data;
    if (
      body === 'invalid_scope' ||
      scope?.details?.some(
        ({ reason }) => reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT'
      ) ||
      scope?.errors?.some(({ reason }) => reason === 'insufficientPermissions')
    ) {
      return 'scope_required';
    }
    if (status === 410) return 'removed';
    if (
      (oauth?.kind === 'permanent' && oauth.reason !== 'unknown_permanent') ||
      (provider === 'google' &&
        /^(?:invalid_grant(?:\b|:)|No refresh token is set\.?$)/i.test(
          details?.message ?? ''
        ))
    ) {
      return 'reconnect_required';
    }
    transient ||= oauth?.kind === 'transient';
    unauthorized ||= status === 401;
  }
  if (unauthorized) return 'reconnect_required';
  return transient ? 'temporarily_unavailable' : 'status_unknown';
}
