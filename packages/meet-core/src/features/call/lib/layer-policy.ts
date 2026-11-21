import {
  MEET_VIDEO_LAYERS,
  type MeetVideoLayer,
} from '@tuturuuu/realtime/meet';

/** Device-pixel tile heights at or above which a richer layer pays off. */
const HIGH_LAYER_MIN_PX = 400;
const MID_LAYER_MIN_PX = 200;

const rank = (layer: MeetVideoLayer) => MEET_VIDEO_LAYERS.indexOf(layer);
/** The lower-quality of two layers. */
export const lowerLayer = (a: MeetVideoLayer, b: MeetVideoLayer) =>
  rank(a) >= rank(b) ? a : b;
const stepDown = (layer: MeetVideoLayer) =>
  MEET_VIDEO_LAYERS[Math.min(2, rank(layer) + 1)]!;
const stepUp = (layer: MeetVideoLayer) =>
  MEET_VIDEO_LAYERS[Math.max(0, rank(layer) - 1)]!;

export type TileDemand = {
  /** Rendered height in device pixels; null before the tile is measured. */
  renderedPx: number | null;
  spotlight: boolean;
  /** Visible camera tiles in the current window. */
  visibleTiles: number;
  /** Thumbnail mode caps every non-spotlit camera at the lowest layer. */
  smallMode?: boolean;
};

/** The smallest layer that still fills the tile it is drawn into. */
export function layerForTile({
  renderedPx,
  spotlight,
  visibleTiles,
  smallMode = false,
}: TileDemand): MeetVideoLayer {
  if (smallMode && !spotlight) return 'low';
  if (renderedPx === null)
    return spotlight ? 'high' : visibleTiles >= 9 ? 'low' : 'mid';
  const bySize: MeetVideoLayer =
    renderedPx >= HIGH_LAYER_MIN_PX
      ? 'high'
      : renderedPx >= MID_LAYER_MIN_PX
        ? 'mid'
        : 'low';
  // A spotlit speaker never drops below mid on size alone.
  return spotlight && bySize === 'low' ? 'mid' : bySize;
}

export type ReceiverSample = {
  /** Fraction of video packets lost across all inbound video this interval. */
  loss: number | null;
  /** New video freezes across all inbound video this interval. */
  freezes: number;
  rttMs: number | null;
  /** Browser receive-side estimate, when the browser exposes one. */
  availableKbps: number | null;
  /** Video bitrate actually received this interval. */
  receivedKbps: number | null;
};

export type ReceiverGovernor = {
  ceiling: MeetVideoLayer;
  healthy: number;
  /** Healthy samples needed before the next upgrade; grows after failed probes. */
  required: number;
  lastDowngradeAt: number;
  lastUpgradeAt: number;
};

export const RECEIVER_SAMPLE_MS = 2000;
const BASE_HEALTHY_SAMPLES = 5;
const MAX_HEALTHY_SAMPLES = 40;
const DOWNGRADE_COOLDOWN_MS = 4000;
/** A congestion signal this soon after an upgrade marks that probe failed. */
const FAILED_PROBE_MS = 15_000;

export function initialReceiverGovernor(): ReceiverGovernor {
  return {
    ceiling: 'high',
    healthy: 0,
    required: BASE_HEALTHY_SAMPLES,
    lastDowngradeAt: -Infinity,
    lastUpgradeAt: -Infinity,
  };
}

export function isReceiverCongested(sample: ReceiverSample) {
  return (
    (sample.loss ?? 0) >= 0.06 ||
    sample.freezes >= 2 ||
    (sample.rttMs ?? 0) >= 700 ||
    (sample.availableKbps !== null &&
      sample.receivedKbps !== null &&
      sample.receivedKbps > sample.availableKbps * 0.95)
  );
}

function isReceiverHealthy(sample: ReceiverSample) {
  return (
    sample.loss !== null &&
    sample.loss < 0.02 &&
    sample.freezes === 0 &&
    (sample.rttMs ?? 0) < 400
  );
}

/**
 * Receiver-wide layer ceiling with hysteresis: congestion steps down one
 * layer at once; recovery steps up one layer after a run of healthy samples,
 * and each failed recovery probe doubles the run it needs. Missing statistics
 * never upgrade.
 */
export function nextReceiverGovernor(
  governor: ReceiverGovernor,
  sample: ReceiverSample,
  now: number
): ReceiverGovernor {
  if (isReceiverCongested(sample)) {
    // A failed probe doubles the wait once; later congestion does not.
    const failedProbe = now - governor.lastUpgradeAt < FAILED_PROBE_MS;
    const probe = failedProbe
      ? {
          required: Math.min(MAX_HEALTHY_SAMPLES, governor.required * 2),
          lastUpgradeAt: -Infinity,
        }
      : {};
    if (now - governor.lastDowngradeAt < DOWNGRADE_COOLDOWN_MS)
      return { ...governor, ...probe, healthy: 0 };
    return {
      ...governor,
      ...probe,
      ceiling: stepDown(governor.ceiling),
      healthy: 0,
      lastDowngradeAt: now,
    };
  }
  if (!isReceiverHealthy(sample)) return { ...governor, healthy: 0 };
  const healthy = governor.healthy + 1;
  if (governor.ceiling === 'high') {
    // Long healthy periods slowly forgive earlier failed probes.
    return healthy >= MAX_HEALTHY_SAMPLES
      ? { ...governor, healthy: 0, required: BASE_HEALTHY_SAMPLES }
      : { ...governor, healthy };
  }
  if (healthy < governor.required) return { ...governor, healthy };
  return {
    ...governor,
    ceiling: stepUp(governor.ceiling),
    healthy: 0,
    lastUpgradeAt: now,
  };
}

export type LayerSubscription = {
  mid: string;
  userId: string;
  requested: MeetVideoLayer | undefined;
  /** Consecutive samples in which a higher layer was wanted. */
  pendingUpgrade?: number;
};

/**
 * Per-tile decisions: downgrades apply at once, upgrades only after the
 * higher layer has been wanted for two consecutive samples so a resize or
 * speaker blip does not bounce the SFU between layers.
 */
export function planLayerChanges(
  subscriptions: LayerSubscription[],
  desiredFor: (userId: string) => MeetVideoLayer,
  ceiling: MeetVideoLayer
) {
  const changes: Array<{ mid: string; layer: MeetVideoLayer }> = [];
  const pending = new Map<string, number>();
  for (const entry of subscriptions) {
    const target = lowerLayer(desiredFor(entry.userId), ceiling);
    const current = entry.requested;
    if (current === target) continue;
    if (current !== undefined && rank(target) < rank(current)) {
      const streak = (entry.pendingUpgrade ?? 0) + 1;
      if (streak < 2) {
        pending.set(entry.mid, streak);
        continue;
      }
    }
    changes.push({ mid: entry.mid, layer: target });
  }
  return { changes, pending };
}
