import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { NextResponse } from 'next/server';
import { timeServerPhase } from '@/lib/server-timing';

/** Status and JSON body a current-user read produces; routes add headers. */
export interface SectionOutcome<T = unknown> {
  body: T;
  /** Response headers the individual route sends with this outcome. */
  headers?: Record<string, string>;
  /**
   * Arguments the individual route passes to `console.error` for this
   * outcome. Readers never log: the route layer logs them, and the bootstrap
   * ignores them so its own logs stay codes-only.
   */
  log?: readonly unknown[];
  status: number;
  /**
   * Set when the workspace is not readable by the caller (missing, or not a
   * member without a guest share). Individual routes keep their own status.
   */
  unavailable?: true;
}

/** Builds the route response for an outcome, preserving status, headers and logs. */
export function outcomeResponse(outcome: SectionOutcome): NextResponse {
  if (outcome.log) console.error(...outcome.log);
  return NextResponse.json(outcome.body, {
    ...(outcome.headers ? { headers: outcome.headers } : {}),
    status: outcome.status,
  });
}

export interface CurrentUserReadContext {
  /**
   * Wraps a database read for Server-Timing. Defaults to the `db` phase of the
   * surrounding request; the bootstrap passes a pass-through because concurrent
   * sections would otherwise sum to more than the wall time.
   */
  db?: <R>(run: () => PromiseLike<R> | R) => Promise<R>;
  supabase: TypedSupabaseClient;
  user: SupabaseUser;
}

export function timeDb<R>(
  ctx: Pick<CurrentUserReadContext, 'db'>,
  run: () => PromiseLike<R> | R
): Promise<R> {
  return ctx.db ? ctx.db(run) : timeServerPhase('db', run);
}
