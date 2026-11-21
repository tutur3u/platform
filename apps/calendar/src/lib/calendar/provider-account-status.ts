import type { CalendarProviderAccountState } from '@tuturuuu/internal-api/calendar';
import { z } from 'zod';
import { classifyCalendarOAuthFailure } from './oauth-failure';

const providerError = z.object({
  status: z.number().optional(),
  statusCode: z.number().optional(),
  code: z.union([z.string(), z.number()]).optional(),
  response: z
    .object({
      status: z.number().optional(),
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
  const status =
    details?.response?.status ??
    details?.statusCode ??
    details?.status ??
    details?.code;
  const oauth = classifyCalendarOAuthFailure(provider, error);
  if (oauth?.kind === 'systemic' || oauth?.kind === 'transient') {
    return 'temporarily_unavailable';
  }

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
  if (oauth?.kind === 'permanent' || status === 401)
    return 'reconnect_required';
  return 'temporarily_unavailable';
}
