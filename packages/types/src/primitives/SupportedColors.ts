export const SUPPORTED_COLORS = [
  'RED',
  'BLUE',
  'GREEN',
  'YELLOW',
  'ORANGE',
  'PURPLE',
  'PINK',
  'INDIGO',
  'CYAN',
  'GRAY',
] as const;

export type SupportedColor = (typeof SUPPORTED_COLORS)[number];
