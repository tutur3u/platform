import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';

export type GoogleColorDefinition = {
  background?: string | null;
  foreground?: string | null;
};
export type GoogleColorContext = {
  calendarId?: string;
  calendarBackground?: string | null;
  calendarForeground?: string | null;
  eventColors?: Record<string, GoogleColorDefinition> | null;
  eventLabels?: { id?: string | null; backgroundColor?: string | null }[];
};
export type GoogleEventColor = {
  version: 1;
  calendar_id: string | null;
  color_id: string | null;
  event_label_id: string | null;
  inherited: boolean;
  background: string | null;
  foreground: string | null;
  resolution: 'calendar' | 'event' | 'label' | 'unresolved';
};

// Compatibility only for the existing canonical-color FK. Rendering uses RGB.
const LEGACY_EVENT_COLORS: Record<string, SupportedColor> = {
  '1': 'INDIGO',
  '2': 'GREEN',
  '3': 'PURPLE',
  '4': 'PINK',
  '5': 'YELLOW',
  '6': 'ORANGE',
  '7': 'CYAN',
  '8': 'GRAY',
  '9': 'BLUE',
  '10': 'GREEN',
  '11': 'RED',
};
export const GOOGLE_COLOR_IDS: Record<SupportedColor, string> = {
  INDIGO: '1',
  GREEN: '2',
  PURPLE: '3',
  PINK: '4',
  YELLOW: '5',
  ORANGE: '6',
  CYAN: '7',
  GRAY: '8',
  BLUE: '9',
  RED: '11',
};
export function googleColorCompatibilityValue(colorId?: string | null) {
  return colorId ? (LEGACY_EVENT_COLORS[colorId] ?? 'BLUE') : 'BLUE';
}
export function opaqueGoogleColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : null;
}
export function resolveGoogleEventColor(
  event: { colorId?: string | null; eventLabelId?: string | null },
  context: GoogleColorContext = {}
): GoogleEventColor {
  const labelId = event.eventLabelId || null;
  const colorId = event.colorId && event.colorId !== '0' ? event.colorId : null;
  const inherited = !labelId && !colorId;
  const label = context.eventLabels?.find((entry) => entry.id === labelId);
  const definition = colorId ? context.eventColors?.[colorId] : undefined;
  // An unknown explicit identity must not silently become an inherited color.
  const background = opaqueGoogleColor(
    labelId
      ? label?.backgroundColor
      : colorId
        ? definition?.background
        : context.calendarBackground
  );
  return {
    version: 1,
    calendar_id: context.calendarId ?? null,
    color_id: colorId,
    event_label_id: labelId,
    inherited,
    background,
    foreground: labelId
      ? null
      : opaqueGoogleColor(
          colorId ? definition?.foreground : context.calendarForeground
        ),
    resolution: !background
      ? 'unresolved'
      : labelId
        ? 'label'
        : colorId
          ? 'event'
          : 'calendar',
  };
}

/** Provider metadata is read defensively; client metadata is never a write command. */
export function readGoogleEventColor(
  metadata: unknown
): GoogleEventColor | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const color = (metadata as Record<string, unknown>).google_color;
  if (!color || typeof color !== 'object') return null;
  const entry = color as GoogleEventColor;
  if (entry.version !== 1 || typeof entry.inherited !== 'boolean') return null;
  return {
    ...entry,
    background: opaqueGoogleColor(entry.background),
    foreground: opaqueGoogleColor(entry.foreground),
  };
}
