import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Database } from '@tuturuuu/types/supabase';
import { NextResponse } from 'next/server';

type CalendarSyncDashboardUpdate =
  Database['public']['Tables']['calendar_sync_dashboard']['Update'];

export async function PUT(request: Request) {
  try {
    const sbAdmin = await createAdminClient();

    // Parse the request body
    const body: { id: string } & CalendarSyncDashboardUpdate =
      await request.json();

    // Validate required fields
    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Extract the id and create update data
    const { id, ...updateData } = body;

    // Update the sync dashboard record
    const { data, error } = await sbAdmin
      .from('calendar_sync_dashboard')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating sync dashboard record:', error);
      return NextResponse.json(
        {
          error: 'Failed to update sync dashboard record',
          details: error.message,
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Sync dashboard record not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error in sync dashboard update API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
