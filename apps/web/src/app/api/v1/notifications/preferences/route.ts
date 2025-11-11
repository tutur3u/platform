import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  wsId: z.string().uuid(),
});

const updateSchema = z.object({
  wsId: z.string().uuid(),
  preferences: z.array(
    z.object({
      eventType: z.enum([
        // Task assignment and general updates
        'task_assigned',
        'task_updated',
        'task_mention',
        // Task field changes
        'task_title_changed',
        'task_description_changed',
        'task_priority_changed',
        'task_due_date_changed',
        'task_start_date_changed',
        'task_estimation_changed',
        'task_moved',
        // Task status changes
        'task_completed',
        'task_reopened',
        // Task relationships
        'task_label_added',
        'task_label_removed',
        'task_project_linked',
        'task_project_unlinked',
        'task_assignee_removed',
        // Workspace
        'workspace_invite',
      ]),
      channel: z.enum(['web', 'email', 'push']),
      enabled: z.boolean(),
    })
  ),
});

/**
 * GET /api/v1/notifications/preferences
 * Gets notification preferences for the authenticated user in a workspace
 */
export async function GET(request: NextRequest) {
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
    const searchParams = request.nextUrl.searchParams;
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

    // Verify user has access to workspace using admin client to bypass RLS
    const supabaseAdmin = await createAdminClient();
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      console.error('Membership check error:', membershipError);
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
export async function PUT(request: Request) {
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
    const body = await request.json();
    const validatedData = updateSchema.safeParse(body);

    if (!validatedData.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validatedData.error },
        { status: 400 }
      );
    }

    const { wsId, preferences } = validatedData.data;

    // Verify user has access to workspace using admin client to bypass RLS
    const supabaseAdmin = await createAdminClient();
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      console.error('Membership check error:', membershipError);
      return NextResponse.json(
        { error: 'Access denied to workspace' },
        { status: 403 }
      );
    }

    // If preferences array is not empty, update individual preferences
    if (preferences.length > 0) {
      // Deduplicate preferences by (eventType, channel) to avoid duplicate inserts
      const uniquePreferences = preferences.reduce((acc, pref) => {
        const key = `${pref.eventType}-${pref.channel}`;
        if (!acc.has(key)) {
          acc.set(key, pref);
        }
        return acc;
      }, new Map<string, (typeof preferences)[number]>());

      const deduplicatedPreferences = Array.from(uniquePreferences.values());

      // Delete existing preferences for the exact (event_type, channel) combinations
      // we're about to insert to avoid duplicates
      // Re-use the admin client created earlier for membership check
      for (const pref of deduplicatedPreferences) {
        const { error: deleteError } = await supabaseAdmin
          .from('notification_preferences')
          .delete()
          .eq('ws_id', wsId)
          .eq('user_id', user.id)
          .eq('scope', 'workspace')
          .eq('event_type', pref.eventType)
          .eq('channel', pref.channel);

        if (deleteError) {
          console.error('Error deleting old preference:', deleteError);
          return NextResponse.json(
            { error: 'Failed to update preferences' },
            { status: 500 }
          );
        }
      }

      // Insert new preferences
      const preferencesToInsert = deduplicatedPreferences.map((pref) => ({
        ws_id: wsId,
        user_id: user.id,
        event_type: pref.eventType,
        channel: pref.channel,
        enabled: pref.enabled,
        scope: 'workspace' as const,
      }));

      const { error: insertError } = await supabase
        .from('notification_preferences')
        .insert(preferencesToInsert);

      if (insertError) {
        console.error('Error inserting preferences:', insertError);
        return NextResponse.json(
          { error: 'Failed to update preferences' },
          { status: 500 }
        );
      }
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
