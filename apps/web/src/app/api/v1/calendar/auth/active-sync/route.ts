import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { WorkspaceCalendarEvent } from '@tuturuuu/types/db';
import { updateLastUpsert } from '@tuturuuu/utils/calendar-sync-coordination';
import { performIncrementalActiveSync } from '@tuturuuu/utils/calendar-sync/incremental-active-sync';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import dayjs from 'dayjs';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  console.log('🔍 [DEBUG] POST /api/v1/calendar/auth/active-sync called');

  try {
    // 1. Get the wsId and start/end dates from the request
    const { wsId, startDate, endDate } = await request.json();

    console.log('🔍 [DEBUG] Request body parsed:', {
      wsId,
      startDate,
      endDate,
      hasWsId: !!wsId,
      hasStartDate: !!startDate,
      hasEndDate: !!endDate,
    });

    if (!wsId) {
      console.log('❌ [DEBUG] Missing wsId in request');
      return NextResponse.json({ error: 'wsId is required' }, { status: 400 });
    }

    if (!startDate || !endDate) {
      console.log('❌ [DEBUG] Missing startDate or endDate in request');
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // 2. Create an admin client and get the user
    console.log('🔍 [DEBUG] Creating Supabase client...');
    const supabase = await createClient();
    console.log('✅ [DEBUG] Supabase client created');

    console.log('🔍 [DEBUG] Getting user from auth...');
    const {
      data: { user },
    } = await supabase.auth.getUser();

    console.log('🔍 [DEBUG] Auth result:', {
      hasUser: !!user,
      userId: user?.id,
    });

    if (!user) {
      console.log('❌ [DEBUG] User not authenticated');
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    console.log('🔍 [DEBUG] Creating admin client...');
    const sbAdmin = await createAdminClient();
    console.log('✅ [DEBUG] Admin client created');

    // 3. Insert a dashboard record
    console.log('🔍 [DEBUG] Inserting dashboard record...');
    const { data: insertDashboardData, error: insertDashboardError } =
      await sbAdmin
        .from('calendar_sync_dashboard')
        .insert({
          ws_id: wsId,
          start_time: startDate,
          end_time: endDate,
          status: 'running',
          type: 'active',
          inserted_events: 0,
          updated_events: 0,
          deleted_events: 0,
          triggered_by: user.id,
        })
        .select()
        .single();

    console.log('🔍 [DEBUG] Dashboard insert result:', {
      hasData: !!insertDashboardData,
      hasError: !!insertDashboardError,
      errorMessage: insertDashboardError?.message,
    });

    if (insertDashboardError) {
      console.log('❌ [DEBUG] Dashboard insert error:', insertDashboardError);
      return NextResponse.json(
        { error: insertDashboardError.message },
        { status: 500 }
      );
    }

    // 4. Fetch eventsToUpsert and eventsToDelete from incremental active sync
    console.log('🔍 [DEBUG] Calling performIncrementalActiveSync...');
    const { formattedEventsToUpsert, formattedEventsToDelete } =
      await performIncrementalActiveSync(
        wsId,
        user.id,
        'primary',
        startDate,
        endDate
      );

    console.log('✅ [DEBUG] performIncrementalActiveSync completed:', {
      eventsToUpsertCount: formattedEventsToUpsert?.length || 0,
      eventsToDeleteCount: formattedEventsToDelete?.length || 0,
    });

    // 5. Delete eventsToDelete
    if (formattedEventsToDelete && formattedEventsToDelete.length > 0) {
      console.log('🔍 [DEBUG] Deleting events...');
      const { error: deleteError } = await supabase
        .from('workspace_calendar_events')
        .delete()
        .in(
          'id',
          formattedEventsToDelete.map((e) => e.id)
        );

      console.log('🔍 [DEBUG] Delete result:', {
        hasError: !!deleteError,
        errorMessage: deleteError?.message,
      });

      if (deleteError) {
        console.log('❌ [DEBUG] Delete error:', deleteError);
        return NextResponse.json(
          { error: deleteError.message },
          { status: 500 }
        );
      }
    }

    // 6. Upsert eventsToUpsert
    let upsertResult: { inserted: number; updated: number } = {
      inserted: 0,
      updated: 0,
    };
    if (formattedEventsToUpsert && formattedEventsToUpsert.length > 0) {
      console.log('🔍 [DEBUG] Upserting events...');
      const { data: upsertData, error: upsertError } = await supabase.rpc(
        'upsert_calendar_events_and_count',
        {
          events: formattedEventsToUpsert,
        }
      );

      console.log('🔍 [DEBUG] Upsert result:', upsertData);
      if (upsertError) {
        console.log('❌ [DEBUG] Upsert error:', upsertError);
        return NextResponse.json(
          { error: upsertError.message },
          { status: 500 }
        );
      }

      upsertResult = upsertData as { inserted: number; updated: number };
    }

    console.log('🔍 [DEBUG] Updating last upsert...');
    await updateLastUpsert(wsId, supabase);
    console.log('✅ [DEBUG] Last upsert updated');

    if (DEV_MODE && insertDashboardData) {
      console.log('🔍 [DEBUG] Updating dashboard record...');
      const { error: updateDashboardError } = await sbAdmin
        .from('calendar_sync_dashboard')
        .update({
          inserted_events: upsertResult?.inserted || 0,
          updated_events: upsertResult?.updated || 0,
          deleted_events: formattedEventsToDelete?.length || 0,
          status: 'completed',
          end_time: new Date().toISOString(),
        })
        .eq('id', insertDashboardData.id);

      console.log('🔍 [DEBUG] Dashboard update result:', {
        hasError: !!updateDashboardError,
        errorMessage: updateDashboardError?.message,
      });

      if (updateDashboardError) {
        console.log('❌ [DEBUG] Dashboard update error:', updateDashboardError);
        return NextResponse.json(
          { error: updateDashboardError.message },
          { status: 500 }
        );
      }
    }

    console.log('✅ [DEBUG] Returning success response');
    return NextResponse.json({
      success: true,
      inserted: upsertResult?.inserted || 0,
      updated: upsertResult?.updated || 0,
      deleted: formattedEventsToDelete?.length || 0,
    });
  } catch (error) {
    console.error('❌ [DEBUG] Route error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
