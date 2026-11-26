import { microphoneMembers, type RoomAudioGroup } from './group';

export type MicStrategy = 'A' | 'B' | 'C';

export const SAMPLE_RATE = 8_000;
export const FRAME_MS = 20;
export const MAX_LAG_MS = 30;
export const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1_000;
const HISTORY_SAMPLES = (SAMPLE_RATE * MAX_LAG_MS) / 1_000;
const WINDOW_SAMPLES = HISTORY_SAMPLES + FRAME_SAMPLES;

const ATTACK_FRAMES = 2;
const RELEASE_FRAMES = 2;
const ATTACK_COHERENCE = 0.86;
const RELEASE_COHERENCE = 0.76;
const MIN_WINDOW_ENERGY = FRAME_SAMPLES * 0.005 ** 2;

export function algorithmicLatencyMs(strategy: MicStrategy): number {
  return strategy === 'B' ? FRAME_MS : 0;
}

type MicWindow = { samples: Float32Array; validSamples: number };
type PairGate = { duplicate: boolean; run: number };

export class RoomMicGate {
  private windows = new Map<string, MicWindow>();
  private pairs = new Map<string, Map<string, PairGate>>();

  constructor(private readonly strategy: MicStrategy) {}

  // Feed consecutive, aligned mono frames. A missing frame invalidates that mic's
  // correlation history. Only the returned group microphones may emit this frame.
  step(
    group: RoomAudioGroup,
    frames: ReadonlyMap<string, Float32Array>
  ): ReadonlySet<string> {
    const candidates = microphoneMembers(group);
    const available = candidates.flatMap(({ id }) => {
      const frame = frames.get(id);
      if (!frame) return [];
      if (frame.length !== FRAME_SAMPLES) {
        throw new RangeError(
          `Expected ${FRAME_SAMPLES} samples per microphone frame`
        );
      }
      return [{ id, frame }];
    });

    if (this.strategy === 'A') {
      const primary = candidates[0];
      return new Set(primary && frames.has(primary.id) ? [primary.id] : []);
    }
    if (this.strategy === 'C') return new Set(available.map(({ id }) => id));

    const windows = new Map<string, MicWindow>();
    const pairs = new Map<string, Map<string, PairGate>>();
    const kept = new Map<string, MicWindow>();
    for (const { id, frame } of available) {
      const window = appendFrame(this.windows.get(id), frame);
      windows.set(id, window);
      const comparisons = new Map<string, PairGate>();
      pairs.set(id, comparisons);
      let duplicate = false;

      // Only suppress against a mic that will actually emit this frame.
      for (const [keeper, reference] of kept) {
        const gate = updatePair(
          this.pairs.get(id)?.get(keeper),
          coherence(window, reference)
        );
        comparisons.set(keeper, gate);
        if (gate.duplicate) {
          duplicate = true;
          break;
        }
      }
      if (!duplicate) kept.set(id, window);
    }
    this.windows = windows;
    this.pairs = pairs;
    return new Set(kept.keys());
  }
}

function appendFrame(
  previous: MicWindow | undefined,
  frame: Float32Array
): MicWindow {
  const samples = new Float32Array(WINDOW_SAMPLES);
  if (previous) samples.set(previous.samples.subarray(FRAME_SAMPLES));
  samples.set(frame, HISTORY_SAMPLES);
  return {
    samples,
    validSamples: Math.min(
      WINDOW_SAMPLES,
      (previous?.validSamples ?? 0) + FRAME_SAMPLES
    ),
  };
}

function updatePair(
  previous: PairGate = { duplicate: false, run: 0 },
  score: number
): PairGate {
  const switching = previous.duplicate
    ? score < RELEASE_COHERENCE
    : score >= ATTACK_COHERENCE;
  const run = switching ? previous.run + 1 : 0;
  const limit = previous.duplicate ? RELEASE_FRAMES : ATTACK_FRAMES;
  return run >= limit
    ? { duplicate: !previous.duplicate, run: 0 }
    : { ...previous, run };
}

function coherence(left: MicWindow, right: MicWindow): number {
  let peak = correlationSquared(
    left.samples,
    HISTORY_SAMPLES,
    right.samples,
    HISTORY_SAMPLES
  );
  // Move either window into history. Each candidate uses the full 20 ms of
  // evidence, including at +/-30 ms, without reading future samples.
  const leftLag = left.validSamples - FRAME_SAMPLES;
  const rightLag = right.validSamples - FRAME_SAMPLES;
  for (let lag = 1; lag <= Math.max(leftLag, rightLag); lag++) {
    if (lag <= leftLag) {
      peak = Math.max(
        peak,
        correlationSquared(
          left.samples,
          HISTORY_SAMPLES - lag,
          right.samples,
          HISTORY_SAMPLES
        )
      );
    }
    if (lag <= rightLag) {
      peak = Math.max(
        peak,
        correlationSquared(
          left.samples,
          HISTORY_SAMPLES,
          right.samples,
          HISTORY_SAMPLES - lag
        )
      );
    }
  }
  return Math.sqrt(Math.min(1, peak));
}

function correlationSquared(
  left: Float32Array,
  leftOffset: number,
  right: Float32Array,
  rightOffset: number
): number {
  let sumLeft = 0;
  let sumRight = 0;
  let powerLeft = 0;
  let powerRight = 0;
  let product = 0;
  for (let index = 0; index < FRAME_SAMPLES; index++) {
    const a = left[leftOffset + index] ?? 0;
    const b = right[rightOffset + index] ?? 0;
    sumLeft += a;
    sumRight += b;
    powerLeft += a * a;
    powerRight += b * b;
    product += a * b;
  }
  powerLeft -= sumLeft ** 2 / FRAME_SAMPLES;
  powerRight -= sumRight ** 2 / FRAME_SAMPLES;
  if (powerLeft < MIN_WINDOW_ENERGY || powerRight < MIN_WINDOW_ENERGY) return 0;
  const covariance = product - (sumLeft * sumRight) / FRAME_SAMPLES;
  return covariance ** 2 / (powerLeft * powerRight);
}
