import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { CalendarSeriesError } from '../service';

type Access = { sbAdmin: TypedSupabaseClient; wsId: string; userId: string };
/** Configuration admission only. Each write still rechecks credentials and the provider master. */
export async function providerSeriesCapabilities(access: Access) {
  if (process.env.CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED !== 'true')
    return { enabled: false, sources: [] };
  const { data: tokens, error: tokenError } = await access.sbAdmin
    .from('calendar_auth_tokens')
    .select('id,provider')
    .eq('ws_id', access.wsId)
    .eq('user_id', access.userId)
    .eq('is_active', true)
    .in('provider', ['google', 'microsoft'])
    .limit(251);
  if (tokenError || (tokens?.length ?? 0) > 250)
    throw new CalendarSeriesError(
      'Calendar sources unavailable',
      503,
      'SOURCE_UNAVAILABLE'
    );
  if (!tokens?.length) return { enabled: true, sources: [] };
  const { data: connections, error } = await access.sbAdmin
    .from('calendar_connections')
    .select(
      'id,provider,auth_token_id,calendar_name,access_role,workspace_calendar_id'
    )
    .eq('ws_id', access.wsId)
    .eq('is_enabled', true)
    .eq('sync_outbound_enabled', true)
    .in(
      'auth_token_id',
      tokens.map((token) => token.id)
    )
    .order('id')
    .limit(251);
  if (error || (connections?.length ?? 0) > 250)
    throw new CalendarSeriesError(
      'Calendar sources unavailable',
      503,
      'SOURCE_UNAVAILABLE'
    );
  const { data: calendars, error: calendarError } = await access.sbAdmin
    .schema('private')
    .from('workspace_calendars')
    .select('id')
    .eq('ws_id', access.wsId)
    .eq('is_enabled', true)
    .limit(251);
  if (calendarError || (calendars?.length ?? 0) > 250)
    throw new CalendarSeriesError(
      'Calendar sources unavailable',
      503,
      'SOURCE_UNAVAILABLE'
    );
  const enabled = new Set(calendars?.map((calendar) => calendar.id));
  const owned = new Map(tokens.map((token) => [token.id, token.provider]));
  return {
    enabled: true,
    sources: (connections ?? []).flatMap((connection) => {
      if (
        (connection.provider !== 'google' &&
          connection.provider !== 'microsoft') ||
        !connection.auth_token_id ||
        owned.get(connection.auth_token_id) !== connection.provider ||
        !connection.access_role ||
        !['owner', 'writer', 'write', 'editor'].includes(
          connection.access_role.toLowerCase()
        ) ||
        !connection.workspace_calendar_id ||
        !enabled.has(connection.workspace_calendar_id)
      )
        return [];
      return [
        {
          provider: connection.provider,
          connectionId: connection.id,
          label: connection.calendar_name,
        },
      ];
    }),
  };
}
