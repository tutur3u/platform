/**
 * Single Habit API
 *
 * GET    - Get habit with scheduled events
 * PUT    - Update habit
 * DELETE - Soft delete habit
 */

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { TablesUpdate } from '@tuturuuu/types';
import type { Habit, HabitInput } from '@tuturuuu/types/primitives/Habit';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  normalizeHabitDependencyType,
  validateHabitDependencyGraph,
} from '@/lib/calendar/habit-dependencies';
import {
  deleteFutureHabitEvents,
  fetchHabitStreak,
} from '@/lib/calendar/habit-scheduler';
import { habitsNotFoundResponse, isHabitsEnabled } from '@/lib/habits/access';

interface RouteParams {
  wsId: string;
  habitId: string;
}

const habitIdParamSchema = z.guid();

async function verifyWorkspaceMembership(
  supabase: TypedSupabaseClient,
  wsId: string,
  userId: string
) {
  return await verifyWorkspaceMembershipType({
    wsId,
    userId,
    supabase,
  });
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  try {
    const { wsId, habitId } = await params;

    const parsedHabitId = habitIdParamSchema.safeParse(habitId);
    if (!parsedHabitId.success) {
      return NextResponse.json({ error: 'Invalid habit ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view habits' },
        { status: 401 }
      );
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    const membership = await verifyWorkspaceMembership(
      supabase,
      normalizedWsId,
      user.id
    );

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    if (!(await isHabitsEnabled(normalizedWsId))) {
      return habitsNotFoundResponse();
    }

    // Fetch habit
    const { data: habit, error: habitError } = await sbAdmin
      .from('workspace_habits')
      .select('*')
      .eq('id', parsedHabitId.data)
      .eq('ws_id', normalizedWsId)
      .is('deleted_at', null)
      .single();

    if (habitError || !habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Fetch scheduled events
    const { data: habitEvents } = await sbAdmin
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
      .eq('habit_id', parsedHabitId.data)
      .order('occurrence_date', { ascending: true });

    // Calculate streak
    const streak = await fetchHabitStreak(sbAdmin as any, habit as Habit);

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

    const parsedHabitId = habitIdParamSchema.safeParse(habitId);
    if (!parsedHabitId.success) {
      return NextResponse.json({ error: 'Invalid habit ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to update habits' },
        { status: 401 }
      );
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    const membership = await verifyWorkspaceMembership(
      supabase,
      normalizedWsId,
      user.id
    );

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    if (!(await isHabitsEnabled(normalizedWsId))) {
      return habitsNotFoundResponse();
    }

    // Fetch existing habit
    const { data: existingHabit, error: fetchError } = await sbAdmin
      .from('workspace_habits')
      .select('*')
      .eq('id', parsedHabitId.data)
      .eq('ws_id', normalizedWsId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !existingHabit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Parse request body
    const body: Partial<HabitInput> = await request.json();

    const nextMinInstancesPerDay =
      body.min_instances_per_day !== undefined
        ? body.min_instances_per_day
        : existingHabit.min_instances_per_day;
    const nextIdealInstancesPerDay =
      body.ideal_instances_per_day !== undefined
        ? body.ideal_instances_per_day
        : existingHabit.ideal_instances_per_day;
    const nextMaxInstancesPerDay =
      body.max_instances_per_day !== undefined
        ? body.max_instances_per_day
        : existingHabit.max_instances_per_day;
    const nextDependencyHabitId =
      body.dependency_habit_id !== undefined
        ? body.dependency_habit_id
        : existingHabit.dependency_habit_id;
    const dependencyTypeFromBody =
      body.dependency_type !== undefined
        ? normalizeHabitDependencyType(body.dependency_type)
        : undefined;
    const nextDependencyType =
      body.dependency_type !== undefined
        ? dependencyTypeFromBody
        : existingHabit.dependency_type;

    if (body.dependency_type !== undefined && dependencyTypeFromBody === null) {
      return NextResponse.json(
        { error: 'Habit dependency type must be before or after' },
        { status: 400 }
      );
    }

    if (!!nextDependencyHabitId !== !!nextDependencyType) {
      return NextResponse.json(
        { error: 'Choose both a dependency mode and a dependency habit' },
        { status: 400 }
      );
    }

    if (nextDependencyHabitId === parsedHabitId.data) {
      return NextResponse.json(
        { error: 'A habit cannot depend on itself' },
        { status: 400 }
      );
    }

    for (const value of [
      nextMinInstancesPerDay,
      nextIdealInstancesPerDay,
      nextMaxInstancesPerDay,
    ]) {
      if (value !== null && value !== undefined) {
        if (!Number.isInteger(value) || value < 1) {
          return NextResponse.json(
            {
              error:
                'Habit instances per day must be whole numbers greater than 0',
            },
            { status: 400 }
          );
        }
      }
    }

    if (
      nextMinInstancesPerDay != null &&
      nextIdealInstancesPerDay != null &&
      nextMinInstancesPerDay > nextIdealInstancesPerDay
    ) {
      return NextResponse.json(
        {
          error: 'Min instances per day cannot exceed ideal instances per day',
        },
        { status: 400 }
      );
    }

    if (
      nextIdealInstancesPerDay != null &&
      nextMaxInstancesPerDay != null &&
      nextIdealInstancesPerDay > nextMaxInstancesPerDay
    ) {
      return NextResponse.json(
        {
          error: 'Ideal instances per day cannot exceed max instances per day',
        },
        { status: 400 }
      );
    }

    if (
      nextMinInstancesPerDay != null &&
      nextMaxInstancesPerDay != null &&
      nextMinInstancesPerDay > nextMaxInstancesPerDay
    ) {
      return NextResponse.json(
        { error: 'Min instances per day cannot exceed max instances per day' },
        { status: 400 }
      );
    }

    const { data: workspaceHabits, error: workspaceHabitsError } = await sbAdmin
      .from('workspace_habits')
      .select('id, name, dependency_habit_id, dependency_type')
      .eq('ws_id', normalizedWsId)
      .is('deleted_at', null);

    if (workspaceHabitsError) {
      return NextResponse.json(
        { error: 'Failed to validate habit dependency graph' },
        { status: 500 }
      );
    }

    if (nextDependencyHabitId) {
      const dependencyTarget = workspaceHabits?.find(
        (habit) => habit.id === nextDependencyHabitId
      );

      if (!dependencyTarget) {
        return NextResponse.json(
          { error: 'Selected dependency habit was not found' },
          { status: 400 }
        );
      }
    }

    const dependencyValidationError = validateHabitDependencyGraph(
      (workspaceHabits ?? []).map((habit) => ({
        id: habit.id,
        name: habit.name,
        dependency_habit_id: habit.dependency_habit_id,
        dependency_type: habit.dependency_type as
          | 'after'
          | 'before'
          | null
          | undefined,
      })),
      {
        id: parsedHabitId.data,
        name:
          typeof body.name === 'string' ? body.name.trim() : existingHabit.name,
        dependency_habit_id: nextDependencyHabitId,
        dependency_type: nextDependencyType as
          | 'after'
          | 'before'
          | null
          | undefined,
      }
    );

    if (dependencyValidationError) {
      return NextResponse.json(
        { error: dependencyValidationError },
        { status: 400 }
      );
    }

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
      body.is_splittable !== undefined ||
      body.min_instances_per_day !== undefined ||
      body.ideal_instances_per_day !== undefined ||
      body.max_instances_per_day !== undefined ||
      body.dependency_habit_id !== undefined ||
      body.dependency_type !== undefined ||
      body.ideal_time !== undefined ||
      body.time_preference !== undefined ||
      body.calendar_hours !== undefined ||
      body.start_date !== undefined ||
      body.end_date !== undefined;

    // Build update object
    const updateData: TablesUpdate<'workspace_habits'> = {
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
    if (body.is_splittable !== undefined)
      updateData.is_splittable = body.is_splittable ?? false;
    if (body.min_instances_per_day !== undefined)
      updateData.min_instances_per_day = body.min_instances_per_day;
    if (body.ideal_instances_per_day !== undefined)
      updateData.ideal_instances_per_day = body.ideal_instances_per_day;
    if (body.max_instances_per_day !== undefined)
      updateData.max_instances_per_day = body.max_instances_per_day;
    if (body.dependency_habit_id !== undefined)
      updateData.dependency_habit_id = body.dependency_habit_id;
    if (body.dependency_type !== undefined)
      updateData.dependency_type = dependencyTypeFromBody;
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
    const { data: updatedHabit, error: updateError } = await sbAdmin
      .from('workspace_habits')
      .update(updateData)
      .eq('id', parsedHabitId.data)
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
      await deleteFutureHabitEvents(sbAdmin as any, parsedHabitId.data);
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

    const parsedHabitId = habitIdParamSchema.safeParse(habitId);
    if (!parsedHabitId.success) {
      return NextResponse.json({ error: 'Invalid habit ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to delete habits' },
        { status: 401 }
      );
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    const membership = await verifyWorkspaceMembership(
      supabase,
      normalizedWsId,
      user.id
    );

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: "You don't have access to this workspace" },
        { status: 403 }
      );
    }

    if (!(await isHabitsEnabled(normalizedWsId))) {
      return habitsNotFoundResponse();
    }

    // Verify habit exists and belongs to workspace
    const { data: habit, error: fetchError } = await sbAdmin
      .from('workspace_habits')
      .select('id')
      .eq('id', parsedHabitId.data)
      .eq('ws_id', normalizedWsId)
      .is('deleted_at', null)
      .single();

    if (fetchError || !habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Delete future scheduled events
    await deleteFutureHabitEvents(sbAdmin as any, parsedHabitId.data);

    // Soft delete the habit
    const { error: deleteError } = await sbAdmin
      .from('workspace_habits')
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
      })
      .eq('id', parsedHabitId.data);

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
