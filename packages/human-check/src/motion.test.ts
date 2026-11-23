import { describe, expect, it } from 'vitest';
import { assessTrajectory } from './motion';
import { humanDrag, robotDrag } from './test-helpers';

describe('assessTrajectory', () => {
  it('accepts a human-like drag', () => {
    expect(assessTrajectory('pointer', humanDrag(180), 180)).toEqual({
      ok: true,
    });
  });

  it.each([
    ['robotic constant velocity', robotDrag(180), 'robotic'],
    ['too few samples', humanDrag(180).slice(-3), 'samples'],
    ['instant', humanDrag(180).map((p, i) => ({ ...p, t: i })), 'duration'],
    [
      'teleport',
      [
        { t: 0, x: 0, y: 80 },
        ...humanDrag(180)
          .slice(1)
          .map((p) => ({ ...p, x: p.x > 10 ? 180 : p.x })),
      ],
      'jump',
    ],
    ['time going backwards', humanDrag(180).reverse(), 'time'],
  ])('rejects %s', (_, points, reason) => {
    expect(assessTrajectory('pointer', points, 180)).toEqual({
      ok: false,
      reason,
    });
  });

  it('rejects an end that does not match the submitted position', () => {
    expect(assessTrajectory('pointer', humanDrag(180), 150)).toMatchObject({
      ok: false,
      reason: 'end',
    });
  });

  it('rejects malformed and oversized trajectories', () => {
    expect(
      assessTrajectory('pointer', [{ t: 0, x: Number.NaN, y: 0 }], 0)
    ).toMatchObject({ reason: 'shape' });
    expect(
      assessTrajectory(
        'pointer',
        Array.from({ length: 401 }, (_, t) => ({ t, x: 0, y: 0 })),
        0
      )
    ).toMatchObject({ reason: 'shape' });
  });

  it('accepts deliberate keyboard steps and rejects an instant keyboard jump', () => {
    const keys = [0, 2, 12, 22, 32, 34].map((x, i) => ({
      t: i * 180,
      x,
      y: 0,
    }));
    expect(assessTrajectory('keyboard', keys, 34)).toEqual({ ok: true });
    expect(
      assessTrajectory(
        'keyboard',
        keys.map((p, i) => ({ ...p, t: i })),
        34
      )
    ).toMatchObject({ ok: false });
    const jump = [0, 2, 120, 122].map((x, i) => ({ t: i * 200, x, y: 0 }));
    expect(assessTrajectory('keyboard', jump, 122)).toMatchObject({
      ok: false,
      reason: 'keyboard',
    });
    const lateStart = [40, 42, 44].map((x, i) => ({ t: i * 300, x, y: 0 }));
    expect(assessTrajectory('keyboard', lateStart, 44)).toMatchObject({
      ok: false,
      reason: 'keyboard',
    });
  });
});
