import { readGoogleEventColor } from '@tuturuuu/utils/google-calendar-colors';

const objectMetadata = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** Keep unrelated metadata and matching last-known RGB when optional reads fail. */
export function mergeGoogleSyncMetadata<T extends object>(
  existing: unknown,
  incoming: T
): T {
  const previous = objectMetadata(existing);
  const next = objectMetadata(incoming);
  const merged = { ...previous };
  for (const key of [
    'google_color',
    'google_event_type',
    'google_working_location_type',
    'google_working_location_label',
  ])
    delete merged[key];
  Object.assign(merged, next);
  const oldColor = readGoogleEventColor(previous);
  const newColor = readGoogleEventColor(next);
  if (
    oldColor?.background &&
    newColor?.resolution === 'unresolved' &&
    oldColor.calendar_id === newColor.calendar_id &&
    oldColor.color_id === newColor.color_id &&
    oldColor.event_label_id === newColor.event_label_id &&
    oldColor.inherited === newColor.inherited
  ) {
    merged.google_color = {
      ...newColor,
      background: oldColor.background,
      foreground: oldColor.foreground,
      resolution: oldColor.resolution,
    };
  }
  return merged as T;
}
