import { getInternalApiClient, type InternalApiClientOptions } from './client';
import { InternalApiError, parseInternalApiError } from './internal-api-error';

/** Stable reasons the server refuses a Live start. Clients map them to copy. */
export const LIVE_BLOCK_REASONS = [
  'plan_required',
  'credits_exhausted',
  'limit_reached',
  'role_not_allowed',
  'paused',
] as const;

export type LiveBlockReason = (typeof LIVE_BLOCK_REASONS)[number];

export interface LiveEligibilityParams {
  plans: string[];
  balance?: number;
  minimumCredits?: number;
  resetAt?: string;
}

export interface LiveEligibilityResponse {
  eligible: boolean;
  reason: LiveBlockReason | null;
  tier: string | null;
  billing: { name: string | null; personal: boolean } | null;
  params: LiveEligibilityParams;
}

export interface LiveEligibilityQuery {
  wsId: string;
  creditSource: 'personal' | 'workspace';
  creditWsId?: string;
}

/** A token request refused for a stable reason, carrying the same wire shape. */
export class LiveBlockedError extends InternalApiError {
  constructor(
    public readonly eligibility: LiveEligibilityResponse & {
      reason: LiveBlockReason;
    },
    status: number,
    code?: string,
    retryAfter?: number
  ) {
    super('Live is not available for this account.', status, code, retryAfter);
    this.name = 'LiveBlockedError';
  }
}

export function isLiveBlockReason(value: unknown): value is LiveBlockReason {
  return (
    typeof value === 'string' &&
    (LIVE_BLOCK_REASONS as readonly string[]).includes(value)
  );
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/** Narrows an untrusted body to the eligibility wire shape. */
export function readLiveEligibility(
  data: unknown
): LiveEligibilityResponse | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  if (typeof body.eligible !== 'boolean') return null;
  const reason = isLiveBlockReason(body.reason) ? body.reason : null;
  if (!body.eligible && !reason) return null;
  const rawBilling = body.billing as Record<string, unknown> | null;
  const rawParams = (body.params ?? {}) as Record<string, unknown>;
  return {
    eligible: body.eligible,
    reason: body.eligible ? null : reason,
    tier: typeof body.tier === 'string' ? body.tier : null,
    billing:
      rawBilling && typeof rawBilling === 'object'
        ? {
            name: typeof rawBilling.name === 'string' ? rawBilling.name : null,
            personal: rawBilling.personal === true,
          }
        : null,
    params: {
      plans: Array.isArray(rawParams.plans)
        ? rawParams.plans.filter((plan): plan is string => {
            return typeof plan === 'string';
          })
        : [],
      balance: finiteNumber(rawParams.balance),
      minimumCredits: finiteNumber(rawParams.minimumCredits),
      resetAt:
        typeof rawParams.resetAt === 'string' ? rawParams.resetAt : undefined,
    },
  };
}

/**
 * Converts a failed Live token response into a [LiveBlockedError] when the
 * body names a stable block reason, or the generic internal API error.
 */
export async function parseLiveTokenError(response: Response) {
  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    body = null;
  }
  const eligibility = readLiveEligibility(body);
  if (eligibility && !eligibility.eligible && eligibility.reason) {
    const code =
      typeof (body as { code?: unknown }).code === 'string'
        ? (body as { code: string }).code
        : undefined;
    const retryAfter = Number(response.headers?.get?.('retry-after'));
    return new LiveBlockedError(
      { ...eligibility, reason: eligibility.reason },
      response.status,
      code,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
    );
  }
  return parseInternalApiError(response);
}

/** Pre-check for the Live start control; reserves nothing. */
export async function getLiveEligibility(
  query: LiveEligibilityQuery,
  options: InternalApiClientOptions = {}
) {
  const data = await getInternalApiClient(options).json<unknown>(
    '/api/v1/live/eligibility',
    {
      query: {
        wsId: query.wsId,
        creditSource: query.creditSource,
        ...(query.creditWsId ? { creditWsId: query.creditWsId } : {}),
      },
    }
  );
  const eligibility = readLiveEligibility(data);
  if (!eligibility) {
    throw new InternalApiError('Invalid Live eligibility response', 500);
  }
  return eligibility;
}
