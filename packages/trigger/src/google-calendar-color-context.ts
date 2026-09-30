import type { calendar_v3 } from '@tuturuuu/google';
import {
  type GoogleColorContext,
  opaqueGoogleColor,
} from '@tuturuuu/utils/google-calendar-colors';

/** Optional provider reads; the upsert boundary preserves previously resolved metadata. */
export async function getGoogleCalendarColorContext(
  calendar: calendar_v3.Calendar,
  calendarId: string
): Promise<GoogleColorContext> {
  const results = await Promise.allSettled([
    calendar.colors.get(),
    calendar.calendarList.get({ calendarId }),
    calendar.calendars.get({ calendarId }),
  ]);
  const [palette, entry, details] = results;
  if (results.some((result) => result.status === 'rejected')) {
    console.warn('Google sync color context partially unavailable', {
      paletteAvailable: palette.status === 'fulfilled',
      sourceAvailable: entry.status === 'fulfilled',
      labelsAvailable: details.status === 'fulfilled',
    });
  }
  const source = entry.status === 'fulfilled' ? entry.value.data : null;
  const colors = palette.status === 'fulfilled' ? palette.value.data : null;
  const fallback = source?.colorId ? colors?.calendar?.[source.colorId] : null;
  return {
    calendarId,
    calendarBackground:
      opaqueGoogleColor(source?.backgroundColor) ??
      opaqueGoogleColor(fallback?.background),
    calendarForeground:
      opaqueGoogleColor(source?.foregroundColor) ??
      opaqueGoogleColor(fallback?.foreground),
    eventColors: colors?.event,
    eventLabels:
      details.status === 'fulfilled'
        ? (details.value.data.labelProperties?.eventLabels ?? undefined)
        : undefined,
  };
}
