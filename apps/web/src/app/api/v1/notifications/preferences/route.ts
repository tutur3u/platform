import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  wsId: z.string().uuid(),
});

const updateSchema = z.object({
  wsId: z.string().uuid(),
  preferences: z.array(
    z.object({
      eventType: z.enum(['task_assigned', 'task_updated', 'task_mention', 'workspace_invite']),
      channel: z.enum(['web', 'email', 'sms', 'push']),
      enabled: z.boolean(),
    })
  ),
});

/**
 * GET /api/v1/notifications/preferences
 * Gets notification preferences for the authenticated user in a workspace
 */
export async function GET(req: Request) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const queryParams = querySchema.safeParse({
      wsId: searchParams.get('wsId'),
    });

    if (!queryParams.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryParams.error },
        { status: 400 }
      );
    }

    const { wsId } = queryParams.data;

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Get preferences
    const { data: preferences, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('ws_id', wsId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching preferences:', error);
      return NextResponse.json(
        { error: 'Failed to fetch preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({ preferences: preferences || [] });
  } catch (error) {
    console.error('Error in preferences API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/notifications/preferences
 * Updates notification preferences for the authenticated user
 */
export async function PUT(req: Request) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse and validate body
    const body = await req.json();
    const validatedData = updateSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validatedData.error },
        { status: 400 }
      );
    }

    const { wsId, preferences } = validatedData.data;

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // Upsert preferences
    const preferencesToUpsert = preferences.map((pref) => ({
      ws_id: wsId,
      user_id: user.id,
      event_type: pref.eventType,
      channel: pref.channel,
      enabled: pref.enabled,
    }));

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(preferencesToUpsert, {
        onConflict: 'ws_id,user_id,event_type,channel',
      });

    if (error) {
      console.error('Error updating preferences:', error);
      return NextResponse.json(
        { error: 'Failed to update preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in preferences update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
