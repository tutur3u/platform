import { z } from 'zod';

const rate = z.number().min(0).max(1_000_000).nullable();
const fraction = z.number().min(0).max(1).nullable();
const count = z.number().int().min(0).max(10_000);

/**
 * One device's media health over its last report interval. Counters and
 * rates only: never track IDs, addresses, SDP, names or tokens.
 */
export const meetMediaQualitySampleSchema = z.object({
  sendKbps: rate,
  availableSendKbps: rate,
  recvVideoKbps: rate,
  rttMs: z.number().min(0).max(60_000).nullable(),
  recvLoss: fraction,
  sendLoss: fraction,
  freezes: count,
  layers: z.object({ high: count, mid: count, low: count }),
  sendLayers: z.number().int().min(0).max(3),
  cpuLimited: z.boolean(),
  audioOnly: z.boolean(),
  smallMode: z.boolean(),
  visibility: z.enum(['visible', 'dimmed', 'background']),
  intervalMs: z.number().int().min(1000).max(600_000),
  // Largest active send dimensions, for entitlement checks.
  cameraHeight: z.number().int().min(0).max(4320).nullable().optional(),
  cameraFps: z.number().min(0).max(240).nullable().optional(),
  screenHeight: z.number().int().min(0).max(4320).nullable().optional(),
  screenFps: z.number().min(0).max(240).nullable().optional(),
});
export type MeetMediaQualitySample = z.infer<
  typeof meetMediaQualitySampleSchema
>;

export type RoomMediaQuality = Record<
  string,
  MeetMediaQualitySample & { at: number; overEntitlement?: boolean }
>;

/** Reports a device may send per minute; clients send one every 30 s. */
export const MEET_MEDIA_QUALITY_REPORTS_PER_MINUTE = 4;

/** Reports older than this no longer describe a live device. */
const STALE_MS = 120_000;
// Rooms admit at most 100 participants; leave headroom for rejoining devices.
const MAX_DEVICES = 150;

/** Keep the latest sample per participant, bounded and pruned of stale ones. */
export function applyMediaQualityReport(
  quality: RoomMediaQuality | undefined,
  userId: string,
  sample: MeetMediaQualitySample,
  now: number,
  overEntitlement = false
): RoomMediaQuality {
  const next: RoomMediaQuality = {};
  for (const [id, entry] of Object.entries(quality ?? {}))
    if (now - entry.at < STALE_MS && id !== userId) next[id] = entry;
  const ids = Object.keys(next);
  if (ids.length >= MAX_DEVICES) {
    const oldest = ids.sort((a, b) => next[a]!.at - next[b]!.at)[0]!;
    delete next[oldest];
  }
  next[userId] = { ...sample, at: now, overEntitlement };
  return next;
}

type Distribution = { p50: number; p95: number; max: number } | null;

function distribution(values: Array<number | null>): Distribution {
  const sorted = values
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  if (!sorted.length) return null;
  const at = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]!;
  return { p50: at(0.5), p95: at(0.95), max: sorted.at(-1)! };
}

/** Anonymous room aggregate for managers and the scale test. */
export function summarizeRoomMediaQuality(
  quality: RoomMediaQuality | undefined,
  now: number
) {
  const live = Object.values(quality ?? {}).filter(
    (entry) => now - entry.at < STALE_MS
  );
  // Freezes count only over devices that measured cameras this interval, so
  // devices without camera telemetry never dilute the rate.
  const measured = live.filter((entry) => entry.recvVideoKbps !== null);
  const minutes =
    measured.reduce((sum, entry) => sum + entry.intervalMs, 0) / 60_000;
  const total = (pick: (entry: MeetMediaQualitySample) => number) =>
    live.reduce((sum, entry) => sum + pick(entry), 0);
  return {
    reporters: live.length,
    cameraReporters: measured.length,
    sendKbps: distribution(live.map((entry) => entry.sendKbps)),
    recvVideoKbps: distribution(live.map((entry) => entry.recvVideoKbps)),
    rttMs: distribution(live.map((entry) => entry.rttMs)),
    recvLoss: distribution(live.map((entry) => entry.recvLoss)),
    sendLoss: distribution(live.map((entry) => entry.sendLoss)),
    freezesPerMinute:
      minutes > 0
        ? measured.reduce((sum, entry) => sum + entry.freezes, 0) / minutes
        : null,
    layers: {
      high: total((entry) => entry.layers.high),
      mid: total((entry) => entry.layers.mid),
      low: total((entry) => entry.layers.low),
    },
    cpuLimited: live.filter((entry) => entry.cpuLimited).length,
    audioOnly: live.filter((entry) => entry.audioOnly).length,
    smallMode: live.filter((entry) => entry.smallMode).length,
    hidden: live.filter((entry) => entry.visibility !== 'visible').length,
    overEntitlement: live.filter((entry) => entry.overEntitlement).length,
  };
}
export type MeetRoomMediaQualitySummary = ReturnType<
  typeof summarizeRoomMediaQuality
>;
