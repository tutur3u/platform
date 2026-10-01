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
  if (tokenError) {
    console.warn('Calendar source color hydration unavailable', {
      stage: 'accounts',
    });
    return args.events;
  }
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
  if (error) {
    console.warn('Calendar source color hydration unavailable', {
      stage: 'connections',
    });
    return args.events;
  }
  return args.events.map((event) => {
    if (event.provider !== 'google' || !event.source_calendar_id) return event;
    const calendarId = event.external_calendar_id ?? event.google_calendar_id;
    // Calendar IDs (including shared IDs) cannot establish account ownership.
    // Hydrate only a persisted source link within the viewer's owned accounts.
    const matches =
      connections?.filter(
        (source) =>
          source.calendar_id === calendarId &&
          source.workspace_calendar_id === event.source_calendar_id
      ) ?? [];
    const color =
      matches.length === 1 ? opaqueGoogleColor(matches[0]?.color) : null;
    return color ? { ...event, _calendarColor: color } : event;
  });
}
