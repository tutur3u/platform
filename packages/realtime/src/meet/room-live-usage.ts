import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import type { RoomServiceState } from './room-service';

const command = z.object({
  action: z.literal('live.usage'),
  id: z.uuid(),
  sequence: z.number().int().nonnegative(),
  costUsd: z.number().finite().nonnegative(),
  incomplete: z.boolean(),
});
export type RoomLiveUsage = {
  ownerId: string;
  sequence: number;
  costUsd: number;
  incomplete: boolean;
};
/** Only the billing Worker can report provider costs; browser counters are not trusted. */
export function applyLiveUsage(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown
) {
  const parsed = command.safeParse(input);
  if (!parsed.success) return null;
  const fail = (status: number) => ({
    state: snapshot,
    body: { error: 'Usage unavailable' },
    status,
  });
  if (!token.scopes.includes('meet:live-server')) return fail(403);
  const ownerId = token.accountId ?? token.userId;
  const report = parsed.data;
  const previous = snapshot.liveUsage?.[report.id];
  if (previous && previous.ownerId !== ownerId) return fail(403);
  if (!previous) {
    const admitted = Object.values(snapshot.presence).some(
      (p) => (p.accountId ?? p.userId) === ownerId
    );
    if (!admitted || snapshot.ended) return fail(403);
    if (Object.keys(snapshot.liveUsage ?? {}).length >= 5000) return fail(409);
  }
  if (previous && report.sequence <= previous.sequence)
    return { state: snapshot, body: { ok: true } };
  return {
    state: {
      ...snapshot,
      liveUsage: {
        ...snapshot.liveUsage,
        [report.id]: {
          ownerId,
          sequence: report.sequence,
          costUsd: Math.max(previous?.costUsd ?? 0, report.costUsd),
          incomplete: report.incomplete,
        },
      },
    },
    body: { ok: true },
  };
}
export function summarizeLiveUsage(usage: Record<string, RoomLiveUsage> = {}) {
  const rows = Object.values(usage);
  return {
    sessions: rows.length,
    costUsd: rows.reduce((sum, row) => sum + row.costUsd, 0),
    incomplete: rows.filter((row) => row.incomplete).length,
  };
}
