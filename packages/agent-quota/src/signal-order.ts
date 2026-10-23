import type { UsageWindow } from './types';
import { coversModel } from './window-scope';

export function signalOrderRemainingPercent(
  windows: UsageWindow[],
  model: string | undefined,
  now: Date
): number | null {
  const values = windows
    .filter((window) => {
      const reset = window.resetsAt ? Date.parse(window.resetsAt) : NaN;
      return (
        window.authoritative &&
        typeof window.usedPercent === 'number' &&
        Number.isFinite(window.usedPercent) &&
        window.usedPercent >= 0 &&
        window.usedPercent <= 100 &&
        Number.isFinite(reset) &&
        reset > now.getTime() &&
        coversModel(window, model)
      );
    })
    .map((window) => 100 - (window.usedPercent as number));
  return values.length ? Math.min(...values) : null;
}

export function compareSignalOrder(
  a: number | null | undefined,
  b: number | null | undefined
) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}
