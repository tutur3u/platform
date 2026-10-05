import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { CalendarSeriesError } from '../service';

/** Authoritative lookup: delayed import metadata must not reopen provider writes. */
export async function assertProviderSeriesWritable(args: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  userId: string;
  eventId?: string;
  seriesId?: string;
}) {
  const { data, error } = await args.sbAdmin.rpc(
    'calendar_provider_series_is_readonly',
    {
      p_ws_id: args.wsId,
      p_actor_id: args.userId,
      p_event_id: args.eventId,
      p_series_id: args.seriesId,
    }
  );
  if (error) {
    // Rolling deployment can precede the additive RPC while admission is off.
    if (
      process.env.CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED !== 'true' &&
      ['PGRST202', '42883'].includes(error.code)
    )
      return;
    throw new CalendarSeriesError(
      'Provider recurrence state unavailable',
      503,
      'PROVIDER_STATE_UNAVAILABLE'
    );
  }
  if (data === true)
    throw new CalendarSeriesError(
      'Unsupported provider recurrence is read only',
      422,
      'PROVIDER_RULE_READ_ONLY'
    );
  if (data !== false)
    throw new CalendarSeriesError(
      'Provider recurrence state unavailable',
      503,
      'PROVIDER_STATE_UNAVAILABLE'
    );
}
export async function providerReadonlyEventResponse(
  args: Parameters<typeof assertProviderSeriesWritable>[0]
) {
  try {
    await assertProviderSeriesWritable(args);
    return null;
  } catch (error) {
    if (!(error instanceof CalendarSeriesError)) throw error;
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
}
