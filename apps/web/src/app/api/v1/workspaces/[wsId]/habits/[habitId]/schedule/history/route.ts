import { getOccurrencesInRange } from '@tuturuuu/ai/scheduling';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { Habit } from '@tuturuuu/types/primitives/Habit';
import { NextResponse } from 'next/server';
import { validate } from 'uuid';
import { z } from 'zod';
import { listHabitSkipHistory } from '@/lib/calendar/habit-skips';
import { habitsNotFoundResponse, isHabitsEnabled } from '@/lib/habits/access';

const querySchema = z.object({
  start: z.string().date().optional(),
  end: z.string().date().optional(),
});

interface RouteParams {
  wsId: string;
  habitId: string;
}

export async function GET(
  request: Request,
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

    const supabase = await createClient(request);
    const sbAdmin = await createAdminClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError) {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    const url = new URL(request.url);
    const parsedQuery = querySchema.safeParse({
      start: url.searchParams.get('start') ?? undefined,
      end: url.searchParams.get('end') ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: 'Invalid query', details: parsedQuery.error.issues },
        { status: 400 }
      );
    }

    const now = new Date();
    const rangeStart = parsedQuery.data.start
      ? new Date(`${parsedQuery.data.start}T00:00:00.000Z`)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const rangeEnd = parsedQuery.data.end
      ? new Date(`${parsedQuery.data.end}T23:59:59.999Z`)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [scheduledEventsResult, completionsResult, skips] = await Promise.all(
      [
        sbAdmin
          .from('habit_calendar_events')
          .select(`
          occurrence_date,
          completed,
          workspace_calendar_events (
            id,
            start_at,
            end_at
          )
        `)
          .eq('habit_id', habitId)
          .gte('occurrence_date', rangeStart.toISOString().split('T')[0] ?? '')
          .lte('occurrence_date', rangeEnd.toISOString().split('T')[0] ?? ''),
        sbAdmin
          .from('habit_completions')
          .select('occurrence_date, event_id, completed_at')
          .eq('habit_id', habitId)
          .gte('occurrence_date', rangeStart.toISOString().split('T')[0] ?? '')
          .lte('occurrence_date', rangeEnd.toISOString().split('T')[0] ?? ''),
        listHabitSkipHistory(
          sbAdmin as any,
          wsId,
          habitId,
          rangeStart.toISOString().split('T')[0] ?? '',
          rangeEnd.toISOString().split('T')[0] ?? ''
        ),
      ]
    );

    const occurrences = getOccurrencesInRange(
      habit as Habit,
      rangeStart,
      rangeEnd
    );

    const scheduledByDate = new Map(
      (scheduledEventsResult.data ?? []).map((entry: any) => [
        entry.occurrence_date,
        entry,
      ])
    );
    const completionsByDate = new Map(
      (completionsResult.data ?? []).map((entry: any) => [
        entry.occurrence_date,
        entry,
      ])
    );
    const activeSkipsByDate = new Map(
      skips
        .filter((skip) => !skip.revoked_at)
        .map((skip) => [skip.occurrence_date, skip] as const)
    );

    const entries = occurrences.map((occurrence) => {
      const occurrenceDate = occurrence.toISOString().split('T')[0] ?? '';
      const scheduled = scheduledByDate.get(occurrenceDate);
      const completed = completionsByDate.get(occurrenceDate);
      const skipped = activeSkipsByDate.get(occurrenceDate);
      const linkedEvent = scheduled?.workspace_calendar_events;

      const status = completed
        ? 'completed'
        : scheduled
          ? 'scheduled'
          : skipped
            ? 'skipped'
            : 'to_be_scheduled';

      return {
        occurrence_date: occurrenceDate,
        status,
        event_id: linkedEvent?.id ?? completed?.event_id ?? null,
        start_at: linkedEvent?.start_at ?? null,
        end_at: linkedEvent?.end_at ?? null,
        canRevoke: status === 'skipped',
        revoked_at: skipped?.revoked_at ?? null,
      };
    });

    return NextResponse.json({
      entries,
      summary: {
        scheduledCount: entries.filter((entry) => entry.status === 'scheduled')
          .length,
        completedCount: entries.filter((entry) => entry.status === 'completed')
          .length,
        skippedCount: entries.filter((entry) => entry.status === 'skipped')
          .length,
        toBeScheduledCount: entries.filter(
          (entry) => entry.status === 'to_be_scheduled'
        ).length,
      },
    });
  } catch (error) {
    console.error('Error fetching habit schedule history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
