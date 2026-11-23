/**
 * Outgoing camera quality ladder. A weak link steps resolution and frame rate
 * down; it never switches the camera off. Step 0 is the unconstrained budget,
 * step 3 the floor (about 180p at 10 fps) that always keeps sending.
 */
export const VIDEO_FLOOR_HEIGHT = 180;
export const VIDEO_FLOOR_FPS = 10;
export const VIDEO_STEP_MAX = 3;
/** Healthy samples (one every 3 s) needed before stepping back up one rung. */
export const VIDEO_STEP_UP_AFTER_SAMPLES = 3;
/** Upper bound of the downscale ladder; layers are never scaled past 4x. */
const MAX_SCALE_DOWN = 4;

export type VideoStep = 0 | 1 | 2 | 3;
export type VideoLadderState = { step: VideoStep; healthy: number };
export type VideoNetwork = {
  available: number | null;
  rtt: number | null;
  loss: number | null;
};

export const initialVideoLadder = (): VideoLadderState => ({
  step: 0,
  healthy: 0,
});

/** The rung the current sample asks for, before hysteresis. */
export function videoStepDemand(
  network: VideoNetwork,
  videoSenders: number,
  constrained: boolean
): VideoStep {
  const share =
    network.available === null
      ? Infinity
      : Math.max(
          0,
          Math.floor(((network.available - 144000) * 0.8) / videoSenders)
        );
  const loss = network.loss ?? 0;
  const rtt = network.rtt ?? 0;
  if (share < 100_000 || loss >= 0.14 || rtt >= 1000) return 3;
  if (share < 200_000 || loss >= 0.08 || rtt >= 700) return 2;
  return constrained ? 1 : 0;
}

/**
 * Step down at once, step up one rung after sustained health. A sample with
 * no measurement (`null`) leaves the ladder where it is.
 */
export function nextVideoStep(
  state: VideoLadderState,
  demand: VideoStep | null
): VideoLadderState {
  if (demand === null) return state;
  if (demand > state.step) return { step: demand, healthy: 0 };
  if (demand === state.step) return { step: state.step, healthy: 0 };
  const healthy = state.healthy + 1;
  return healthy >= VIDEO_STEP_UP_AFTER_SAMPLES
    ? { step: (state.step - 1) as VideoStep, healthy: 0 }
    : { step: state.step, healthy };
}

/** Downscale that lands a capture of `height` px at the floor height. */
export function floorScale(height: number | null | undefined) {
  return height && height > 0
    ? Math.min(MAX_SCALE_DOWN, Math.max(1, height / VIDEO_FLOOR_HEIGHT))
    : MAX_SCALE_DOWN;
}

/** Floor-rung limits for the layer that stays live from step 2 on. */
export function floorLimits(step: VideoStep, availableShare: number) {
  const cap = step >= 3 ? 80_000 : 120_000;
  const least = step >= 3 ? 40_000 : 60_000;
  return {
    maxBitrate: Math.max(least, Math.min(cap, availableShare)),
    maxFramerate: step >= 3 ? VIDEO_FLOOR_FPS : 15,
  };
}
