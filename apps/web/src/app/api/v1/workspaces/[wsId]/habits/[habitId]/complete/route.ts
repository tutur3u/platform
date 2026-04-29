/**
 * Habit Completion API
 *
 * POST - Mark an occurrence as completed/uncompleted
 */

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { fetchHabitStreak } from '@/lib/calendar/habit-scheduler';
import { habitsNotFoundResponse, isHabitsEnabled } from '@/lib/habits/access';

interface RouteParams {
  wsId: string;
  habitId: string;
}

interface CompletionBody {
  occurrence_date: string;
  completed: boolean;
}

export async function POST(
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

    if (!(await isHabitsEnabled(wsId))) {
      return habitsNotFoundResponse();
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to complete habits' },
        { status: 401 }
      );
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: wsId,
      userId: user.id,
      supabase: supabase,
    });

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

    // Parse request body
    const body: CompletionBody = await request.json();

    if (!body.occurrence_date) {
      return NextResponse.json(
        { error: 'occurrence_date is required' },
        { status: 400 }
      );
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(body.occurrence_date)) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      );
    }

    // Fetch habit
    const { data: habit, error: habitError } = await sbAdmin
      .from('workspace_habits')
      .select('*')
      .eq('id', habitId)
      .eq('ws_id', wsId)
      .is('deleted_at', null)
      .single();

    if (habitError || !habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    const completed = body.completed !== false;

    if (completed) {
      // Mark as completed - upsert into habit_completions
      const { error: completionError } = await sbAdmin
        .from('habit_completions')
        .upsert(
          {
            habit_id: habitId,
            occurrence_date: body.occurrence_date,
            completed_at: new Date().toISOString(),
          },
          {
            onConflict: 'habit_id,occurrence_date',
          }
        );

      if (completionError) {
        console.error('Error marking completion:', completionError);
        return NextResponse.json(
          { error: 'Failed to mark completion' },
          { status: 500 }
        );
      }

      // Also update the habit_calendar_events if there's a linked event
      await sbAdmin
        .from('habit_calendar_events')
        .update({ completed: true })
        .eq('habit_id', habitId)
        .eq('occurrence_date', body.occurrence_date);
    } else {
      // Mark as uncompleted - delete from habit_completions
      const { error: deleteError } = await sbAdmin
        .from('habit_completions')
        .delete()
        .eq('habit_id', habitId)
        .eq('occurrence_date', body.occurrence_date);

      if (deleteError) {
        console.error('Error removing completion:', deleteError);
        return NextResponse.json(
          { error: 'Failed to remove completion' },
          { status: 500 }
        );
      }

      // Also update the habit_calendar_events if there's a linked event
      await sbAdmin
        .from('habit_calendar_events')
        .update({ completed: false })
        .eq('habit_id', habitId)
        .eq('occurrence_date', body.occurrence_date);
    }

    // Fetch updated streak
    const streak = await fetchHabitStreak(sbAdmin as any, habit as Habit);

    return NextResponse.json({
      success: true,
      occurrence_date: body.occurrence_date,
      completed,
      streak,
      message: completed
        ? 'Habit marked as completed'
        : 'Habit completion removed',
    });
  } catch (error) {
    console.error('Error in habit complete POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
