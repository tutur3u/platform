/**
 * Habit Stats API
 *
 * GET - Get habit statistics and streak info
 */

import { getOccurrencesInRange } from '@tuturuuu/ai/scheduling';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { fetchHabitStreak } from '@/lib/calendar/habit-scheduler';
import { habitsNotFoundResponse, isHabitsEnabled } from '@/lib/habits/access';

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

    if (!validate(habitId)) {
      return NextResponse.json({ error: 'Invalid habit ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const sbAdmin = await createAdminClient();

    // Get authenticated user
    const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Please sign in to view stats' },
        { status: 401 }
      );
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);

    if (!(await isHabitsEnabled(normalizedWsId))) {
      return habitsNotFoundResponse();
    }

    const membership = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
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

    // Fetch habit
    const { data: habit, error: habitError } = await sbAdmin
      .from('workspace_habits')
      .select('*')
      .eq('id', habitId)
      .eq('ws_id', normalizedWsId)
      .is('deleted_at', null)
      .single();

    if (habitError || !habit) {
      return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
    }

    // Calculate streak and stats
    const streak = await fetchHabitStreak(sbAdmin as any, habit as Habit);

    // Fetch recent completions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentCompletions } = await sbAdmin
      .from('habit_completions')
      .select('occurrence_date, completed_at')
      .eq('habit_id', habitId)
      .gte('occurrence_date', thirtyDaysAgo.toISOString().split('T')[0])
      .order('occurrence_date', { ascending: false });

    // Calculate total occurrences since habit started
    const today = new Date();
    const startDate = new Date(habit.start_date);
    const totalOccurrences = getOccurrencesInRange(
      habit as Habit,
      startDate,
      today
    ).length;

    // Calculate weekly completion trend (last 4 weeks)
    const weeklyTrend: Array<{
      week: string;
      completed: number;
      total: number;
    }> = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - i * 7);

      const weekOccurrences = getOccurrencesInRange(
        habit as Habit,
        weekStart,
        weekEnd
      );

      const completedInWeek =
        recentCompletions?.filter((c) => {
          const date = new Date(c.occurrence_date);
          return date >= weekStart && date < weekEnd;
        }).length ?? 0;

      weeklyTrend.push({
        week: `Week ${4 - i}`,
        completed: completedInWeek,
        total: weekOccurrences.length,
      });
    }

    return NextResponse.json({
      habit: {
        id: habit.id,
        name: habit.name,
        frequency: habit.frequency,
        start_date: habit.start_date,
      },
      streak,
      stats: {
        totalOccurrencesSinceStart: totalOccurrences,
        recentCompletions: recentCompletions ?? [],
        weeklyTrend,
      },
    });
  } catch (error) {
    console.error('Error in habit stats GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
