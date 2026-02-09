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

const updateDraftSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
  priority: z.enum(['critical', 'high', 'normal', 'low']).nullish(),
  board_id: uuidString.nullish(),
  list_id: uuidString.nullish(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
  estimation_points: z.number().int().min(0).max(8).nullish(),
  label_ids: z.array(uuidString).optional(),
  assignee_ids: z.array(uuidString).optional(),
  project_ids: z.array(uuidString).optional(),
});

type Params = { wsId: string; draftId: string };

async function verifyAccess(wsId: string, draftId: string) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: 'Unauthorized', status: 401, supabase, user: null };
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('ws_id')
    .eq('ws_id', wsId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return { error: 'Forbidden', status: 403, supabase, user };
  }

  const { data: draft, error: draftError } = await supabase
    .from('task_drafts')
    .select('*')
    .eq('id', draftId)
    .eq('ws_id', wsId)
    .eq('creator_id', user.id)
    .single();

  if (draftError || !draft) {
    return { error: 'Draft not found', status: 404, supabase, user };
  }

  return { draft, supabase, user, error: null, status: 200 };
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { wsId, draftId } = await params;
    const result = await verifyAccess(wsId, draftId);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ data: result.draft });
  } catch (error) {
    console.error('Error in GET /task-drafts/[draftId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { wsId, draftId } = await params;
    const result = await verifyAccess(wsId, draftId);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    const body = await request.json();
    const parsed = updateDraftSchema.parse(body);

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.description !== undefined)
      updateData.description = parsed.description;
    if (parsed.priority !== undefined) updateData.priority = parsed.priority;
    if (parsed.board_id !== undefined) updateData.board_id = parsed.board_id;
    if (parsed.list_id !== undefined) updateData.list_id = parsed.list_id;
    if (parsed.start_date !== undefined)
      updateData.start_date = parsed.start_date;
    if (parsed.end_date !== undefined) updateData.end_date = parsed.end_date;
    if (parsed.estimation_points !== undefined)
      updateData.estimation_points = parsed.estimation_points;
    if (parsed.label_ids !== undefined) updateData.label_ids = parsed.label_ids;
    if (parsed.assignee_ids !== undefined)
      updateData.assignee_ids = parsed.assignee_ids;
    if (parsed.project_ids !== undefined)
      updateData.project_ids = parsed.project_ids;

    const { data, error } = await result.supabase
      .from('task_drafts')
      .update(updateData)
      .eq('id', draftId)
      .select()
      .single();

    if (error) {
      console.error('Error updating draft:', error);
      return NextResponse.json(
        { error: 'Failed to update draft' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error in PUT /task-drafts/[draftId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { wsId, draftId } = await params;
    const result = await verifyAccess(wsId, draftId);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    const { error } = await result.supabase
      .from('task_drafts')
      .delete()
      .eq('id', draftId);

    if (error) {
      console.error('Error deleting draft:', error);
      return NextResponse.json(
        { error: 'Failed to delete draft' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /task-drafts/[draftId]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
