import { z } from 'zod';

/** One kind of video stream's ceiling: resolution height, frame rate, bitrate. */
export const meetStreamCapSchema = z.object({
  maxHeight: z.number().int().min(144).max(2160),
  maxFrameRate: z.number().int().min(1).max(60),
  maxBitrateKbps: z.number().int().min(50).max(20_000),
});
export type MeetStreamCap = z.infer<typeof meetStreamCapSchema>;

export const meetStreamTierSchema = z.enum(['free', 'paid']);
export type MeetStreamTier = z.infer<typeof meetStreamTierSchema>;

/**
 * What a participant may send, signed into their join token by the server.
 * Clients clamp encoders to it; the room server checks reported send stats
 * against it.
 */
export const meetStreamEntitlementSchema = z.object({
  tier: meetStreamTierSchema,
  camera: meetStreamCapSchema,
  screen: meetStreamCapSchema,
});
export type MeetStreamEntitlement = z.infer<typeof meetStreamEntitlementSchema>;

/**
 * The plan table. Free allows HD resolution at a low frame rate; paid plans
 * unlock 1080p cameras, 1440p screens, 30–60 fps and higher bitrate ceilings.
 * These are ceilings: network and CPU adaptation always lower them further.
 */
export const MEET_STREAM_TIERS: Record<
  MeetStreamTier,
  Omit<MeetStreamEntitlement, 'tier'>
> = {
  free: {
    camera: { maxHeight: 720, maxFrameRate: 24, maxBitrateKbps: 900 },
    screen: { maxHeight: 720, maxFrameRate: 15, maxBitrateKbps: 1800 },
  },
  paid: {
    camera: { maxHeight: 1080, maxFrameRate: 30, maxBitrateKbps: 2500 },
    screen: { maxHeight: 1440, maxFrameRate: 60, maxBitrateKbps: 6000 },
  },
};

/** Workspace product tiers that unlock paid stream quality. */
const PAID_PRODUCT_TIERS = new Set(['PLUS', 'PRO', 'ENTERPRISE']);

export function meetStreamTierForProduct(
  productTier: string | null | undefined
): MeetStreamTier {
  return productTier && PAID_PRODUCT_TIERS.has(productTier) ? 'paid' : 'free';
}

export function meetStreamEntitlement(
  tier: MeetStreamTier
): MeetStreamEntitlement {
  const caps = MEET_STREAM_TIERS[tier];
  return { tier, camera: { ...caps.camera }, screen: { ...caps.screen } };
}

/** A token without an entitlement claim gets the free tier. */
export function resolveMeetStreamEntitlement(
  claim: MeetStreamEntitlement | undefined
): MeetStreamEntitlement {
  return claim ?? meetStreamEntitlement('free');
}

/** Choices offered by the quality picker. `source` keeps the capture size. */
export const MEET_STREAM_RESOLUTIONS = [360, 480, 720, 1080, 1440] as const;
export const MEET_STREAM_FRAME_RATES = [5, 15, 30, 60] as const;

/** Reported send dimensions, as measured from outbound video stats. */
export type MeetStreamReport = {
  cameraHeight?: number | null;
  cameraFps?: number | null;
  screenHeight?: number | null;
  screenFps?: number | null;
};

/**
 * Whether reported send stats stay within an entitlement, allowing for
 * encoder rounding and frame-rate jitter. Reports are client-measured, so
 * this flags drift rather than proving compliance.
 */
export function exceedsMeetStreamEntitlement(
  report: MeetStreamReport,
  entitlement: MeetStreamEntitlement
) {
  const over = (
    height: number | null | undefined,
    fps: number | null | undefined,
    cap: MeetStreamCap
  ) =>
    (height ?? 0) > cap.maxHeight * 1.05 + 16 ||
    (fps ?? 0) > cap.maxFrameRate + 3;
  return (
    over(report.cameraHeight, report.cameraFps, entitlement.camera) ||
    over(report.screenHeight, report.screenFps, entitlement.screen)
  );
}
