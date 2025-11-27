/**
 * Habits API - CRUD operations
 *
 * GET  - List all habits for workspace
 * POST - Create new habit
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import type { HabitInput } from '@tuturuuu/types/primitives/Habit';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';

interface RouteParams {
  wsId: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId } = await params;

    if (!validate(wsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view habits' },
        { status: 401 }
      );
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') !== 'false';
    const includeDeleted = searchParams.get('includeDeleted') === 'true';

    // Build query
    let query = supabase
      .from('workspace_habits')
      .select('*')
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data: habits, error } = await query;

    if (error) {
      console.error('Error fetching habits:', error);
      return NextResponse.json(
        { error: 'Failed to fetch habits' },
        { status: 500 }
      );
    }

    return NextResponse.json({ habits: habits || [] });
  } catch (error) {
    console.error('Error in habits GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId } = await params;

    if (!validate(wsId)) {
      return NextResponse.json(
        { error: 'Invalid workspace ID' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to create habits' },
        { status: 401 }
      );
    }

    // Verify workspace access
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!memberCheck) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    // Parse request body
    const body: HabitInput = await request.json();

    // Validate required fields
    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: 'Habit name is required' },
        { status: 400 }
      );
    }

    if (!body.frequency) {
      return NextResponse.json(
        { error: 'Frequency is required' },
        { status: 400 }
      );
    }

    if (!body.duration_minutes || body.duration_minutes <= 0) {
      return NextResponse.json(
        { error: 'Duration must be greater than 0' },
        { status: 400 }
      );
    }

    // Validate weekly days_of_week
    if (body.frequency === 'weekly' && body.days_of_week) {
      const validDays = body.days_of_week.every(
        (d) => Number.isInteger(d) && d >= 0 && d <= 6
      );
      if (!validDays) {
        return NextResponse.json(
          { error: 'Invalid days of week (must be 0-6)' },
          { status: 400 }
        );
      }
    }

    // Validate monthly settings
    if (body.frequency === 'monthly') {
      if (body.monthly_type === 'day_of_month') {
        if (
          body.day_of_month &&
          (body.day_of_month < 1 || body.day_of_month > 31)
        ) {
          return NextResponse.json(
            { error: 'Invalid day of month (must be 1-31)' },
            { status: 400 }
          );
        }
      } else if (body.monthly_type === 'day_of_week') {
        if (
          body.week_of_month &&
          (body.week_of_month < 1 || body.week_of_month > 5)
        ) {
          return NextResponse.json(
            { error: 'Invalid week of month (must be 1-5)' },
            { status: 400 }
          );
        }
        if (
          body.day_of_week_monthly !== undefined &&
          body.day_of_week_monthly !== null &&
          (body.day_of_week_monthly < 0 || body.day_of_week_monthly > 6)
        ) {
          return NextResponse.json(
            { error: 'Invalid day of week (must be 0-6)' },
            { status: 400 }
          );
        }
      }
    }

    // Create the habit
    const habitData = {
      ws_id: wsId,
      creator_id: user.id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      color: body.color || 'BLUE',
      calendar_hours: body.calendar_hours || 'personal_hours',
      priority: body.priority || 'normal',
      duration_minutes: body.duration_minutes,
      min_duration_minutes: body.min_duration_minutes || null,
      max_duration_minutes: body.max_duration_minutes || null,
      ideal_time: body.ideal_time || null,
      time_preference: body.time_preference || null,
      frequency: body.frequency,
      recurrence_interval: body.recurrence_interval || 1,
      days_of_week: body.days_of_week || null,
      monthly_type: body.monthly_type || null,
      day_of_month: body.day_of_month || null,
      week_of_month: body.week_of_month || null,
      day_of_week_monthly: body.day_of_week_monthly ?? null,
      start_date: body.start_date || new Date().toISOString().split('T')[0],
      end_date: body.end_date || null,
      is_active: body.is_active !== false,
      auto_schedule: body.auto_schedule !== false,
    };

    const { data: habit, error: createError } = await supabase
      .from('workspace_habits')
      .insert(habitData)
      .select()
      .single();

    if (createError || !habit) {
      console.error('Error creating habit:', createError);
      return NextResponse.json(
        { error: 'Failed to create habit' },
        { status: 500 }
      );
    }

    // Note: Auto-scheduling is handled by the Smart Schedule button in Calendar
    // The auto_schedule flag is saved to the habit for the unified scheduler to use

    return NextResponse.json({
      habit,
      message: 'Habit created',
    });
  } catch (error) {
    console.error('Error in habits POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
