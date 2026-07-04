import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TablesUpdate } from '@tuturuuu/types';
import {
  MAX_COLOR_LENGTH,
  MAX_LONG_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';

const createConnectionSchema = z.object({
  wsId: z.guid(),
  calendarId: z.string().max(MAX_LONG_TEXT_LENGTH).min(1),
  calendarName: z.string().max(MAX_LONG_TEXT_LENGTH).min(1),
  color: z.string().max(MAX_COLOR_LENGTH).optional(),
  isEnabled: z.boolean().default(true),
  authTokenId: z.guid().optional(),
  accessRole: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
  syncDeleteEnabled: z.boolean().optional(),
  syncInboundEnabled: z.boolean().optional(),
  syncOutboundEnabled: z.boolean().optional(),
});

const updateConnectionSchema = z
  .object({
    // Either id OR (calendarId + wsId) to identify the connection
    id: z.guid().optional(),
    calendarId: z.string().max(MAX_LONG_TEXT_LENGTH).min(1).optional(),
    wsId: z.guid().optional(),
    authTokenId: z.guid().optional(),
    isEnabled: z.boolean().optional(),
    calendarName: z.string().max(MAX_LONG_TEXT_LENGTH).min(1).optional(),
    color: z.string().max(MAX_COLOR_LENGTH).optional(),
    accessRole: z.string().max(MAX_LONG_TEXT_LENGTH).optional(),
    syncDeleteEnabled: z.boolean().optional(),
    syncInboundEnabled: z.boolean().optional(),
    syncOutboundEnabled: z.boolean().optional(),
  })
  .refine((data) => data.id || (data.calendarId && data.wsId), {
    message: 'Either id or both calendarId and wsId are required',
  });

async function resolveCalendarConnectionAuth(request: Request) {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: 'calendar' },
  });

  if (!auth.ok) {
    return { auth: null, response: auth.response };
  }

  return { auth, response: null };
}

