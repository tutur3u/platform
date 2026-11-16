/**
 * Input and list caps shared by every showcase demo. Demos run on synthetic
 * data in memory only, so the caps keep each session small and predictable.
 */
export const SHOWCASE_LIMITS = {
  titleLength: 80,
  bodyLength: 600,
  addressLength: 120,
  listItems: 12,
  timerEntries: 8,
  amountMaxCents: 100_000_000,
} as const;

/** Trims and caps free text. Returns '' for whitespace-only input. */
export function cleanText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

/** True when another item still fits under the list cap. */
export function hasRoom(items: readonly unknown[], max: number): boolean {
  return items.length < max;
}
