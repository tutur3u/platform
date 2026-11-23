export type TrajectoryPoint = { t: number; x: number; y: number };
export type InputMode = 'pointer' | 'keyboard';
export type MotionVerdict = { ok: true } | { ok: false; reason: string };

export const MAX_TRAJECTORY_POINTS = 400;

function stddev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  );
}

/** Coefficient of determination of a straight-line fit of x over time. */
function linearity(points: TrajectoryPoint[]) {
  const n = points.length;
  const mt = points.reduce((a, p) => a + p.t, 0) / n;
  const mx = points.reduce((a, p) => a + p.x, 0) / n;
  let sxy = 0;
  let stt = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.t - mt) * (p.x - mx);
    stt += (p.t - mt) ** 2;
    sxx += (p.x - mx) ** 2;
  }
  return stt === 0 || sxx === 0 ? 1 : (sxy * sxy) / (stt * sxx);
}

/**
 * Basic human-motion screening. It raises the cost of naive automation;
 * it is not a bot detector on its own, so callers still rate-limit and
 * abuse-score every attempt.
 */
export function assessTrajectory(
  mode: InputMode,
  points: TrajectoryPoint[],
  finalX: number
): MotionVerdict {
  if (!Array.isArray(points) || points.length > MAX_TRAJECTORY_POINTS)
    return { ok: false, reason: 'shape' };
  for (const p of points)
    if (
      ![p?.t, p?.x, p?.y].every(
        (v) => typeof v === 'number' && Number.isFinite(v)
      )
    )
      return { ok: false, reason: 'shape' };
  for (let i = 1; i < points.length; i += 1)
    if (points[i]!.t < points[i - 1]!.t) return { ok: false, reason: 'time' };
  const last = points.at(-1);
  if (!last || Math.abs(last.x - finalX) > 3)
    return { ok: false, reason: 'end' };
  const duration = last.t - points[0]!.t;
  if (mode === 'keyboard') {
    // Arrow keys move at most 10 px per press, starting from the left edge.
    if (
      points.length < 3 ||
      duration < 500 ||
      duration > 120_000 ||
      points[0]!.x > 8
    )
      return { ok: false, reason: 'keyboard' };
    for (let i = 1; i < points.length; i += 1)
      if (points[i]!.x - points[i - 1]!.x > 10)
        return { ok: false, reason: 'keyboard' };
    return { ok: true };
  }
  if (points.length < 8) return { ok: false, reason: 'samples' };
  if (duration < 350 || duration > 90_000)
    return { ok: false, reason: 'duration' };
  if (points[0]!.x > 8) return { ok: false, reason: 'start' };
  const speeds: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dt = points[i]!.t - points[i - 1]!.t;
    if (Math.abs(dx) > 60) return { ok: false, reason: 'jump' };
    if (dt > 0) speeds.push(dx / dt);
  }
  if (speeds.some((v) => Math.abs(v) > 4))
    return { ok: false, reason: 'speed' };
  const mean = speeds.reduce((a, b) => a + b, 0) / Math.max(1, speeds.length);
  const steady = mean !== 0 && stddev(speeds) / Math.abs(mean) < 0.05;
  const flat = stddev(points.map((p) => p.y)) < 0.2;
  if (steady || (flat && linearity(points) > 0.997))
    return { ok: false, reason: 'robotic' };
  return { ok: true };
}
