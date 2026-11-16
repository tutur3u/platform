import { executeGetDayOverview } from './executors/day-overview';
import type { MiraToolContext } from './mira-tool-types';
import { getWorkspaceContextWorkspaceId } from './workspace-context';

/**
 * Starts today's get_day_overview read while the model is still choosing the
 * tool, so agenda answers do not wait for the reads after the tool call. The
 * executor keeps its own per-section permission checks.
 */
export function startDayOverviewPrefetch(ctx: MiraToolContext) {
  const result = executeGetDayOverview({}, ctx);
  // Observed when the tool call consumes it; a discarded prefetch must not
  // surface as an unhandled rejection.
  result.catch(() => null);
  ctx.dayOverviewPrefetch = {
    wsId: getWorkspaceContextWorkspaceId(ctx),
    result,
  };
}

/**
 * Returns the prefetched result once, only for a call that asks for the same
 * day (no date, or the prefetched date) in the same workspace context.
 */
export async function takePrefetchedDayOverview(
  ctx: MiraToolContext,
  args: Record<string, unknown>
): Promise<{ hit: true; value: unknown } | { hit: false }> {
  const prefetch = ctx.dayOverviewPrefetch;
  if (!prefetch) return { hit: false };
  ctx.dayOverviewPrefetch = undefined;
  if (prefetch.wsId !== getWorkspaceContextWorkspaceId(ctx))
    return { hit: false };
  let value: unknown;
  try {
    value = await prefetch.result;
  } catch {
    return { hit: false };
  }
  const requestedDate = typeof args.date === 'string' ? args.date : undefined;
  const prefetchedDate =
    value && typeof value === 'object' && 'date' in value
      ? (value as { date?: unknown }).date
      : undefined;
  if (requestedDate !== undefined && requestedDate !== prefetchedDate)
    return { hit: false };
  return { hit: true, value };
}
