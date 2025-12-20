/**
 * Single Habit API
 *
 * GET    - Get habit with scheduled events
 * PUT    - Update habit
 * DELETE - Soft delete habit
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import type { Habit, HabitInput } from '@tuturuuu/types/primitives/Habit';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import {
  deleteFutureHabitEvents,
  fetchHabitStreak,
} from '@/lib/calendar/habit-scheduler';

interface RouteParams {
  wsId: string;
  habitId: string;
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId, habitId } = await params;

    if (!validate(wsId) || !validate(habitId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or habit ID' },
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

    // Fetch habit
    const { data: habit, error: habitError } = await supabase
      .from('workspace_habits')
      .select('*')
      .eq('id', habitId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (habitError || !habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Fetch scheduled events
    const { data: habitEvents } = await supabase
      .from('habit_calendar_events')
      .select(`
        id,
        occurrence_date,
        completed,
        workspace_calendar_events (
          id,
          title,
          start_at,
          end_at,
          color
        )
      `)
      .eq('habit_id', habitId)
      .order('occurrence_date', { ascending: true });

    // Calculate streak
    const streak = await fetchHabitStreak(supabase as any, habit as Habit);

    return NextResponse.json({
      habit,
      events:
        habitEvents?.map((e: any) => ({
          id: e.workspace_calendar_events?.id,
          title: e.workspace_calendar_events?.title,
          start_at: e.workspace_calendar_events?.start_at,
          end_at: e.workspace_calendar_events?.end_at,
          color: e.workspace_calendar_events?.color,
          occurrence_date: e.occurrence_date,
          completed: e.completed,
        })) ?? [],
      streak,
    });
  } catch (error) {
    console.error('Error in habit GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId, habitId } = await params;

    if (!validate(wsId) || !validate(habitId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or habit ID' },
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
        { error: 'Please sign in to update habits' },
        { status: 401 }
      );
    }

    // Fetch existing habit
    const { data: existingHabit, error: fetchError } = await supabase
      .from('workspace_habits')
      .select('*')
      .eq('id', habitId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !existingHabit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Parse request body
    const body: Partial<HabitInput> = await request.json();

    // Check if scheduling settings changed
    const schedulingChanged =
      body.frequency !== undefined ||
      body.recurrence_interval !== undefined ||
      body.days_of_week !== undefined ||
      body.monthly_type !== undefined ||
      body.day_of_month !== undefined ||
      body.week_of_month !== undefined ||
      body.day_of_week_monthly !== undefined ||
      body.duration_minutes !== undefined ||
      body.ideal_time !== undefined ||
      body.time_preference !== undefined ||
      body.calendar_hours !== undefined ||
      body.start_date !== undefined ||
      body.end_date !== undefined;

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.description !== undefined)
      updateData.description = body.description?.trim() || null;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.calendar_hours !== undefined)
      updateData.calendar_hours = body.calendar_hours;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.duration_minutes !== undefined)
      updateData.duration_minutes = body.duration_minutes;
    if (body.min_duration_minutes !== undefined)
      updateData.min_duration_minutes = body.min_duration_minutes;
    if (body.max_duration_minutes !== undefined)
      updateData.max_duration_minutes = body.max_duration_minutes;
    if (body.ideal_time !== undefined) updateData.ideal_time = body.ideal_time;
    if (body.time_preference !== undefined)
      updateData.time_preference = body.time_preference;
    if (body.frequency !== undefined) updateData.frequency = body.frequency;
    if (body.recurrence_interval !== undefined)
      updateData.recurrence_interval = body.recurrence_interval;
    if (body.days_of_week !== undefined)
      updateData.days_of_week = body.days_of_week;
    if (body.monthly_type !== undefined)
      updateData.monthly_type = body.monthly_type;
    if (body.day_of_month !== undefined)
      updateData.day_of_month = body.day_of_month;
    if (body.week_of_month !== undefined)
      updateData.week_of_month = body.week_of_month;
    if (body.day_of_week_monthly !== undefined)
      updateData.day_of_week_monthly = body.day_of_week_monthly;
    if (body.start_date !== undefined) updateData.start_date = body.start_date;
    if (body.end_date !== undefined) updateData.end_date = body.end_date;
    if (body.is_active !== undefined) updateData.is_active = body.is_active;
    if (body.auto_schedule !== undefined)
      updateData.auto_schedule = body.auto_schedule;
    if (body.is_visible_in_calendar !== undefined)
      updateData.is_visible_in_calendar = body.is_visible_in_calendar;

    // Update the habit
    const { data: updatedHabit, error: updateError } = await supabase
      .from('workspace_habits')
      .update(updateData)
      .eq('id', habitId)
      .select()
      .single();

    if (updateError || !updatedHabit) {
      console.error('Error updating habit:', updateError);
      return NextResponse.json(
        { error: 'Failed to update habit' },
        { status: 500 }
      );
    }

    // If scheduling changed or habit was deactivated, delete future events
    // Note: Rescheduling is handled by the Smart Schedule button in Calendar
    if (schedulingChanged || body.is_active === false) {
      await deleteFutureHabitEvents(supabase as any, habitId);
    }

    return NextResponse.json({
      habit: updatedHabit,
      message: 'Habit updated',
    });
  } catch (error) {
    console.error('Error in habit PUT:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId, habitId } = await params;

    if (!validate(wsId) || !validate(habitId)) {
      return NextResponse.json(
        { error: 'Invalid workspace or habit ID' },
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
        { error: 'Please sign in to delete habits' },
        { status: 401 }
      );
    }

    // Verify habit exists and belongs to workspace
    const { data: habit, error: fetchError } = await supabase
      .from('workspace_habits')
      .select('id')
      .eq('id', habitId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Delete future scheduled events
    await deleteFutureHabitEvents(supabase as any, habitId);

    // Soft delete the habit
    const { error: deleteError } = await supabase
      .from('workspace_habits')
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
      })
      .eq('id', habitId);

    if (deleteError) {
      console.error('Error deleting habit:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete habit' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Habit deleted',
    });
  } catch (error) {
    console.error('Error in habit DELETE:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
