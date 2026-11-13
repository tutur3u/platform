/** Pure helpers behind the pulse chart's axis and keyboard navigation. */

/** Keys that move the active day, and where they go. */
export function nextIndex(key: string, index: number, count: number) {
  if (count < 1) return null;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return Math.min(count - 1, index + 1);
    case 'ArrowLeft':
    case 'ArrowDown':
      return Math.max(0, index - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'PageUp':
      return Math.min(count - 1, index + 7);
    case 'PageDown':
      return Math.max(0, index - 7);
    default:
      return null;
  }
}

/**
 * Which days get an axis label: the first and the last always (rank 0), and
 * every `step`-th day in between (rank 1, hidden on narrow screens) unless it
 * would crowd the last label. Null: no label.
 */
export function axisRank(index: number, count: number, step: number) {
  if (index === 0 || index === count - 1) return 0;
  if (index % step === 0 && count - 1 - index >= step) return 1;
  return null;
}

/** A round axis maximum at or above the largest value. */
export function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}
