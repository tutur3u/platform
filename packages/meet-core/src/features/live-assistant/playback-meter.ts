/** A local audio envelope, never microphone data or a behavioural inference. */
const meters = new Set<() => number>();
const listeners = new Set<() => void>();
let frame: number | undefined;
let level = 0;

export function audioRms(samples: Float32Array) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples)
    sum += Number.isFinite(sample) ? sample * sample : 0;
  return Math.min(1, Math.sqrt(sum / samples.length) * 5);
}
function tick() {
  const next =
    Math.round(Math.max(0, ...Array.from(meters, (read) => read())) * 30) / 30;
  if (next !== level) {
    level = next;
    for (const listener of listeners) listener();
  }
  frame = listeners.size ? requestAnimationFrame(tick) : undefined;
}
export function registerPlaybackMeter(read: () => number) {
  meters.add(read);
  return () => {
    meters.delete(read);
  };
}
export function subscribePlaybackMeter(listener: () => void) {
  listeners.add(listener);
  if (frame === undefined && typeof requestAnimationFrame !== 'undefined')
    frame = requestAnimationFrame(tick);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
      level = 0;
    }
  };
}
export const playbackSnapshot = () => level;
export const silentSnapshot = () => 0;
