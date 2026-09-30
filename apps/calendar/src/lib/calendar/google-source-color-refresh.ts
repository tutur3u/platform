import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { opaqueGoogleColor } from '@tuturuuu/utils/google-calendar-colors';
import type { ResolvedCalendarSource } from './source-resolver';

/** Receives a server-resolved actor source and freshly verified CalendarList RGB. */
export async function refreshOwnedGoogleSourceColor(args: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  source: ResolvedCalendarSource;
  background?: string;
}) {
  const background = opaqueGoogleColor(args.background);
  if (args.source.provider !== 'google' || !background) return;
  const { error } = await args.sbAdmin
    .from('calendar_connections')
    .update({ color: background })
    .eq('id', args.source.connectionId)
    .eq('ws_id', args.wsId)
    .eq('provider', 'google');
  if (error) throw error;
}
