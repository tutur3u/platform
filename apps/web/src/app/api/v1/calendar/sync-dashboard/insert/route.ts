import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
import { NextResponse } from 'next/server';

type CalendarSyncDashboardInsert =
  Database['public']['Tables']['calendar_sync_dashboard']['Insert'];

export async function POST(request: Request) {
  try {
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
    } = await sbAdmin.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse the request body
    const body: CalendarSyncDashboardInsert = await request.json();

    // Validate required fields
    if (!body.ws_id) {
      return NextResponse.json({ error: 'ws_id is required' }, { status: 400 });
    }

    // Set default values and ensure triggered_by is set to current user
    const insertData: CalendarSyncDashboardInsert = {
      ...body,
      triggered_by: body.triggered_by || user.id,
      start_time: body.start_time || new Date().toISOString(),
      end_time: body.end_time || new Date().toISOString(),
      status: body.status || 'running',
      type: body.type || 'active',
      inserted_events: body.inserted_events || 0,
      updated_events: body.updated_events || 0,
      deleted_events: body.deleted_events || 0,
    };

    // Insert the sync dashboard record
    const { data, error } = await sbAdmin
      .from('calendar_sync_dashboard')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error inserting sync dashboard record:', error);
      return NextResponse.json(
        {
          error: 'Failed to insert sync dashboard record',
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error in sync dashboard insert API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
