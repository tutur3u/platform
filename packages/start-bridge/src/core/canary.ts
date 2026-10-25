/**
 * Canary mode (interface frozen in v0; behaviour lands in v0.2). A router in
 * front of an app sends a percentage of browsers to the native Start runtime
 * and the rest to the legacy deployment. Assignment is sticky per browser via
 * a cohort cookie, every response is tagged with the runtime that served it,
 * and an invalid or missing percentage fails closed to `legacy`.
 */
export type RuntimeCohort = 'native' | 'legacy';

/** Per-app environment variable holding the native share, `0`–`100`. */
export const CANARY_PERCENT_VARIABLE = 'TUTURUUU_NATIVE_CANARY_PERCENT';
/** Response header naming the runtime that served the request. */
export const RUNTIME_HEADER = 'x-tuturuuu-runtime';
/** Sticky cohort cookie (scoped to the app path under a basePath). */
export const COHORT_COOKIE = 'tuturuuu_runtime_cohort';

export interface CanaryInput {
  /** Raw `TUTURUUU_NATIVE_CANARY_PERCENT` value. */
  percent: string | undefined;
  /** Existing cohort cookie value, if any. */
  cookie?: string | null;
  /** Operator override (staging/diagnostics only); wins when valid. */
  force?: string | null;
  /** Uniform `[0, 100)` draw for a new browser; injectable for tests. */
  draw?: () => number;
}

export interface CanaryDecision {
  cohort: RuntimeCohort;
  reason: 'forced' | 'disabled' | 'cookie' | 'drawn';
  /** Whether the response must (re)write the cohort cookie. */
  persist: boolean;
  percent: number;
}

/** `0`–`100` integer; anything else (including blank) is `0`. */
export function parseCanaryPercent(value: string | undefined): number {
  if (value === undefined || !/^\s*\d{1,3}\s*$/u.test(value)) return 0;
  const percent = Number(value);
  return percent >= 0 && percent <= 100 ? percent : 0;
}

function isCohort(value: unknown): value is RuntimeCohort {
  return value === 'native' || value === 'legacy';
}

export function decideCohort(input: CanaryInput): CanaryDecision {
  const percent = parseCanaryPercent(input.percent);
  if (isCohort(input.force))
    return { cohort: input.force, reason: 'forced', persist: false, percent };
  if (percent === 0)
    return { cohort: 'legacy', reason: 'disabled', persist: false, percent };
  // A sticky cookie is honoured while the canary is on; raising or lowering
  // the percentage only affects browsers that have not been assigned yet.
  if (isCohort(input.cookie))
    return { cohort: input.cookie, reason: 'cookie', persist: false, percent };
  const draw = (input.draw ?? (() => Math.random() * 100))();
  return {
    cohort: draw < percent ? 'native' : 'legacy',
    reason: 'drawn',
    persist: true,
    percent,
  };
}

export interface TagOptions {
  /** Cookie path; the app base under a shared origin. */
  path?: string;
  secure?: boolean;
  /** Cohort cookie lifetime in seconds (default 30 days). */
  maxAge?: number;
}

/** Tags a response with its runtime and persists a newly drawn cohort. */
export function tagResponse(
  response: Response,
  decision: CanaryDecision,
  options: TagOptions = {}
): Response {
  const result = new Response(response.body, response);
  result.headers.set(RUNTIME_HEADER, decision.cohort);
  result.headers.append('Vary', 'Cookie');
  if (decision.persist)
    result.headers.append(
      'Set-Cookie',
      [
        `${COHORT_COOKIE}=${decision.cohort}`,
        `Path=${options.path || '/'}`,
        `Max-Age=${options.maxAge ?? 30 * 24 * 60 * 60}`,
        'HttpOnly',
        'SameSite=Lax',
        ...(options.secure ? ['Secure'] : []),
      ].join('; ')
    );
  return result;
}
