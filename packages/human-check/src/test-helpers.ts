import type { TrajectoryPoint } from './motion';

/** A human-like drag: ease in and out, small vertical wobble. */
export function humanDrag(to: number, seed = 1): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const steps = 30;
  let t = 0;
  for (let i = 0; i <= steps; i += 1) {
    const p = i / steps;
    const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
    points.push({
      t,
      x: Math.round(to * eased * 10) / 10,
      y: 80 + (rnd() - 0.5) * 3,
    });
    t += 18 + Math.round(rnd() * 20);
  }
  return points;
}

/** Constant-velocity, perfectly flat automation. */
export function robotDrag(to: number): TrajectoryPoint[] {
  return Array.from({ length: 21 }, (_, i) => ({
    t: i * 25,
    x: (to * i) / 20,
    y: 80,
  }));
}
