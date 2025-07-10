import {
  prepareTaskChunks,
  scheduleTasks,
} from '@tuturuuu/ai/scheduling/algorithm';
import { defaultActiveHours } from '@tuturuuu/ai/scheduling/default';
import type { Task } from '@tuturuuu/ai/scheduling/types';
import { createClient } from '@tuturuuu/supabase/next/server';
import { getCurrentSupabaseUser } from '@tuturuuu/utils/user-helper';
import { NextResponse } from 'next/server';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();
    const user = await getCurrentSupabaseUser();

    // 1. Authenticate the user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate the request body
    const body = await req.json();
    const {
      name,
      description,
      total_duration,
      is_splittable,
      min_split_duration_minutes,
      max_split_duration_minutes,
      calendar_hours,
      start_date,
      end_date,
      priority,
    } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Task name is required' },
        { status: 400 }
      );
    }

    if (typeof total_duration !== 'number' || total_duration <= 0) {
      return NextResponse.json(
        { error: 'Total duration must be a positive number' },
        { status: 400 }
      );
    }

    if (is_splittable) {
      if (min_split_duration_minutes > max_split_duration_minutes) {
        return NextResponse.json(
          { error: 'Minimum split duration cannot be greater than maximum' },
          { status: 400 }
        );
      }
    }

    // 3. Prepare task data for insertion
    const taskToInsert = {
      creator_id: user.id,
      name: name.trim(),
      description: description?.trim() || null,
      total_duration,
      is_splittable,
      min_split_duration_minutes: is_splittable
        ? min_split_duration_minutes
        : null,
      max_split_duration_minutes: is_splittable
        ? max_split_duration_minutes
        : null,
      calendar_hours,
      start_date: start_date || null,
      end_date: end_date || null,
      user_defined_priority: priority || 'normal',
    };

    // 4. Insert task into Supabase
    const { data: dbTask, error: taskInsertError } = await supabase
      .from('tasks')
      .insert(taskToInsert)
      .select()
      .single();

    if (taskInsertError) {
      console.error('Supabase error creating task:', taskInsertError);
      if (taskInsertError.code === '23503') {
        return NextResponse.json(
          { error: `Invalid workspace ID: ${wsId}` },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to create task in database.' },
        { status: 500 }
      );
    }

    // 5. Convert task to chunkable format
    const taskToSplit: Task = {
      id: dbTask.id,
      name: dbTask.name,
      duration: dbTask.total_duration ?? 0,
      allowSplit: dbTask.is_splittable ?? undefined,
      maxDuration: dbTask.max_split_duration_minutes
        ? dbTask.max_split_duration_minutes / 60
        : 2,
      minDuration: dbTask.min_split_duration_minutes
        ? dbTask.min_split_duration_minutes / 60
        : 0.5,
      priority: dbTask.user_defined_priority || 'normal',
      category: 'work',
      events: [],
    };

    const events = prepareTaskChunks([taskToSplit]);
    console.log(events, 'hello');
    // console.log('Prepared task chunks:', events);
    const { events: newScheduledEvents } = scheduleTasks(
      events,
      defaultActiveHours
    );
    console.log('Scheduled events:', newScheduledEvents);
    if (newScheduledEvents.length > 0) {
      const insertData = newScheduledEvents.map((event) => ({
        ws_id: wsId,
        task_id: event.taskId,
        title: event.name,
        priority: dbTask.user_defined_priority || 'normal',
        start_at: event.range.start.toISOString(),
        end_at: event.range.end.toISOString(),
        locked: false,
      }));

      const { error: insertError } = await supabase
        .from('workspace_calendar_events')
        .upsert(insertData);

      if (insertError) {
        console.error('Error inserting event:', insertError);
        return NextResponse.json(
          { error: 'Failed to insert event into calendar.' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(dbTask, { status: 201 });
  } catch (e: any) {
    console.error('Error in task creation route:', e);
    if (e instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
