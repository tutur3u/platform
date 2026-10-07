import { Effect } from '@tuturuuu/utils/effect';
import { z } from 'zod';
import { StaffReadError } from '../staff-access';

const eligibility = z.object({ eligible: z.literal(true) }).strict();
const headers = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
};

/** Unwired contract. No route or live RPC adapter is published by this module. */
export interface StaffEligibilityDependencies {
  resolveActor: (request: Request) => Promise<string>;
  enabled?: () => boolean;
  // A future typed adapter must translate PT403 to StaffReadError(403).
  // Missing RPC/schema and other faults must reject as dependency failures.
  // Unknown rejection values never establish a privilege denial or a grant.
  check: (actor: string) => Promise<unknown>;
}

function failure(status: 400 | 401 | 403 | 503) {
  return Response.json(
    {
      error: {
        code:
          status === 400
            ? 'feedback_invalid_query'
            : status === 401
              ? 'feedback_unauthorized'
              : status === 403
                ? 'feedback_forbidden'
                : 'feedback_unavailable',
      },
    },
    { status, headers }
  );
}
const safeError = (error: unknown) =>
  error instanceof StaffReadError ? error : new StaffReadError(503);

export function createStaffEligibilityHandler(
  deps: StaffEligibilityDependencies
) {
  return (request: Request): Promise<Response> =>
    Effect.runPromise(
      Effect.gen(function* () {
        const actor = yield* Effect.tryPromise({
          try: () => deps.resolveActor(request),
          catch: safeError,
        });
        const enabled = yield* Effect.try({
          try: () =>
            deps.enabled
              ? deps.enabled()
              : process.env.PRODUCT_FEEDBACK_STAFF_INBOX_ENABLED === 'true',
          catch: () => new StaffReadError(503),
        });
        if (!enabled) return failure(503);
        const validQuery = yield* Effect.try({
          try: () => Array.from(new URL(request.url).searchParams).length === 0,
          catch: () => new StaffReadError(503),
        });
        if (!validQuery) return failure(400);
        const raw = yield* Effect.tryPromise({
          try: () => deps.check(actor),
          catch: safeError,
        });
        const parsed = eligibility.safeParse(raw);
        if (!parsed.success) return failure(503);
        return Response.json(parsed.data, { headers });
      }).pipe(Effect.catchAll((error) => Effect.succeed(failure(error.status))))
    );
}
