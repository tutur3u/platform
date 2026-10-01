import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { opaqueGoogleColor } from '@tuturuuu/utils/google-calendar-colors';

type SourceEvent = {
  provider?: string | null;
  source_calendar_id?: string | null;
  external_calendar_id?: string | null;
  google_calendar_id?: string | null;
  _calendarColor?: string;
};

/** Never hydrate another actor/account's source or substitute a native default. */
export async function hydrateEventSourceColors<T extends SourceEvent>(args: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  userId: string;
  events: T[];
}): Promise<T[]> {
  if (!args.events.some((event) => event.provider === 'google'))
    return args.events;
  const { data: tokens, error: tokenError } = await args.sbAdmin
    .from('calendar_auth_tokens')
    .select('id')
    .eq('ws_id', args.wsId)
    .eq('user_id', args.userId)
    .eq('provider', 'google')
    .eq('is_active', true);
  if (tokenError) throw tokenError;
  if (!tokens?.length) return args.events;
  const { data: connections, error } = await args.sbAdmin
    .from('calendar_connections')
    .select('calendar_id, workspace_calendar_id, color')
    .eq('ws_id', args.wsId)
    .eq('provider', 'google')
    .eq('is_enabled', true)
    .in(
      'auth_token_id',
      tokens.map((token) => token.id)
    );
  if (error) throw error;
  return args.events.map((event) => {
    if (event.provider !== 'google') return event;
    const calendarId = event.external_calendar_id ?? event.google_calendar_id;
    // The primary alias is account-relative; a legacy row without a source
    // calendar link cannot be assigned to the viewer's account by this string.
    if (calendarId === 'primary' && !event.source_calendar_id) return event;
    const matches =
      connections?.filter(
        (source) =>
          source.calendar_id === calendarId &&
          (!event.source_calendar_id ||
            source.workspace_calendar_id === event.source_calendar_id)
      ) ?? [];
    const color =
      matches.length === 1 ? opaqueGoogleColor(matches[0]?.color) : null;
    return color ? { ...event, _calendarColor: color } : event;
  });
}
