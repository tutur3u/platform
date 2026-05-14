import type { HiveJsonObject } from './types';

const hexColorPattern = /^#[0-9a-f]{6}$/i;

export function getStyleColor(
  state: HiveJsonObject | null | undefined,
  key: string,
  fallback: string
) {
  const value = state?.[key];
  return typeof value === 'string' && hexColorPattern.test(value)
    ? value
    : fallback;
}

export function normalizeStyleColor(value: string, fallback: string) {
  return hexColorPattern.test(value) ? value : fallback;
}
