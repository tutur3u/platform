import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export class LegacyCalendarWriteError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}
/** Preflight all rows before decrypting or dispatching a legacy batch. Activating
 * candidate mode also requires draining already-running legacy writers. */
export async function assertLegacyCalendarWriteAllowed(args: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  userId: string;
  eventIds: string[];
  blockCandidate: boolean;
}) {
  if (args.blockCandidate)
    throw new LegacyCalendarWriteError(
      409,
      'Legacy calendar writes require recoverable provider support'
    );
  // Bound read concurrency while checking every row before any provider write.
  for (let offset = 0; offset < args.eventIds.length; offset += 8) {
    const checks = await Promise.allSettled(
      args.eventIds.slice(offset, offset + 8).map(async (eventId) => {
        const rpc = args.sbAdmin.rpc as unknown as (
          name: 'calendar_retained_generation',
          input: { p_ws_id: string; p_event_id: string; p_actor_id: string }
        ) => PromiseLike<{ data: unknown; error: unknown }>;
        const { data, error } = await rpc.call(
          args.sbAdmin,
          'calendar_retained_generation',
          {
            p_ws_id: args.wsId,
            p_event_id: eventId,
            p_actor_id: args.userId,
          }
        );
        if (error)
          throw new LegacyCalendarWriteError(
            503,
            'Calendar generation unavailable'
          );
        if (data !== null)
          throw new LegacyCalendarWriteError(
            409,
            'This calendar event requires recoverable provider support'
          );
      })
    );
    for (const check of checks) {
      if (check.status === 'rejected') {
        if (check.reason instanceof LegacyCalendarWriteError)
          throw check.reason;
        throw new LegacyCalendarWriteError(
          503,
          'Calendar generation unavailable'
        );
      }
    }
  }
}
