import { createClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Permissive UUID pattern — the DB uuid[] column enforces strict format
const uuidString = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Invalid UUID format'
  );

const createDraftSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().nullish(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).nullish(),
  board_id: uuidString.nullish(),
  list_id: uuidString.nullish(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
  estimation_points: z.number().int().min(0).max(8).nullish(),
  label_ids: z.array(uuidString).default([]),
  assignee_ids: z.array(uuidString).default([]),
  project_ids: z.array(uuidString).default([]),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ wsId: string }> }
) {
  try {
    const { wsId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
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

    const boardId = request.nextUrl.searchParams.get('boardId');

    let query = supabase
      .from('task_drafts')
      .select('*')
      .eq('ws_id', wsId)
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false });

    if (boardId) {
      query = query.eq('board_id', boardId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching drafts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch drafts' },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error in GET /task-drafts:', error);
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
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
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

    const body = await request.json();
    const parsed = createDraftSchema.parse(body);

    const { data, error } = await supabase
      .from('task_drafts')
      .insert({
        ws_id: wsId,
        creator_id: user.id,
        name: parsed.name,
        description: parsed.description ?? null,
        priority: parsed.priority ?? null,
        board_id: parsed.board_id ?? null,
        list_id: parsed.list_id ?? null,
        start_date: parsed.start_date ?? null,
        end_date: parsed.end_date ?? null,
        estimation_points: parsed.estimation_points ?? null,
        label_ids: parsed.label_ids,
        assignee_ids: parsed.assignee_ids,
        project_ids: parsed.project_ids,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating draft:', error);
      return NextResponse.json(
        { error: 'Failed to create draft' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in POST /task-drafts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