async function requireWorkspaceAccess({
  supabase,
  userId,
  wsId,
}: {
  supabase: any;
  userId: string;
  wsId: string;
}) {
  const memberCheck = await verifyWorkspaceMembershipType({
    wsId,
    userId,
    supabase,
  });

  if (memberCheck.error === 'membership_lookup_failed') {
    console.error('Calendar connection membership lookup failed:', {
      wsId,
      error: memberCheck.error,
    });
    return NextResponse.json(
      { error: 'Failed to verify workspace access' },
      { status: 500 }
    );
  }

  if (!memberCheck.ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

async function getConnectionWorkspaceId(supabase: any, id: string) {
  const { data, error } = await supabase
    .from('calendar_connections')
    .select('ws_id')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return (data as { ws_id?: string } | null)?.ws_id ?? null;
}

async function ensureWorkspaceCalendarForConnection(args: {
  wsId: string;
  calendarName: string;
  color?: string | null;
}) {
  const sbAdmin = await createAdminClient();
  const { data, error } = await (sbAdmin as any)
    .schema('private')
    .from('workspace_calendars')
    .insert({
      ws_id: args.wsId,
      name: args.calendarName,
      color: args.color || 'BLUE',
      calendar_type: 'custom',
      is_system: false,
      position: 100,
    })
    .select('id')
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

// GET - List calendar connections for a workspace
export async function GET(request: Request) {
  const resolvedAuth = await resolveCalendarConnectionAuth(request);

  if (resolvedAuth.response) return resolvedAuth.response;
  const { supabase, user } = resolvedAuth.auth;

  try {
    const url = new URL(request.url);
    const wsId = url.searchParams.get('wsId');

    if (!wsId) {
      return NextResponse.json(
        { error: 'Missing workspace ID' },
        { status: 400 }
      );
    }

    const accessError = await requireWorkspaceAccess({
      supabase,
      userId: user.id,
      wsId,
    });
    if (accessError) return accessError;

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

    return NextResponse.json(
      { connections },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
        },
      }
    );
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
  const resolvedAuth = await resolveCalendarConnectionAuth(request);

  if (resolvedAuth.response) return resolvedAuth.response;
  const { supabase, user } = resolvedAuth.auth;

  try {
    const body = await request.json();
    const validation = createConnectionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      );
    }

    const {
      wsId,
      calendarId,
      calendarName,
      color,
      isEnabled,
      authTokenId,
      accessRole,
      syncDeleteEnabled,
      syncInboundEnabled,
      syncOutboundEnabled,
    } = validation.data;
    const accessError = await requireWorkspaceAccess({
      supabase,
      userId: user.id,
      wsId,
    });
    if (accessError) return accessError;
    let provider: 'google' | 'microsoft' = 'google';

    if (authTokenId) {
      const { data: authToken, error: authTokenError } = await supabase
        .from('calendar_auth_tokens')
        .select('provider')
        .eq('id', authTokenId)
        .eq('ws_id', wsId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (authTokenError || !authToken) {
        return NextResponse.json(
          { error: 'Calendar account not found' },
          { status: 404 }
        );
      }

      provider = authToken.provider as 'google' | 'microsoft';
    }

    let duplicateQuery = supabase
      .from('calendar_connections')
      .select('id')
      .eq('ws_id', wsId)
      .eq('calendar_id', calendarId)
      .eq('provider', provider);

    duplicateQuery = authTokenId
      ? duplicateQuery.eq('auth_token_id', authTokenId)
      : duplicateQuery.is('auth_token_id', null);

    const { data: duplicateConnection, error: duplicateError } =
      await duplicateQuery.maybeSingle();

    if (duplicateError) {
      throw duplicateError;
    }

    if (duplicateConnection) {
      return NextResponse.json(
        { error: 'This calendar is already connected to this workspace' },
        { status: 409 }
      );
    }

    const workspaceCalendarId = await ensureWorkspaceCalendarForConnection({
      wsId,
      calendarName,
      color,
    });

    // Insert the calendar connection
    const { data: connection, error: insertError } = await supabase
      .from('calendar_connections')
      .insert({
        ws_id: wsId,
        calendar_id: calendarId,
        calendar_name: calendarName,
        color: color || null,
        is_enabled: isEnabled,
        auth_token_id: authTokenId || null,
        provider,
        access_role: accessRole || 'writer',
        workspace_calendar_id: workspaceCalendarId,
        sync_delete_enabled: syncDeleteEnabled ?? true,
        sync_inbound_enabled: syncInboundEnabled ?? true,
        sync_outbound_enabled: syncOutboundEnabled ?? false,
      } as any)
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
  const resolvedAuth = await resolveCalendarConnectionAuth(request);

  if (resolvedAuth.response) return resolvedAuth.response;
  const { supabase, user } = resolvedAuth.auth;

  try {
    const body = await request.json();
    const validation = updateConnectionSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.issues },
        { status: 400 }
      );
    }

    const { id, calendarId, wsId, authTokenId, ...updates } = validation.data;
    const targetWsId =
      wsId ?? (id ? await getConnectionWorkspaceId(supabase, id) : null);

    if (!targetWsId) {
      return NextResponse.json(
        { error: 'Calendar connection not found' },
        { status: 404 }
      );
    }

    const accessError = await requireWorkspaceAccess({
      supabase,
      userId: user.id,
      wsId: targetWsId,
    });
    if (accessError) return accessError;

    // Build the update object dynamically
    const updateData: TablesUpdate<'calendar_connections'> = {};
    if (updates.isEnabled !== undefined)
      updateData.is_enabled = updates.isEnabled;
    if (updates.calendarName !== undefined)
      updateData.calendar_name = updates.calendarName;
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.accessRole !== undefined) {
      (updateData as any).access_role = updates.accessRole;
    }
    if (updates.syncDeleteEnabled !== undefined) {
      (updateData as any).sync_delete_enabled = updates.syncDeleteEnabled;
    }
    if (updates.syncInboundEnabled !== undefined) {
      (updateData as any).sync_inbound_enabled = updates.syncInboundEnabled;
    }
    if (updates.syncOutboundEnabled !== undefined) {
      (updateData as any).sync_outbound_enabled = updates.syncOutboundEnabled;
    }

    // Build the query based on whether we have id or calendarId+wsId
    let query = supabase.from('calendar_connections').update(updateData);

    if (id) {
      query = query.eq('id', id);
    } else if (calendarId && wsId) {
      query = query.eq('calendar_id', calendarId).eq('ws_id', wsId);
      query = authTokenId
        ? query.eq('auth_token_id', authTokenId)
        : query.is('auth_token_id', null);
    }

    // Update the calendar connection
    const { data: connection, error: updateError } = await query
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
  const resolvedAuth = await resolveCalendarConnectionAuth(request);

  if (resolvedAuth.response) return resolvedAuth.response;
  const { supabase, user } = resolvedAuth.auth;

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Missing connection ID' },
        { status: 400 }
      );
    }

    const wsId = await getConnectionWorkspaceId(supabase, id);
    if (!wsId) {
      return NextResponse.json(
        { error: 'Calendar connection not found' },
        { status: 404 }
      );
    }

    const accessError = await requireWorkspaceAccess({
      supabase,
      userId: user.id,
      wsId,
    });
    if (accessError) return accessError;

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
