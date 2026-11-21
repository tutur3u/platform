import { describe, expect, it } from 'vitest';
import { checkSince, createChecker } from '../__tests__/device-invariants';
import { createModel } from '../__tests__/device-property';
import { randomOp } from '../__tests__/device-property-ops';

const SEEDS = Array.from({ length: 16 }, (_, index) => 0x5eed + index * 7919);
const STEPS = 160;

describe('device state machine under random interleavings', () => {
  it.each(SEEDS)('holds every invariant for seed %i', async (seed) => {
    const model = createModel(seed);
    model.concurrent = () => randomOp(model, true);
    const checker = createChecker();
    for (let step = 0; step < STEPS; step += 1) {
      await randomOp(model);
      await checkSince(model, checker);
    }
    // The run exercised commits, faults and concurrent writers, not only rejections.
    const kinds = new Set(
      model.applied.map((write) =>
        write.tag === 'housekeeping' ? 'housekeeping' : write.tag.kind
      )
    );
    expect(kinds.size).toBeGreaterThan(3);
    expect(
      model.memory.committed.some(
        (write) => write.fault === 'unknown_committed'
      )
    ).toBe(true);
  });

  it('replays the same run from the same seed', async () => {
    const run = async () => {
      const model = createModel(42);
      model.concurrent = () => randomOp(model, true);
      for (let step = 0; step < 60; step += 1) await randomOp(model);
      return model.memory.state;
    };
    expect(await run()).toEqual(await run());
  });
});
