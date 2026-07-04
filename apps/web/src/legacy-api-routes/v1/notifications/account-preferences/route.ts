import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { saveNotificationPreferences } from '../notification-preferences-write';

const updateSchema = z.object({
  preferences: z.array(
    z.object({
      eventType: z.enum([
        // Account-level events
        'email_notifications',
        'push_notifications',
        'marketing_communications',
        'security_alerts',
        'workspace_activity',
      ]),
      channel: z.enum(['web', 'email', 'push']),
      enabled: z.boolean(),
    })
  ),
});

/**
 * GET /api/v1/notifications/account-preferences
 * Gets account-level notification preferences for the authenticated user
 */
export async function GET(_: Request) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get account-level preferences (ws_id is NULL for account scope)
    const { data: preferences, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .is('ws_id', null)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error fetching account preferences:', error);
      return NextResponse.json(
        { error: 'Failed to fetch preferences' },
        { status: 500 }
      );
    }

    return NextResponse.json({ preferences: preferences || [] });
  } catch (error) {
    console.error('Error in account preferences API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/v1/notifications/account-preferences
 * Updates account-level notification preferences for the authenticated user
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient(request);

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

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

    const { preferences } = validatedData.data;

    if (preferences.length > 0) {
      const supabaseAdmin = await createAdminClient();
      const saveError = await saveNotificationPreferences({
        preferences,
        scope: 'user',
        supabaseAdmin,
        userId: user.id,
        wsId: null,
      });

      if (saveError) {
        console.error('Error saving account preferences:', saveError);
        return NextResponse.json(
          { error: 'Failed to update preferences' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in account preferences update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
