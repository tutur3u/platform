export {
  type AccessibleLabelStyles,
  computeAccessibleLabelStyles,
} from '@tuturuuu/utils/label-colors';

export const LABEL_COLOR_PRESETS = [
  '#EF4444',
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#06B6D4',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#6B7280',
  '#111827',
] as const;

const FALLBACK_LABEL_COLOR = '#3B82F6';

function normalizeColor(color?: string) {
  return color?.trim().toLowerCase();
}

function getRandomIndex(length: number, random: () => number) {
  const raw = random();
  const normalized = Number.isFinite(raw)
    ? Math.min(Math.max(raw, 0), 0.999_999)
    : 0;

  return Math.floor(normalized * length);
}

export function getRandomLabelColorFromPalette(
  palette: readonly string[],
  previousColor?: string,
  random: () => number = Math.random
) {
  if (palette.length === 0) return FALLBACK_LABEL_COLOR;

  const previous = normalizeColor(previousColor);
  const availableColors = previous
    ? palette.filter((color) => normalizeColor(color) !== previous)
    : palette;
  const colors = availableColors.length > 0 ? availableColors : palette;

  return colors[getRandomIndex(colors.length, random)] ?? FALLBACK_LABEL_COLOR;
}

export function getRandomLabelColor(
  previousColor?: string,
  random: () => number = Math.random
) {
  return getRandomLabelColorFromPalette(
    LABEL_COLOR_PRESETS,
    previousColor,
    random
  );
}
