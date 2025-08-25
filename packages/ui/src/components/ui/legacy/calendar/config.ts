export const HOUR_HEIGHT = 80;
export const MAX_HOURS = 24;
export const DAY_HEIGHT = MAX_HOURS * HOUR_HEIGHT;
export const MAX_LEVEL = 10;
export const GRID_SNAP = 15;
export const LEVEL_WIDTH_OFFSET = 8;
export const MIN_EVENT_HEIGHT = 20 - 4;
export const MIN_COLUMN_WIDTH = 120;

// Time indicator positioning constants
// Derived from time column width (w-16 = 64px) and layout assumptions
const TIME_COLUMN_WIDTH = 64; // w-16 = 64px
const BORDER_WIDTH = 1; // border width
const PADDING_OFFSET = 5; // additional offset for visual alignment

export const TIME_INDICATOR_OFFSETS = {
  SINGLE_TIMEZONE: -(TIME_COLUMN_WIDTH + BORDER_WIDTH + PADDING_OFFSET),
  DUAL_TIMEZONE: -(TIME_COLUMN_WIDTH * 2 + BORDER_WIDTH * 2 + PADDING_OFFSET),
} as const;

// Time label positioning constant
export const TIME_LABEL_Y_OFFSET = -0.65; // positions label slightly above the hour grid line
