/**
 * Habit Stats API
 *
 * GET - Get habit statistics and streak info
 */

import { fetchHabitStreak } from '@/lib/calendar/habit-scheduler';
import { getOccurrencesInRange } from '@tuturuuu/ai/scheduling';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';

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
        { error: 'Please sign in to view stats' },
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

    // Calculate streak and stats
    const streak = await fetchHabitStreak(supabase as any, habit as Habit);

    // Fetch recent completions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: recentCompletions } = await supabase
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
