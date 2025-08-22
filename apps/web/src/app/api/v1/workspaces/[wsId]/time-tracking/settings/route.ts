import { createClient } from '@tuturuuu/supabase/next/server';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    // Get user's time tracking settings
    const { data: settings, error } = await supabase
      .from('time_tracking_settings')
      .select('*')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Return default settings if none exist
    const defaultSettings = {
      default_category_id: null,
      auto_start_break: false,
      break_duration_minutes: 15,
      work_duration_minutes: 25,
      notifications_enabled: true,
      reminder_interval_minutes: 30,
      time_format: '12h', // 12h or 24h
      week_starts_on: 'monday', // monday or sunday
      daily_goal_minutes: 480, // 8 hours
      weekly_goal_minutes: 2400, // 40 hours
    };

    return NextResponse.json({
      settings: settings || defaultSettings,
    });
  } catch (error) {
    console.error('Error fetching time tracking settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('id:user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      default_category_id,
      auto_start_break,
      break_duration_minutes,
      work_duration_minutes,
      notifications_enabled,
      reminder_interval_minutes,
      time_format,
      week_starts_on,
      daily_goal_minutes,
      weekly_goal_minutes,
    } = body;

    // Validate input
    if (
      break_duration_minutes &&
      (break_duration_minutes < 1 || break_duration_minutes > 120)
    ) {
      return NextResponse.json(
        { error: 'Break duration must be between 1 and 120 minutes' },
        { status: 400 }
      );
    }

    if (
      work_duration_minutes &&
      (work_duration_minutes < 1 || work_duration_minutes > 480)
    ) {
      return NextResponse.json(
        { error: 'Work duration must be between 1 and 480 minutes' },
        { status: 400 }
      );
    }

    if (
      daily_goal_minutes &&
      (daily_goal_minutes < 1 || daily_goal_minutes > 1440)
    ) {
      return NextResponse.json(
        { error: 'Daily goal must be between 1 and 1440 minutes' },
        { status: 400 }
      );
    }

    if (
      weekly_goal_minutes &&
      (weekly_goal_minutes < 1 || weekly_goal_minutes > 10080)
    ) {
      return NextResponse.json(
        { error: 'Weekly goal must be between 1 and 10080 minutes' },
        { status: 400 }
      );
    }

    // Check if settings exist
    const { data: existingSettings } = await supabase
      .from('time_tracking_settings')
      .select('id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    const settingsData = {
      ws_id: wsId,
      user_id: user.id,
      default_category_id: default_category_id || null,
      auto_start_break: auto_start_break ?? false,
      break_duration_minutes: break_duration_minutes || 15,
      work_duration_minutes: work_duration_minutes || 25,
      notifications_enabled: notifications_enabled ?? true,
      reminder_interval_minutes: reminder_interval_minutes || 30,
      time_format: time_format || '12h',
      week_starts_on: week_starts_on || 'monday',
      daily_goal_minutes: daily_goal_minutes || 480,
      weekly_goal_minutes: weekly_goal_minutes || 2400,
      updated_at: new Date().toISOString(),
    };

    let result: { data: any; error: any };
    if (existingSettings) {
      // Update existing settings
      const { data, error } = await supabase
        .from('time_tracking_settings')
        .update(settingsData)
        .eq('id', existingSettings.id)
        .select('*')
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Create new settings
      const { data, error } = await supabase
        .from('time_tracking_settings')
        .insert({
          ...settingsData,
          created_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ settings: result });
  } catch (error) {
    console.error('Error updating time tracking settings:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
