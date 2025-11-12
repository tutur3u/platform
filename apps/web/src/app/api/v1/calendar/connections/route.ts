import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createConnectionSchema = z.object({
  wsId: z.string().uuid(),
  calendarId: z.string().min(1),
  calendarName: z.string().min(1),
  color: z.string().optional(),
  isEnabled: z.boolean().default(true),
});

const updateConnectionSchema = z.object({
  id: z.string().uuid(),
  isEnabled: z.boolean().optional(),
  calendarName: z.string().min(1).optional(),
  color: z.string().optional(),
});

// GET - List calendar connections for a workspace
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }

  try {
    const url = new URL(request.url);
    const wsId = url.searchParams.get('wsId');

    if (!wsId) {
      return NextResponse.json(
        { error: 'Missing workspace ID' },
        { status: 400 }
      );
    }

    // Fetch calendar connections for the workspace
    const { data: connections, error: connectionsError } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('ws_id', wsId)
      .order('created_at', { ascending: true });

    if (connectionsError) {
      console.error('Error fetching calendar connections:', connectionsError);
      return NextResponse.json(
        { error: 'Failed to fetch calendar connections' },
        { status: 500 }
      );
    }

    return NextResponse.json({ connections }, { status: 200 });
  } catch (error: any) {
    console.error('Error in GET calendar connections:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new calendar connection
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const validation = createConnectionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { wsId, calendarId, calendarName, color, isEnabled } =
      validation.data;

    // Insert the calendar connection
    const { data: connection, error: insertError } = await supabase
      .from('calendar_connections')
      .insert({
        ws_id: wsId,
        calendar_id: calendarId,
        calendar_name: calendarName,
        color: color || null,
        is_enabled: isEnabled,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating calendar connection:', insertError);

      // Check for unique constraint violation
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'This calendar is already connected to this workspace' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create calendar connection' },
        { status: 500 }
      );
    }

    return NextResponse.json({ connection }, { status: 201 });
  } catch (error: any) {
    console.error('Error in POST calendar connection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH - Update a calendar connection
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const validation = updateConnectionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { id, ...updates } = validation.data;

    // Build the update object dynamically
    const updateData: Record<string, any> = {};
    if (updates.isEnabled !== undefined)
      updateData.is_enabled = updates.isEnabled;
    if (updates.calendarName !== undefined)
      updateData.calendar_name = updates.calendarName;
    if (updates.color !== undefined) updateData.color = updates.color;

    // Update the calendar connection
    const { data: connection, error: updateError } = await supabase
      .from('calendar_connections')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating calendar connection:', updateError);
      return NextResponse.json(
        { error: 'Failed to update calendar connection' },
        { status: 500 }
      );
    }

    return NextResponse.json({ connection }, { status: 200 });
  } catch (error: any) {
    console.error('Error in PATCH calendar connection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a calendar connection
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing connection ID' },
        { status: 400 }
      );
    }

    // Delete the calendar connection
    const { error: deleteError } = await supabase
      .from('calendar_connections')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting calendar connection:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete calendar connection' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error in DELETE calendar connection:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
