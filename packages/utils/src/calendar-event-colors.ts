import {
  opaqueGoogleColor,
  readGoogleEventColor,
} from './google-calendar-colors';

/** Stable opaque fallback for first-party and legacy rows without provider RGB. */
const canonicalBackgrounds: Record<string, string> = {
  BLUE: '#2196f3',
  RED: '#f44336',
  GREEN: '#4caf50',
  YELLOW: '#ffeb3b',
  PURPLE: '#9c27b0',
  PINK: '#e91e63',
  ORANGE: '#ff9800',
  INDIGO: '#3f51b5',
  CYAN: '#00bcd4',
  GRAY: '#9e9e9e',
  GREY: '#9e9e9e',
  '#6B7280': '#6b7280',
};

type ColorEvent = {
  color?: string | null;
  scheduling_metadata?: unknown;
  _calendarColor?: string | null;
};

/** Choose the higher contrast of black/white (at least 4.5:1 for any RGB). */
export function calendarColorForeground(background: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const value =
      Number.parseInt(background.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05)
    ? '#000000'
    : '#ffffff';
}

export function calendarEventColors(event: ColorEvent) {
  const google = readGoogleEventColor(event.scheduling_metadata);
  // Only known inherited intent uses the current source calendar color.
  // Explicit unknown colors and legacy rows never silently become inherited.
  const background =
    (google?.inherited ? opaqueGoogleColor(event._calendarColor) : null) ??
    google?.background ??
    canonicalBackgrounds[event.color?.trim().toUpperCase() ?? 'BLUE'] ??
    canonicalBackgrounds.BLUE!;
  return { background, foreground: calendarColorForeground(background) };
}

/** Inline RGB wins over theme color classes without reducing fill opacity. */
export function calendarEventStyle(event: ColorEvent) {
  const { background, foreground } = calendarEventColors(event);
  return {
    backgroundColor: background,
    color: foreground,
    borderColor: background,
  };
}
