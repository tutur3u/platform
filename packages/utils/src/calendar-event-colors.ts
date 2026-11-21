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

/** Design-system hues an event color resolves to; each is a theme variable. */
export type CalendarEventHue =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'lime'
  | 'green'
  | 'teal'
  | 'cyan'
  | 'sky'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'pink'
  | 'rose'
  | 'gray';

/**
 * Reference hue of each chromatic theme token (packages/ui globals.css).
 * Yellow uses its dark-theme hue; the light theme darkens it toward 30°.
 */
const tokenHues: Array<[degrees: number, hue: CalendarEventHue]> = [
  [0, 'red'],
  [25, 'orange'],
  [50, 'yellow'],
  [90, 'lime'],
  [140, 'green'],
  [170, 'teal'],
  [180, 'cyan'],
  [200, 'sky'],
  [220, 'blue'],
  [250, 'indigo'],
  [270, 'purple'],
  [330, 'pink'],
  [345, 'rose'],
];

/** Canonical first-party colors keep their own token. */
const canonicalHues: Record<string, CalendarEventHue> = {
  BLUE: 'blue',
  RED: 'red',
  GREEN: 'green',
  YELLOW: 'yellow',
  PURPLE: 'purple',
  PINK: 'pink',
  ORANGE: 'orange',
  INDIGO: 'indigo',
  CYAN: 'cyan',
  GRAY: 'gray',
  GREY: 'gray',
  '#6B7280': 'gray',
};

function circularDistance(a: number, b: number) {
  const difference = Math.abs(a - b) % 360;
  return Math.min(difference, 360 - difference);
}

/** Nearest design-system hue for an opaque `#rrggbb` color. */
export function calendarHueForColor(background: string): CalendarEventHue {
  const [r, g, b] = [1, 3, 5].map(
    (offset) => Number.parseInt(background.slice(offset, offset + 2), 16) / 255
  ) as [number, number, number];
  if (![r, g, b].every(Number.isFinite)) return 'blue';
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.18 || delta < 0.08) return 'gray';
  const degrees =
    (max === r
      ? ((g - b) / delta + 6) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4) * 60;
  let nearest = tokenHues[0]!;
  for (const candidate of tokenHues) {
    if (
      circularDistance(degrees, candidate[0]) <
      circularDistance(degrees, nearest[0])
    ) {
      nearest = candidate;
    }
  }
  return nearest[1];
}

/** The event's design-system hue, from its provider or canonical color. */
export function calendarEventHue(event: ColorEvent): CalendarEventHue {
  const { background } = calendarEventColors(event);
  const name = event.color?.trim().toUpperCase() ?? 'BLUE';
  const canonical = canonicalHues[name];
  // A row still showing its canonical fill keeps that color's own token.
  return canonical && background === canonicalBackgrounds[name]
    ? canonical
    : calendarHueForColor(background);
}

/** Solid theme color for swatches, dots and accents. */
export function calendarEventAccent(event: ColorEvent) {
  return `var(--${calendarEventHue(event)})`;
}

/**
 * Event surface from design-system tokens: a tint of the event hue over the
 * page background with foreground text, so cards read the same in light and
 * dark themes. Inline values win over theme color classes on shared cards.
 */
export function calendarEventStyle(event: ColorEvent) {
  const accent = calendarEventAccent(event);
  return {
    backgroundColor: `color-mix(in oklab, ${accent} 18%, var(--background))`,
    color: 'var(--foreground)',
    borderColor: accent,
  };
}
