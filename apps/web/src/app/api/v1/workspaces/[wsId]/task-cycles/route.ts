import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const cycleStatusSchema = z.enum([
  'planned',
  'active',
  'completed',
  'cancelled',
]);

const createCycleSchema = z.object({
  name: z.string().min(1, 'Cycle name is required').max(255),
  description: z.string().max(1000).optional(),
  status: cycleStatusSchema.optional(),
  start_date: z.string().datetime().optional().or(z.string().length(0)),
  end_date: z.string().datetime().optional().or(z.string().length(0)),
});

type CycleRow = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  creator: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  task_cycle_tasks: { task_id: string }[] | null;
};

const serializeCycles = (rows: CycleRow[]) =>
  rows.map((cycle) => ({
    id: cycle.id,
    name: cycle.name,
    description: cycle.description,
    status: cycle.status,
    start_date: cycle.start_date,
    end_date: cycle.end_date,
    created_at: cycle.created_at,
    creator: cycle.creator,
    tasksCount: cycle.task_cycle_tasks?.length ?? 0,
  }));

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: cycles, error } = await supabase
      .from('task_cycles')
      .select(
        `
          *,
          creator:users!task_cycles_creator_id_fkey(
            id,
            display_name,
            avatar_url
          ),
          task_cycle_tasks(
            task_id
          )
        `
      )
      .eq('ws_id', wsId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching task cycles:', error);
      return NextResponse.json(
        { error: 'Failed to fetch cycles' },
        { status: 500 }
      );
    }

    return NextResponse.json(serializeCycles((cycles ?? []) as CycleRow[]));
  } catch (error) {
    console.error('Error in GET /api/v1/workspaces/[wsId]/task-cycles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('ws_id')
      .eq('ws_id', wsId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const raw = await request.json();
    const parsed = createCycleSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message || 'Invalid input' },
        { status: 400 }
      );
    }
    const { name, description, status, start_date, end_date } = parsed.data;

    const { data: cycle, error } = await supabase
      .from('task_cycles')
      .insert({
        name,
        description: description || null,
        status: status ?? 'planned',
        start_date: start_date ? start_date : null,
        end_date: end_date ? end_date : null,
        ws_id: wsId,
        creator_id: user.id,
      })
      .select('*')
      .single();

    if (error || !cycle) {
      console.error('Error creating task cycle:', error);
      return NextResponse.json(
        { error: 'Failed to create cycle' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        id: cycle.id,
        name: cycle.name,
        description: cycle.description,
        status: cycle.status,
        start_date: cycle.start_date,
        end_date: cycle.end_date,
        created_at: cycle.created_at,
        creator: null,
        tasksCount: 0,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      'Error in POST /api/v1/workspaces/[wsId]/task-cycles:',
      error
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
