import {
  createClient,
  createAdminClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

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
  // Optional advanced settings
  digestFrequency: z
    .enum(['immediate', 'hourly', 'daily', 'weekly'])
    .optional(),
  quietHoursStart: z.string().nullable().optional(), // Format: "HH:MM"
  quietHoursEnd: z.string().nullable().optional(), // Format: "HH:MM"
  timezone: z.string().optional(),
});

/**
 * GET /api/v1/notifications/account-preferences
 * Gets account-level notification preferences for the authenticated user
 */
export async function GET(request: Request) {
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

    const {
      preferences,
      digestFrequency,
      quietHoursStart,
      quietHoursEnd,
      timezone,
    } = validatedData.data;

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

      // Use admin client for DELETE to bypass RLS
      const supabaseAdmin = await createAdminClient();

      // Delete existing preferences for the exact (event_type, channel) combinations
      // we're about to insert to avoid duplicates
      for (const pref of deduplicatedPreferences) {
        const { error: deleteError } = await supabaseAdmin
          .from('notification_preferences')
          .delete()
          .is('ws_id', null)
          .eq('user_id', user.id)
          .eq('scope', 'user')
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
        ws_id: null, // NULL for account-level preferences
        user_id: user.id,
        event_type: pref.eventType,
        channel: pref.channel,
        enabled: pref.enabled,
        scope: 'user' as const,
        digest_frequency: digestFrequency || 'immediate',
        quiet_hours_start: quietHoursStart || null,
        quiet_hours_end: quietHoursEnd || null,
        timezone: timezone || 'UTC',
      }));

      const { error: insertError } = await supabase
        .from('notification_preferences')
        .insert(preferencesToInsert);

      if (insertError) {
        console.error('Error inserting account preferences:', insertError);
        return NextResponse.json(
          { error: 'Failed to update preferences' },
          { status: 500 }
        );
      }
    }

    // If only advanced settings are being updated (empty preferences array),
    // update all existing account-level preferences
    if (
      preferences.length === 0 &&
      (digestFrequency || quietHoursStart || quietHoursEnd || timezone)
    ) {
      const updateData: Record<string, any> = {};
      if (digestFrequency) updateData.digest_frequency = digestFrequency;
      if (quietHoursStart !== undefined)
        updateData.quiet_hours_start = quietHoursStart || null;
      if (quietHoursEnd !== undefined)
        updateData.quiet_hours_end = quietHoursEnd || null;
      if (timezone) updateData.timezone = timezone;

      const { error } = await supabase
        .from('notification_preferences')
        .update(updateData)
        .is('ws_id', null) // Account-level preferences
        .eq('user_id', user.id)
        .eq('scope', 'user');

      if (error) {
        console.error('Error updating advanced settings:', error);
        return NextResponse.json(
          { error: 'Failed to update advanced settings' },
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
