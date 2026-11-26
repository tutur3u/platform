import { expect, it } from 'vitest';
import {
  FRAME_SAMPLES,
  MAX_LAG_MS,
  RoomMicGate,
  SAMPLE_RATE,
} from './mic-gate';
import { fixtureGroup, LAPTOPS, seededNoise } from './room-fixtures';

const [first, second] = LAPTOPS;
const lagSamples = (MAX_LAG_MS * SAMPLE_RATE) / 1_000;

it.each([lagSamples, -lagSamples])(
  'gates a scaled duplicate at lag %i after attack and reopens after release',
  (lag) => {
    const gate = new RoomMicGate('B');
    const group = fixtureGroup('all');
    const noise = seededNoise(99);
    const independentLeft = seededNoise(73);
    const independentRight = seededNoise(27);
    const source = Float32Array.from(
      { length: lagSamples + 6 * FRAME_SAMPLES },
      noise
    );
    const results = [];
    for (let frame = 0; frame < 6; frame++) {
      const at = lagSamples + frame * FRAME_SAMPLES;
      const left =
        frame < 4
          ? source.slice(
              at - Math.max(0, lag),
              at - Math.max(0, lag) + FRAME_SAMPLES
            )
          : Float32Array.from({ length: FRAME_SAMPLES }, independentLeft);
      const right =
        frame < 4
          ? source.slice(
              at + Math.min(0, lag),
              at + Math.min(0, lag) + FRAME_SAMPLES
            )
          : Float32Array.from({ length: FRAME_SAMPLES }, independentRight);
      for (const [index, sample] of left.entries()) left[index] = sample * 0.3;
      results.push([
        ...gate.step(
          group,
          new Map([
            [first, left],
            [second, right],
          ])
        ),
      ]);
    }
    expect(results).toEqual([
      [first, second],
      [first, second],
      [first, second],
      [first],
      [first],
      [first, second],
    ]);
  }
);
