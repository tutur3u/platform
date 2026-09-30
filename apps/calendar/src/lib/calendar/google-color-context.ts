import type { calendar_v3 } from '@tuturuuu/google';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  type GoogleColorContext,
  opaqueGoogleColor,
} from '@tuturuuu/utils/google-calendar-colors';

/** Read current user-specific calendar RGB, the full palette and calendar labels. */
export async function getGoogleColorContext(
  calendar: calendar_v3.Calendar,
  calendarId: string
): Promise<GoogleColorContext> {
  const [palette, entry, details] = await Promise.allSettled([
    calendar.colors.get(),
    calendar.calendarList.get({ calendarId }),
    calendar.calendars.get({ calendarId }),
  ]);
  const colors = palette.status === 'fulfilled' ? palette.value.data : null;
  const source = entry.status === 'fulfilled' ? entry.value.data : null;
  const labels =
    details.status === 'fulfilled'
      ? (details.value.data.labelProperties?.eventLabels ?? undefined)
      : undefined;
  if (
    [palette, entry, details].some((result) => result.status === 'rejected')
  ) {
    console.warn('Google calendar color metadata is partially unavailable', {
      paletteAvailable: palette.status === 'fulfilled',
      sourceAvailable: entry.status === 'fulfilled',
      labelsAvailable: details.status === 'fulfilled',
    });
  }
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
    eventLabels: labels,
  };
}

/** Refresh the scoped connection even when incremental events have no delta. */
export async function refreshGoogleColorContext(args: {
  calendar: calendar_v3.Calendar;
  calendarId: string;
  supabase: TypedSupabaseClient;
  wsId: string;
  authTokenId?: string | null;
}) {
  const context = await getGoogleColorContext(args.calendar, args.calendarId);
  if (args.authTokenId && context.calendarBackground) {
    const { error } = await args.supabase
      .from('calendar_connections')
      .update({ color: context.calendarBackground })
      .eq('ws_id', args.wsId)
      .eq('auth_token_id', args.authTokenId)
      .eq('calendar_id', args.calendarId)
      .eq('provider', 'google');
    if (error)
      console.warn('Google source color refresh failed', { code: error.code });
  }
  return context;
}
