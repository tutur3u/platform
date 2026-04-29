import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type {
  WorkspaceCalendar,
  WorkspaceCalendarType,
} from '@tuturuuu/types/db';
import {
  MAX_COLOR_LENGTH,
  MAX_SEARCH_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

type AuthorizedWorkspaceContext = {
  normalizedWsId: string;
  supabase: any;
  sbAdmin: any;
  userId: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createCalendarSchema = z.object({
  name: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH),
  description: z.string().max(MAX_SEARCH_LENGTH).optional(),
  color: z.string().max(MAX_COLOR_LENGTH).optional(),
  is_enabled: z.boolean().optional().default(true),
  position: z.number().int().optional(),
});

const updateCalendarSchema = z.object({
  id: z.guid(),
  name: z.string().min(1).max(MAX_SHORT_TEXT_LENGTH).optional(),
  description: z.string().max(MAX_SEARCH_LENGTH).nullable().optional(),
  color: z.string().max(MAX_COLOR_LENGTH).nullable().optional(),
  is_enabled: z.boolean().optional(),
  position: z.number().int().optional(),
});

async function authorizeWorkspaceRequest(
  request: Request,
  rawWsId: string
): Promise<
  | { context: AuthorizedWorkspaceContext; response: null }
  | { context: null; response: NextResponse }
> {
  const supabase = await createClient(request);
  const sbAdmin = await createAdminClient();

  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return {
      context: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  let normalizedWsId: string;
  try {
    normalizedWsId = await normalizeWorkspaceId(rawWsId);
  } catch (error) {
    console.error('Workspace ID normalization failed:', error);
    return {
      context: null,
      response: NextResponse.json(
        { error: 'Invalid workspace' },
        { status: 400 }
      ),
    };
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: normalizedWsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    console.error('Workspace membership lookup failed:', membership.error);
    return {
      context: null,
      response: NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      context: null,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return {
    context: {
      normalizedWsId,
      supabase,
      sbAdmin,
      userId: user.id,
    },
    response: null,
  };
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const authorized = await authorizeWorkspaceRequest(request, wsId);

  if (authorized.response) {
    return authorized.response;
  }

  const { normalizedWsId, sbAdmin } = authorized.context;

  try {
    const { data: calendars, error } = await sbAdmin
      .from('workspace_calendars')
      .select('*')
      .eq('ws_id', normalizedWsId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    const typedCalendars = (calendars || []) as WorkspaceCalendar[];
    const grouped = {
      system: typedCalendars.filter((calendar) => calendar.is_system),
      custom: typedCalendars.filter((calendar) => !calendar.is_system),
    };

    return NextResponse.json({
      calendars: typedCalendars,
      grouped,
      total: typedCalendars.length,
    });
  } catch (error) {
    console.error('Calendars GET error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendars' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const authorized = await authorizeWorkspaceRequest(request, wsId);

  if (authorized.response) {
    return authorized.response;
  }

  const { normalizedWsId, sbAdmin } = authorized.context;

  try {
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

    const { data: existing, error: existingError } = await sbAdmin
      .from('workspace_calendars')
      .select('position')
      .eq('ws_id', normalizedWsId)
      .order('position', { ascending: false })
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    const nextPosition =
      validated.position ??
      ((existing as Array<{ position?: number }> | null)?.[0]?.position ?? 0) +
        1;

    const { data: calendar, error } = await sbAdmin
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

    if (error) {
      throw error;
    }

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

export async function PATCH(request: Request, { params }: Params) {
  const { wsId } = await params;
  const authorized = await authorizeWorkspaceRequest(request, wsId);

  if (authorized.response) {
    return authorized.response;
  }

  const { normalizedWsId, sbAdmin } = authorized.context;

  try {
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

    const { data: existing, error: fetchError } = await sbAdmin
      .from('workspace_calendars')
      .select('*')
      .eq('id', validated.id)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (!existing) {
      return NextResponse.json(
        { error: 'Calendar not found' },
        { status: 404 }
      );
    }

    const updateData: Partial<WorkspaceCalendar> = {};

    if (validated.is_enabled !== undefined) {
      updateData.is_enabled = validated.is_enabled;
    }

    if (validated.position !== undefined) {
      updateData.position = validated.position;
    }

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

    const { data: calendar, error: updateError } = await sbAdmin
      .from('workspace_calendars')
      .update(updateData)
      .eq('id', validated.id)
      .eq('ws_id', normalizedWsId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

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

export async function DELETE(request: Request, { params }: Params) {
  const { wsId } = await params;
  const authorized = await authorizeWorkspaceRequest(request, wsId);

  if (authorized.response) {
    return authorized.response;
  }

  const { normalizedWsId, sbAdmin } = authorized.context;

  try {
    const url = new URL(request.url);
    const calendarId = url.searchParams.get('id');

    if (!calendarId) {
      return NextResponse.json(
        { error: 'Calendar ID is required' },
        { status: 400 }
      );
    }

    if (!UUID_REGEX.test(calendarId)) {
      return NextResponse.json(
        { error: 'Invalid calendar ID format' },
        { status: 400 }
      );
    }

    const { data: existing, error: fetchError } = await sbAdmin
      .from('workspace_calendars')
      .select('*')
      .eq('id', calendarId)
      .eq('ws_id', normalizedWsId)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (!existing) {
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

    const { data: primaryCalendar, error: primaryCalendarError } = await sbAdmin
      .from('workspace_calendars')
      .select('id')
      .eq('ws_id', normalizedWsId)
      .eq('calendar_type', 'primary')
      .maybeSingle();

    if (primaryCalendarError) {
      throw primaryCalendarError;
    }

    if (primaryCalendar?.id) {
      const { error: moveEventsError } = await sbAdmin
        .from('workspace_calendar_events')
        .update({ source_calendar_id: primaryCalendar.id })
        .eq('source_calendar_id', calendarId)
        .eq('ws_id', normalizedWsId);

      if (moveEventsError) {
        throw moveEventsError;
      }
    }

    const { error: deleteError } = await sbAdmin
      .from('workspace_calendars')
      .delete()
      .eq('id', calendarId)
      .eq('ws_id', normalizedWsId);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Calendars DELETE error:', error);
    return NextResponse.json(
      { error: 'Failed to delete calendar' },
      { status: 500 }
    );
  }
}
