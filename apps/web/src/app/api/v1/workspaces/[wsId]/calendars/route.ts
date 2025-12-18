import { createClient } from '@tuturuuu/supabase/next/server';
import type {
  WorkspaceCalendar,
  WorkspaceCalendarType,
} from '@tuturuuu/types/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validation schemas
const createCalendarSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().optional(),
  is_enabled: z.boolean().optional().default(true),
  position: z.number().int().optional(),
});

const updateCalendarSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().nullable().optional(),
  is_enabled: z.boolean().optional(),
  position: z.number().int().optional(),
});

/**
 * GET /api/v1/workspaces/[wsId]/calendars
 * List all calendars for a workspace, including system and custom calendars
 */
export async function GET(_request: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  try {
    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Normalize workspace ID
    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId);
    } catch (error) {
      console.error('Workspace ID normalization failed:', error);
      return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 });
    }

    const { data: calendars, error } = await supabase
      .from('workspace_calendars')
      .select('*')
      .eq('ws_id', normalizedWsId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Group calendars by type for easier consumption
    const grouped = {
      system: (calendars || []).filter((c) => c.is_system),
      custom: (calendars || []).filter((c) => !c.is_system),
    };

    return NextResponse.json({
      calendars: calendars || [],
      grouped,
      total: (calendars || []).length,
    });
  } catch (error) {
    console.error('Calendars GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendars' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/workspaces/[wsId]/calendars
 * Create a new custom calendar
 */
export async function POST(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  try {
    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Normalize workspace ID
    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId);
    } catch (error) {
      console.error('Workspace ID normalization failed:', error);
      return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 });
    }

    // Parse JSON body with error handling
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid JSON body' },
          { status: 400 }
        );
      }
      throw error;
    }
    const validated = createCalendarSchema.parse(body);

    // Get the next position
    const { data: existing } = await supabase
      .from('workspace_calendars')
      .select('position')
      .eq('ws_id', normalizedWsId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPosition =
      validated.position ?? (existing?.[0]?.position ?? 0) + 1;

    const { data: calendar, error } = await supabase
      .from('workspace_calendars')
      .insert({
        ws_id: normalizedWsId,
        name: validated.name,
        description: validated.description,
        color: validated.color,
        calendar_type: 'custom' as WorkspaceCalendarType,
        is_system: false,
        is_enabled: validated.is_enabled,
        position: nextPosition,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(calendar, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Calendars POST error:', error);
    return NextResponse.json(
      { error: 'Failed to create calendar' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/workspaces/[wsId]/calendars
 * Update a calendar (name, description, color, enabled, position)
 * System calendars can only update is_enabled and position
 */
export async function PATCH(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  try {
    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Normalize workspace ID
    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId);
    } catch (error) {
      console.error('Workspace ID normalization failed:', error);
      return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 });
    }

    // Parse JSON body with error handling
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { error: 'Invalid JSON body' },
          { status: 400 }
        );
      }
      throw error;
    }
    const validated = updateCalendarSchema.parse(body);

    // Check if the calendar exists and belongs to this workspace
    const { data: existing, error: fetchError } = await supabase
      .from('workspace_calendars')
      .select('*')
      .eq('id', validated.id)
      .eq('ws_id', normalizedWsId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Calendar not found' },
        { status: 404 }
      );
    }

    // Build update object based on what the calendar type allows
    const updateData: Partial<WorkspaceCalendar> = {};

    // All calendars can update these
    if (validated.is_enabled !== undefined) {
      updateData.is_enabled = validated.is_enabled;
    }
    if (validated.position !== undefined) {
      updateData.position = validated.position;
    }

    // Only custom calendars can update name, description, color
    if (!existing.is_system) {
      if (validated.name !== undefined) {
        updateData.name = validated.name;
      }
      if (validated.description !== undefined) {
        updateData.description = validated.description;
      }
      if (validated.color !== undefined) {
        updateData.color = validated.color;
      }
    }

    const { data: calendar, error: updateError } = await supabase
      .from('workspace_calendars')
      .update(updateData)
      .eq('id', validated.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(calendar);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Calendars PATCH error:', error);
    return NextResponse.json(
      { error: 'Failed to update calendar' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/workspaces/[wsId]/calendars
 * Delete a custom calendar. System calendars cannot be deleted.
 */
export async function DELETE(request: Request, { params }: Params) {
  const supabase = await createClient();
  const { wsId } = await params;

  try {
    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Normalize workspace ID
    let normalizedWsId: string;
    try {
      normalizedWsId = await normalizeWorkspaceId(wsId);
    } catch (error) {
      console.error('Workspace ID normalization failed:', error);
      return NextResponse.json({ error: 'Invalid workspace' }, { status: 400 });
    }

    const url = new URL(request.url);
    const calendarId = url.searchParams.get('id');

    if (!calendarId) {
      return NextResponse.json(
        { error: 'Calendar ID is required' },
        { status: 400 }
      );
    }

    // Validate calendarId as UUID
    if (!UUID_REGEX.test(calendarId)) {
      return NextResponse.json(
        { error: 'Invalid calendar ID format' },
        { status: 400 }
      );
    }

    // Check if the calendar exists and is not a system calendar
    const { data: existing, error: fetchError } = await supabase
      .from('workspace_calendars')
      .select('*')
      .eq('id', calendarId)
      .eq('ws_id', normalizedWsId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Calendar not found' },
        { status: 404 }
      );
    }

    if (existing.is_system) {
      return NextResponse.json(
        { error: 'System calendars cannot be deleted' },
        { status: 403 }
      );
    }

    // Move events from this calendar to the primary calendar
    const { data: primaryCalendar } = await supabase
      .from('workspace_calendars')
      .select('id')
      .eq('ws_id', normalizedWsId)
      .eq('calendar_type', 'primary')
      .single();

    if (primaryCalendar) {
      await supabase
        .from('workspace_calendar_events')
        .update({ source_calendar_id: primaryCalendar.id })
        .eq('source_calendar_id', calendarId);
    }

    // Delete the calendar
    const { error: deleteError } = await supabase
      .from('workspace_calendars')
      .delete()
      .eq('id', calendarId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Calendars DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete calendar' },
      { status: 500 }
    );
  }
}
